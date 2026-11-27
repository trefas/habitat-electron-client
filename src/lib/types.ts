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

export interface MessagePerson {
  id: string;
  email: string;
  display_name: string;
}

export interface MessageRecipient {
  user_id: string;
  email: string;
  display_name: string;
  read_at?: string | null;
  is_read: boolean;
}

export interface Message {
  id: string;
  text: string;
  sender: MessagePerson;
  is_owner: boolean;
  read_at?: string | null;
  is_read: boolean;
  recipients_count: number;
  read_count: number;
  recipients?: MessageRecipient[];
  created_at: string;
  updated_at: string;
}

export interface MessageListResponse {
  items: Message[];
  total: number;
  limit: number;
  offset: number;
}

export type NotificationKind =
  | 'share_received'
  | 'share_revoked'
  | 'share_expiring'
  | 'entity_copied'
  | 'entity_updated';

export interface AppNotification {
  id: string;
  kind: NotificationKind | string;
  entity_id?: string | null;
  share_id?: string | null;
  actor_id?: string | null;
  payload: Record<string, any>;
  read_at?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: AppNotification[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListItem {
  id: string;
  text: string;
  is_checked: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ListRecipient {
  user_id: string;
  email: string;
  display_name: string;
  permission: string;
  granted_at: string;
}

export interface HabitatList {
  id: string;
  title: string;
  owner: MessagePerson;
  is_owner: boolean;
  can_edit: boolean;
  permission: string;
  items_total: number;
  items_checked: number;
  recipients_count: number;
  items?: ListItem[];
  recipients?: ListRecipient[];
  created_at: string;
  updated_at: string;
}

export interface ListResponse {
  items: HabitatList[];
  total: number;
  limit: number;
  offset: number;
}

