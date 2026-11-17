import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
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

const REFRESH_TOKEN_FILE = 'refresh-token.bin';

let accessToken: string | null = null;
let memoryRefreshToken: string | null = null;
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

const getRefreshTokenPath = () => path.join(app.getPath('userData'), REFRESH_TOKEN_FILE);

const saveRefreshToken = async (token: string): Promise<boolean> => {
  memoryRefreshToken = token;

  try {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      console.warn('Secure storage is unavailable; refresh token will only be kept in memory.');
      return false;
    }

    const encrypted = await safeStorage.encryptStringAsync(token);
    const tokenPath = getRefreshTokenPath();
    await fs.promises.mkdir(path.dirname(tokenPath), { recursive: true });
    await fs.promises.writeFile(tokenPath, encrypted, { mode: 0o600 });
    return true;
  } catch (error) {
    console.warn('Failed to persist refresh token:', error);
    return false;
  }
};

const getRefreshToken = async (): Promise<string | null> => {
  try {
    const encrypted = await fs.promises.readFile(getRefreshTokenPath());

    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      return memoryRefreshToken;
    }

    const { shouldReEncrypt, result } = await safeStorage.decryptStringAsync(encrypted);
    memoryRefreshToken = result;

    if (shouldReEncrypt) {
      await saveRefreshToken(result);
    }

    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('Failed to read refresh token:', error);
    }
    return memoryRefreshToken;
  }
};

const clearRefreshToken = async (): Promise<void> => {
  memoryRefreshToken = null;

  try {
    await fs.promises.unlink(getRefreshTokenPath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('Failed to delete refresh token:', error);
    }
  }
};

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

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 5000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchCurrentUser = async (
  token: string,
): Promise<{ user: any | null; status: number }> => {
  const response = await fetchWithTimeout(`${getSafeBaseUrl()}/api/v1/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    return { user: null, status: response.status };
  }

  return { user: JSON.parse(JSON.stringify(await response.json())), status: response.status };
};

const refreshAccessToken = async (): Promise<boolean> => {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetchWithTimeout(`${getSafeBaseUrl()}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      // The refresh token was rejected for good (expired or revoked).
      if (response.status === 401 || response.status === 403) {
        accessToken = null;
        await clearRefreshToken();
      }
      return false;
    }

    const data = await response.json();
    accessToken = data.access_token;

    if (data.refresh_token) {
      await saveRefreshToken(data.refresh_token);
    }

    return true;
  } catch (error) {
    console.error('Session refresh error:', error);
    return false;
  }
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
    await saveRefreshToken(data.refresh_token);
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
  const refreshToken = await getRefreshToken();
  
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
  await clearRefreshToken();
  return { success: true };
});

ipcMain.handle('auth:restore-session', async () => {
  // A renderer reload keeps the main process alive, so its access token may
  // still be valid. Validate it before falling back to the refresh token.
  if (accessToken) {
    try {
      const currentUser = await fetchCurrentUser(accessToken);
      if (currentUser.user) {
        return { success: true, user: currentUser.user };
      }
      if (currentUser.status !== 401) {
        return { success: false };
      }
    } catch (error) {
      console.error('Session restore error:', error);
      return { success: false };
    }

    accessToken = null;
  }

  const refreshed = await refreshAccessToken();
  if (!refreshed || !accessToken) {
    return { success: false };
  }

  try {
    const currentUser = await fetchCurrentUser(accessToken);
    if (currentUser.user) {
      return { success: true, user: currentUser.user };
    }
  } catch (error) {
    console.error('Session restore error:', error);
  }

  return { success: false };
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
    const refreshToken = await getRefreshToken();
    
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
          if (refreshData.refresh_token) {
            await saveRefreshToken(refreshData.refresh_token);
          }
          onRefreshed(accessToken);
          isRefreshing = false;
          result = await makeRequest(accessToken);
        } else {
          accessToken = null;
          await clearRefreshToken();
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