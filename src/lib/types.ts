export type UserRole = 'user' | 'admin';
export type UserStatus = 'pending' | 'active' | 'blocked';

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: UserRole | string;
  status?: UserStatus | string;
  created_at?: string;
  updated_at?: string;
  last_login_at?: string | null;
}

export interface UserListResponse {
  items: User[];
  total: number;
  limit: number;
  offset: number;
}
