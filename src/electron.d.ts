export {};

declare global {
  interface Window {
    electronAPI: {
      checkServerHealth: (url: string) => Promise<{ success: boolean; error?: string }>;
      saveRefreshToken: (token: string) => Promise<void>;
      getRefreshToken: () => Promise<string | null>;
      clearTokens: () => Promise<void>;
      makeAuthenticatedRequest: (url: string, options: RequestInit) => Promise<Response>;
      onForcedLogout: (callback: () => void) => () => void;
    };
  }
}