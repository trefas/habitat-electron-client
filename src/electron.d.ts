export {};

declare global {
  interface Window {
    electronAPI: {
      getServerConfig: () => Promise<{ serverBaseUrl: string }>;
      setServerConfig: (baseUrl: string) => Promise<{ success: boolean }>;
      checkServerHealth: () => Promise<{ success: boolean; error?: string }>;
      saveRefreshToken: (token: string) => Promise<{ success: boolean; error?: string }>;
      getRefreshToken: () => Promise<string | null>;
      clearTokens: () => Promise<{ success: boolean; error?: string }>;
      makeAuthenticatedRequest: (url: string, options: RequestInit) => Promise<any>;
      onForcedLogout: (callback: () => void) => () => void;
    };
  }
}