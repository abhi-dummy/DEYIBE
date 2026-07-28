import type { Homemate, ShelfItem, Expense, ChatMessage, Task, PulseAlert } from '../types';

export const initialHomemates: Homemate[] = [
  { id: '1', name: 'Abhi', avatar: 'AB', color: '#6366f1' }, // Indigo
  { id: '2', name: 'Sandeep', avatar: 'SP', color: '#3b82f6' }, // Blue
  { id: '3', name: 'Karthik', avatar: 'KT', color: '#10b981' }, // Emerald
  { id: '4', name: 'Divya', avatar: 'DY', color: '#f43f5e' } // Rose
];

export const initialShelfItems: ShelfItem[] = [
  { id: 's1', name: 'Almond Milk', status: 'low', addedById: '2', priority: 'medium', visibility: ['1', '2', '3', '4'], timestamp: '2h ago' },
  { id: 's2', name: 'Greek Yogurt', status: 'stocked', addedById: '1', priority: 'low', visibility: ['1', '4'], timestamp: '1d ago' },
  { id: 's3', name: 'Toilet Paper', status: 'out', addedById: '4', priority: 'high', visibility: ['1', '2', '3', '4'], timestamp: '3h ago' },
  { id: 's4', name: 'Coffee Beans', status: 'low', addedById: '3', priority: 'high', visibility: ['1', '2', '3'], timestamp: 'Just now' },
  { id: 's5', name: 'Dish Soap', status: 'stocked', addedById: '1', priority: 'low', visibility: ['1', '2', '3', '4'], timestamp: '3d ago' }
];

export const initialExpenses: Expense[] = [
  {
    id: 'e1',
    title: 'High-speed Wi-Fi subscription',
    amount: 60.00,
    payerId: '2',
    splitMethod: 'equal',
    shares: { '1': 15.00, '2': 15.00, '3': 15.00, '4': 15.00 },
    date: 'July 24, 2026',
    visibility: ['1', '2', '3', '4']
  },
  {
    id: 'e2',
    title: 'Dishwasher Pods & Trash Bags',
    amount: 28.50,
    payerId: '1',
    splitMethod: 'equal',
    shares: { '1': 7.12, '2': 7.12, '3': 7.13, '4': 7.13 },
    date: 'July 26, 2026',
    visibility: ['1', '2', '3', '4']
  },
  {
    id: 'e3',
    title: 'Living Room Area Rug',
    amount: 120.00,
    payerId: '4',
    splitMethod: 'custom',
    shares: { '1': 40.00, '2': 40.00, '4': 40.00 },
    date: 'July 20, 2026',
    visibility: ['1', '2', '4']
  }
];

export const initialChatMessages: ChatMessage[] = [
  { id: 'm1', senderId: '2', text: 'Has the electricity bill for this month been settled yet?', timestamp: '6:15 PM' },
  { id: 'm2', senderId: '1', text: 'Yes, I paid it yesterday. I will log it in Split tonight.', timestamp: '6:18 PM' },
  { id: 'm3', senderId: '4', text: 'Great, thank you! Also, we are completely out of toilet paper on the master bathroom Shelf.', timestamp: '6:22 PM' },
  { id: 'm4', senderId: '3', text: 'Added it to Shelf requirements. We should restock it soon.', timestamp: '6:23 PM' }
];

export const initialTasks: Task[] = [
  { id: 't1', title: 'Dispose of kitchen waste and recycling', assignedTo: ['1', '3'], dueDate: 'Today', completed: false, frequency: 'weekly' },
  { id: 't2', title: 'Wipe kitchen counters and stove top', assignedTo: ['2'], dueDate: 'Tomorrow', completed: false, frequency: 'daily' },
  { id: 't3', title: 'Clean bathroom and vanity area', assignedTo: ['4'], dueDate: 'July 30', completed: true, frequency: 'weekly' },
  { id: 't4', title: 'Settle monthly utility statement', assignedTo: ['1'], dueDate: 'July 28', completed: true, frequency: 'monthly' }
];

export const initialPulseAlerts: PulseAlert[] = [
  { id: 'a1', title: 'Stock Alert', message: 'Divya reported Toilet Paper as OUT OF STOCK.', type: 'alert', timestamp: '3 hours ago', read: false },
  { id: 'a2', title: 'Cost Logged', message: 'Sandeep added Wi-Fi invoice ($60.00). Balance pending: $15.00.', type: 'info', timestamp: 'Yesterday', read: true },
  { id: 'a3', title: 'Task Completed', message: 'Divya completed "Clean bathroom and vanity area".', type: 'success', timestamp: '5 hours ago', read: false }
];
