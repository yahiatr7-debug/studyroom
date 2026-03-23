export type Role = 'owner' | 'editor' | 'viewer';

export interface Room {
  id: string;
  name: string;
  ownerId: string;
  members: Record<string, Role>;
  createdAt: any;
}

export interface RoomItem {
  id: string;
  type: 'file' | 'group';
  parentId: string | null;
  name: string;
  content?: string;
  mimeType?: string;
  pinned: boolean;
  order: number;
  createdAt: any;
  updatedAt: any;
}

export interface WindowState {
  id: string;
  itemId: string;
  name: string;
  content: string;
  mimeType?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isPinned: boolean;
  zIndex: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  mentions?: string[];
  replyTo?: string;
  createdAt: any;
}
