import { app, BrowserWindow, ipcMain } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import keytar from 'keytar';
import Store from 'electron-store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LINUX_DESKTOP_FILE = 'com.habitat.client.desktop';
const LINUX_APP_ID = 'com.habitat.client';
const LINUX_ICON_NAME = 'habitat-client';

// Packaged builds get build/icon.png via electron-builder extraResources.
const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(__dirname, '../build/icon.png');

/**
 * GNOME (especially on Wayland) resolves an application's icon through its
 * .desktop file, not through the window itself. AppImages launched directly
 * are not integrated, so install a per-user desktop entry and icon on first
 * run. Deb/rpm packages already install these system-wide and skip this path.
 */
const setupLinuxDesktopIntegration = () => {
  const appImagePath = process.env.APPIMAGE;
  if (!appImagePath) return;

  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  const applicationsDir = path.join(dataHome, 'applications');
  const desktopFilePath = path.join(applicationsDir, LINUX_DESKTOP_FILE);

  const systemDataDirs = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share')
    .split(':')
    .filter(Boolean);

  if (systemDataDirs.some((dir) => fs.existsSync(path.join(dir, 'applications', LINUX_DESKTOP_FILE)))) {
    return;
  }

  // Escape characters that have special meaning inside a quoted Exec value.
  const execArg = appImagePath.replace(/([\\`"$])/g, '\\$1');
  const desktopEntry = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Habitat Client',
    'Comment=Desktop client for Habitat backend',
    `Exec="${execArg}" %U`,
    `Icon=${LINUX_ICON_NAME}`,
    'Terminal=false',
    'Categories=Utility;',
    `StartupWMClass=${LINUX_APP_ID}`,
    `X-AppImage-Version=${app.getVersion()}`,
    '',
  ].join('\n');

  const iconThemeDir = path.join(dataHome, 'icons', 'hicolor');
  const iconSizes = [16, 32, 48, 64, 128, 256, 512, 1024];

  try {
    fs.mkdirSync(applicationsDir, { recursive: true });

    let currentEntry = '';
    try {
      currentEntry = fs.readFileSync(desktopFilePath, 'utf8');
    } catch {
      // File does not exist yet.
    }

    if (currentEntry !== desktopEntry) {
      fs.writeFileSync(desktopFilePath, desktopEntry, { mode: 0o644 });
    }

    let iconsChanged = false;
    for (const size of iconSizes) {
      const iconSource = path.join(process.resourcesPath, 'icons', `${size}x${size}.png`);
      if (!fs.existsSync(iconSource)) continue;

      const iconTarget = path.join(iconThemeDir, `${size}x${size}`, 'apps', `${LINUX_ICON_NAME}.png`);
      const iconUpToDate = fs.existsSync(iconTarget)
        && fs.statSync(iconTarget).size === fs.statSync(iconSource).size;

      if (iconUpToDate) continue;

      fs.mkdirSync(path.dirname(iconTarget), { recursive: true });
      fs.copyFileSync(iconSource, iconTarget);
      iconsChanged = true;
    }

    if (iconsChanged) {
      // GTK-based desktops pick up new user icons more reliably with a cache.
      execFile('gtk-update-icon-cache', ['-f', '-t', iconThemeDir], () => {});
    }
  } catch (error) {
    console.warn('Failed to install AppImage desktop entry:', error);
  }
};

const store = new Store({
  name: 'habitat-config',
  defaults: { serverBaseUrl: 'http://localhost:8080' },
});

const SERVICE_NAME = 'habitat-client';
const ACCOUNT_NAME = 'refresh_token';

let accessToken: string | null = null;
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

const subscribeToRefresh = (callback: (token: string) => void) => {
  refreshSubscribers.push(callback);
};

const onRefreshed = (token: string) => {
  refreshSubscribers.forEach(callback => callback(token));
  refreshSubscribers = [];
};

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.setDesktopName(LINUX_DESKTOP_FILE);
  setupLinuxDesktopIntegration();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: fs.existsSync(appIconPath) ? appIconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  return mainWindow;
};

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const getSafeBaseUrl = (): string => {
  const rawUrl = store.get('serverBaseUrl');
  return typeof rawUrl === 'string' ? rawUrl : 'http://localhost:8080';
};

// --- Server Handlers ---

ipcMain.handle('server:get-config', () => ({ serverBaseUrl: getSafeBaseUrl() }));

ipcMain.handle('server:set-config', (event, baseUrl: string) => {
  store.set('serverBaseUrl', baseUrl);
  return { success: true };
});

ipcMain.handle('server:check-health', async () => {
  const baseUrl = getSafeBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${baseUrl}/healthz`, { method: 'GET', signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      const text = await response.text();
      return { success: text.trim() === 'ok' };
    }
    return { success: false, error: `HTTP ${response.status}` };
  } catch (error: any) {
    clearTimeout(timeoutId);
    return { success: false, error: error.name === 'AbortError' ? 'Превышено время ожидания' : error.message };
  }
});

// --- Auth Handlers ---

ipcMain.handle('auth:login', async (event, credentials: { email: string; password: string }) => {
  const baseUrl = getSafeBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.message || 'Ошибка авторизации' };
    }

    const data = await response.json();
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, data.refresh_token);
    accessToken = data.access_token;

    // Гарантируем чистую сериализацию для IPC
    return { success: true, user: JSON.parse(JSON.stringify(data.user)) };
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('Login error:', error.message);
    return { success: false, error: error.name === 'AbortError' ? 'Превышено время ожидания' : 'Ошибка сети' };
  }
});

