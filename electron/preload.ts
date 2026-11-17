import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  getServerConfig: () => ipcRenderer.invoke('server:get-config'),
  setServerConfig: (baseUrl: string) => ipcRenderer.invoke('server:set-config', baseUrl),
  checkServerHealth: () => ipcRenderer.invoke('server:check-health'),
  
  login: (credentials: { email: string; password: string }) => 
    ipcRenderer.invoke('auth:login', credentials),
  register: (data: { email: string; password: string; display_name: string }) => 
    ipcRenderer.invoke('auth:register', data),
  logout: () => ipcRenderer.invoke('auth:logout'),
  restoreSession: () => ipcRenderer.invoke('auth:restore-session'),
  
  makeAuthenticatedRequest: (url: string, options: RequestInit) => 
    ipcRenderer.invoke('auth:make-authenticated-request', url, options),
  
  onForcedLogout: (callback: () => void) => {
    ipcRenderer.on('auth:forced-logout', callback);
    return () => ipcRenderer.removeAllListeners('auth:forced-logout');
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);