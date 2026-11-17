import { contextBridge, ipcRenderer } from "electron";
// electron/preload.ts
contextBridge.exposeInMainWorld("electronAPI", {
	checkServerHealth: (url) => ipcRenderer.invoke("server:check-health", url),
	saveRefreshToken: (token) => ipcRenderer.invoke("auth:save-refresh-token", token),
	getRefreshToken: () => ipcRenderer.invoke("auth:get-refresh-token"),
	clearTokens: () => ipcRenderer.invoke("auth:clear-tokens"),
	makeAuthenticatedRequest: (url, options) => ipcRenderer.invoke("auth:make-authenticated-request", url, options),
	onForcedLogout: (callback) => {
		ipcRenderer.on("auth:forced-logout", callback);
		return () => ipcRenderer.removeAllListeners("auth:forced-logout");
	}
});
export {};