ipcMain.handle('auth:register', async (event, data: { email: string; password: string; display_name: string }) => {
  const baseUrl = getSafeBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.message || 'Ошибка регистрации' };
    }
    return { success: true };
  } catch (error: any) {
    console.error('Register error:', error.message);
    return { success: false, error: 'Ошибка сети' };
  }
});

ipcMain.handle('auth:logout', async () => {
  const baseUrl = getSafeBaseUrl();
  const refreshToken = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
  
  if (refreshToken) {
    try {
      await fetch(`${baseUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
  
  accessToken = null;
  await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
  return { success: true };
});

ipcMain.handle('auth:save-refresh-token', async (event, token: string) => {
  try {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, token);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth:get-refresh-token', async () => {
  try {
    return (await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME)) || null;
  } catch (error) {
    return null;
  }
});

ipcMain.handle('auth:clear-tokens', async () => {
  accessToken = null;
  try {
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth:make-authenticated-request', async (event, url: string, options: RequestInit) => {
  const baseUrl = getSafeBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;

  const makeRequest = async (token: string | null) => {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('Content-Type', 'application/json');

    const response = await fetch(fullUrl, { ...options, headers });
    return {
      status: response.status,
      statusText: response.statusText,
      data: await response.json().catch(() => ({})),
    };
  };

  let result = await makeRequest(accessToken);

  if (result.status === 401 && !isRefreshing) {
    isRefreshing = true;
    const refreshToken = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    
    if (refreshToken) {
      try {
        const refreshResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          accessToken = refreshData.access_token;
          await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, refreshData.refresh_token);
          onRefreshed(accessToken);
          isRefreshing = false;
          result = await makeRequest(accessToken);
        } else {
          accessToken = null;
          await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
          BrowserWindow.getAllWindows().forEach(win => win.webContents.send('auth:forced-logout'));
          isRefreshing = false;
          return { status: 401, error: 'Session expired or revoked' };
        }
      } catch (error) {
        console.error('Refresh error:', error);
        isRefreshing = false;
        return { status: 500, error: 'Network error during refresh' };
      }
    } else {
      isRefreshing = false;
      return { status: 401, error: 'No refresh token available' };
    }
  } else if (result.status === 401 && isRefreshing) {
    const newToken = await new Promise<string>((resolve) => subscribeToRefresh(resolve));
    result = await makeRequest(newToken);
  }

  return result;
});