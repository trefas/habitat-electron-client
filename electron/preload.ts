import { contextBridge, ipcRenderer } from 'electron';

try {
  console.log('[Preload] preload.ts начал выполнение');

  const electronAPI = {
    getServerConfig: () => {
      console.log('[Preload] Вызван getServerConfig');
      return ipcRenderer.invoke('server:get-config');
    },
    setServerConfig: (baseUrl: string) => {
      console.log('[Preload] Вызван setServerConfig', baseUrl);
      return ipcRenderer.invoke('server:set-config', baseUrl);
    },
    checkServerHealth: () => {
      console.log('[Preload] Вызван checkServerHealth');
      return ipcRenderer.invoke('server:check-health');
    },
    saveRefreshToken: (token: string) => ipcRenderer.invoke('auth:save-refresh-token', token),
    getRefreshToken: () => ipcRenderer.invoke('auth:get-refresh-token'),
    clearTokens: () => ipcRenderer.invoke('auth:clear-tokens'),
    makeAuthenticatedRequest: (url: string, options: RequestInit) => 
      ipcRenderer.invoke('auth:make-authenticated-request', url, options),
    onForcedLogout: (callback: () => void) => {
      ipcRenderer.on('auth:forced-logout', callback);
      return () => ipcRenderer.removeAllListeners('auth:forced-logout');
    },
  };

  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  console.log('[Preload] electronAPI успешно добавлен в window');
} catch (error) {
  console.error('[Preload] КРИТИЧЕСКАЯ ОШИБКА в preload.ts:', error);
}