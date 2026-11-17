import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import keytar from 'keytar';
import Store from 'electron-store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Логируем путь, чтобы убедиться, что он ведет в dist-electron
const preloadPath = path.join(__dirname, 'preload.js');

const store = new Store({
  name: 'habitat-config',
  defaults: {
    serverBaseUrl: 'http://localhost:8080',
  },
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
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
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
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- IPC Handlers ---

ipcMain.handle('server:set-config', (event, baseUrl: string) => {
  store.set('serverBaseUrl', baseUrl);
  return { success: true };
});

ipcMain.handle('server:get-config', () => {
  const rawUrl = store.get('serverBaseUrl');
  // Защита: если вдруг в хранилище мусор, используем значение по умолчанию
  const safeUrl = typeof rawUrl === 'string' ? rawUrl : 'http://localhost:8080';
  return { serverBaseUrl: safeUrl };
});

ipcMain.handle('server:check-health', async () => {
  const rawUrl = store.get('serverBaseUrl');
  const baseUrl = typeof rawUrl === 'string' ? rawUrl : 'http://localhost:8080';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 3000);

  try {
    const response = await fetch(`${baseUrl}/healthz`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const text = await response.text();
      const isSuccess = text.trim() === 'ok';
      return { success: isSuccess };
    }
    return { success: false, error: `HTTP ${response.status}` };
  } catch (error: any) {
    clearTimeout(timeoutId);
    const errorMsg = error.name === 'AbortError' 
      ? 'Превышено время ожидания ответа сервера' 
      : error.message;
    return { success: false, error: errorMsg };
  }
});

ipcMain.handle('auth:save-refresh-token', async (event, token: string) => {
  try {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, token);
    return { success: true };
  } catch (error: any) {
    console.error('Failed to save refresh token:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth:get-refresh-token', async () => {
  try {
    const token = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    return token || null;
  } catch (error: any) {
    console.error('Failed to get refresh token:', error);
    return null;
  }
});

ipcMain.handle('auth:clear-tokens', async () => {
  accessToken = null;
  try {
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
    return { success: true };
  } catch (error: any) {
    console.error('Failed to clear tokens:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth:make-authenticated-request', async (event, url: string, options: RequestInit) => {
  const baseUrl = store.get('serverBaseUrl') as string;
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;

  const makeRequest = async (token: string | null) => {
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    headers.set('Content-Type', 'application/json');

    const response = await fetch(fullUrl, {
      ...options,
      headers,
    });

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
          // Refresh Rotation: сохраняем новый refresh-токен
          await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, refreshData.refresh_token);
          
          onRefreshed(accessToken);
          isRefreshing = false;
          
          // Повторяем упавший запрос
          result = await makeRequest(accessToken);
        } else {
          // Reuse Detection или отзыв сессии: Hard Logout
          accessToken = null;
          await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
          
          const windows = BrowserWindow.getAllWindows();
          windows.forEach(win => win.webContents.send('auth:forced-logout'));
          
          isRefreshing = false;
          return { status: 401, error: 'Session expired or revoked' };
        }
      } catch (error) {
        console.error('Refresh request failed:', error);
        isRefreshing = false;
        return { status: 500, error: 'Network error during refresh' };
      }
    } else {
      isRefreshing = false;
      return { status: 401, error: 'No refresh token available' };
    }
  } else if (result.status === 401 && isRefreshing) {
    // Ставим запрос на паузу и ждем завершения обновления токена
    const newToken = await new Promise<string>((resolve) => {
      subscribeToRefresh(resolve);
    });
    result = await makeRequest(newToken);
  }

  return result;
});