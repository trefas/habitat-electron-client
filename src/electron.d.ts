import type { User } from './lib/types';

export {};

declare global {
  interface Window {
    electronAPI: {
      getServerConfig: () => Promise<{ serverBaseUrl: string }>;
      setServerConfig: (baseUrl: string) => Promise<{ success: boolean }>;
      checkServerHealth: () => Promise<{ success: boolean; error?: string }>;
      
      login: (credentials: { email: string; password: string }) => Promise<{ success: boolean; user?: User; error?: string }>;
      register: (data: { email: string; password: string; display_name: string }) => Promise<{ success: boolean; error?: string }>;
      logout: () => Promise<{ success: boolean }>;
      restoreSession: () => Promise<{ success: boolean; user?: User }>;
      
      makeAuthenticatedRequest: (url: string, options: RequestInit) => Promise<any>;
      onForcedLogout: (callback: () => void) => () => void;
    };
  }
}
