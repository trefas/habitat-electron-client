// src/lib/api.ts

export interface ApiResponse {
  status: number;
  statusText: string;
  data: any;
}

export async function apiRequest(url: string, options: RequestInit = {}): Promise<any> {
  // Делегируем выполнение защищенному интерцептору в Main процессе
  const response: ApiResponse = await window.electronAPI.makeAuthenticatedRequest(url, options);
  
  // Если сервер вернул ошибку (4xx или 5xx), выбрасываем исключение
  if (response.status >= 400) {
    const error = new Error(response.data.message || response.data.error || response.statusText || 'Request failed');
    (error as any).status = response.status;
    (error as any).data = response.data;
    throw error;
  }
  
  return response.data;
}

export const api = {
  get: (url: string, options?: RequestInit) => 
    apiRequest(url, { ...options, method: 'GET' }),
    
  post: (url: string, body?: any, options?: RequestInit) => 
    apiRequest(url, { 
      ...options, 
      method: 'POST', 
      body: body ? JSON.stringify(body) : undefined 
    }),
    
  put: (url: string, body?: any, options?: RequestInit) => 
    apiRequest(url, { 
      ...options, 
      method: 'PUT', 
      body: body ? JSON.stringify(body) : undefined 
    }),
    
  delete: (url: string, options?: RequestInit) => 
    apiRequest(url, { ...options, method: 'DELETE' }),
};