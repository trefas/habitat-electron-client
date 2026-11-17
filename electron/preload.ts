import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Health check
  checkServerHealth: (url: string) => ipcRenderer.invoke('server:check-health', url),
  
  // Authentication
  saveRefreshToken: (token: string) => ipcRenderer.invoke('auth:save-refresh-token', token),
  getRefreshToken: () => ipcRenderer.invoke('auth:get-refresh-token'),
  clearTokens: () => ipcRenderer.invoke('auth:clear-tokens'),
  
  // Make authenticated requests through Main process (token never exposed to renderer)
  makeAuthenticatedRequest: (url: string, options: RequestInit) => 
    ipcRenderer.invoke('auth:make-authenticated-request', url, options),
  
  // Listen for forced logout events
  onForcedLogout: (callback: () => void) => {
    ipcRenderer.on('auth:forced-logout', callback);
    return () => ipcRenderer.removeAllListeners('auth:forced-logout');
  },
});