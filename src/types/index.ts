export interface Homemate {
  id: string;
  name: string;
  avatar: string;
  color: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  payerId: string;
  splitMethod: 'equal' | 'percentage' | 'custom';
  shares: Record<string, number>; // user id -> amount owed
  date: string;
  visibility: string[]; // user ids who can see this
}

export interface ShelfItem {
  id: string;
  name: string;
  status: 'stocked' | 'low' | 'out';
  addedById: string;
  priority: 'high' | 'medium' | 'low';
  visibility: string[]; // user ids
  timestamp: string;
  restockedAt?: string; // for the 48 hour countdown
}

export interface RunRequest {
  id: string;
  itemName: string;
  requesterId: string;
  status: 'pending' | 'searching' | 'found' | 'out' | 'replaced';
  price?: number;
  replacementName?: string;
  replacementPrice?: number;
}

export interface RunSession {
  id: string;
  shopperId: string;
  store: string;
  status: 'active' | 'completed';
  requests: RunRequest[];
}

export interface ChatMessage {
  id: string;
  senderId: string; // 'system' or user id
  text: string;
  timestamp: string;
  reactions?: Record<string, string>; // userId -> emoji
}

export interface Task {
  id: string;
  title: string;
  assignedTo: string[]; // user ids
  dueDate: string;
  completed: boolean;
  frequency: 'once' | 'daily' | 'weekly' | 'monthly';
}

export interface PulseAlert {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'alert' | 'success';
  timestamp: string;
  read: boolean;
}
