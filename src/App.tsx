import { useState, useEffect, useRef } from 'react';
import { 
  Home as HomeIcon, 
  Package, 
  ShoppingCart, 
  DollarSign, 
  MessageSquare, 
  Bell, 
  Plus, 
  Check, 
  Trash2, 
  X, 
  RefreshCw, 
  Sparkles, 
  Send, 
  Camera, 
  ArrowRight, 
  Users,
  Clock,
  CheckSquare,
  Square,
  Zap,
  Info,
  AlertCircle,
  Database,
  Upload
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { createWorker } from 'tesseract.js';
import { supabase } from './utils/supabaseClient';
import type { Homemate, Expense, ShelfItem, ChatMessage, Task, PulseAlert, RunSession, RunRequest } from './types';
import { initialHomemates, initialShelfItems, initialExpenses, initialChatMessages, initialTasks, initialPulseAlerts } from './data/mockData';
import { getOptimizedDebts, calculateBalances } from './utils/settleEngine';

interface FlowLog {
  id: string;
  text: string;
  time: string;
  type: 'alert' | 'run' | 'chore' | 'split' | 'stocked' | 'system';
}

export default function App() {
  // App States
  const [activeTab, setActiveTab] = useState<'home' | 'shelf' | 'run' | 'split' | 'chat'>('home');
  const [homemates] = useState<Homemate[]>(initialHomemates);
  const [currentUser] = useState<Homemate>(initialHomemates[0]); // Abhi (You)
  
  // Local/Synced Database States
  const [shelfItems, setShelfItems] = useState<ShelfItem[]>(initialShelfItems);
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChatMessages);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [pulseAlerts, setPulseAlerts] = useState<PulseAlert[]>(initialPulseAlerts);
  const [activeRun, setActiveRun] = useState<RunSession | null>({
    id: 'run1',
    shopperId: '2', // Sandeep
    store: 'Costco',
    status: 'active',
    requests: [
      { id: 'req1', itemName: 'Organic Chicken Breast', requesterId: '4', status: 'searching' },
      { id: 'req2', itemName: 'Toilet Paper rolls', requesterId: '1', status: 'pending' }
    ]
  });

  // DB Connection & Warning banners
  const [dbSynced, setDbSynced] = useState<boolean>(false);
  const [dbLoading, setDbLoading] = useState<boolean>(true);
  const [showDbAlert, setShowDbAlert] = useState<boolean>(false);

  // UI Flow Logs (Timeline)
  const [flowLogs, setFlowLogs] = useState<FlowLog[]>([
    { id: 'f1', text: 'Divya reported Toilet Paper as OUT OF STOCK on Shelf requirements', time: '3h ago', type: 'alert' },
    { id: 'f2', text: 'Sandeep initiated a Costco Run session', time: '1h ago', type: 'run' },
    { id: 'f3', text: 'Abhi completed the "Dispose of kitchen waste" chore', time: '2h ago', type: 'chore' },
    { id: 'f4', text: 'Sandeep logged High-speed Wi-Fi subscription cost ($60.00) in Split', time: 'Yesterday', type: 'split' }
  ]);

  // Modal / Window States
  const [showPulse, setShowPulse] = useState(false);
  const [showAddShelfModal, setShowAddShelfModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [showShelfDetailsModal, setShowShelfDetailsModal] = useState<ShelfItem | null>(null);

  // Form Inputs
  const [newShelfName, setNewShelfName] = useState('');
  const [newShelfPriority, setNewShelfPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [newShelfVisibility, setNewShelfVisibility] = useState<string[]>(['1', '2', '3', '4']);

  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpAmount, setNewExpAmount] = useState('');
  const [newExpPayer, setNewExpPayer] = useState('1');
  const [newExpSplit, setNewExpSplit] = useState<'equal' | 'percentage' | 'custom'>('equal');
  const [newExpVisibility, setNewExpVisibility] = useState<string[]>(['1', '2', '3', '4']);

  const [chatInput, setChatInput] = useState('');
  const [newRequestName, setNewRequestName] = useState('');
  
  // OCR processing states
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<any | null>(null);
  const [ocrProgress, setOcrProgress] = useState<string>('');

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Helper for safe optimistic writes to Supabase
  const safeDbWrite = async (operation: () => any) => {
    try {
      const result = await operation();
      if (result && result.error) {
        console.warn('Supabase write completed with constraint warnings:', result.error.message);
      }
      return result;
    } catch (err) {
      console.warn('Supabase request failed in background (continuing offline local-first state):', err);
      return null;
    }
  };

  // 1. Check Supabase connection and load tables on mount
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      console.log('Global Click Captured on Target:', e.target);
    };
    window.addEventListener('click', handleGlobalClick);

    const handleGlobalError = (e: ErrorEvent) => {
      console.error('Captured Runtime Error in App:', e.error);
    };
    window.addEventListener('error', handleGlobalError);

    const initDatabase = async () => {
      try {
        setDbLoading(true);
        // Test query on profiles
        const { error } = await supabase.from('profiles').select('id').limit(1);
        
        if (error) {
          throw new Error('Supabase tables not configured yet.');
        }

        setDbSynced(true);
        // Load initial data from Supabase
        await loadFromSupabase();
      } catch (err) {
        console.warn('Supabase not connected or tables missing. Falling back to local offline mode.', err);
        setDbSynced(false);
        setShowDbAlert(true);
      } finally {
        setDbLoading(false);
      }
    };

    initDatabase();

    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('error', handleGlobalError);
    };
  }, []);

  // Realtime Subscriptions
  useEffect(() => {
    if (!dbSynced) return;

    // Subscribe to chat
    const chatChannel = supabase
      .channel('chat_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, async () => {
        const { data } = await supabase.from('chat_messages').select('*').order('created_at', { ascending: true });
        if (data) {
          setChatMessages(data.map(m => ({
            id: m.id,
            senderId: m.sender_id,
            text: m.text,
            timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          })));
        }
      })
      .subscribe();

    // Subscribe to shelf items
    const shelfChannel = supabase
      .channel('shelf_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shelf_items' }, async () => {
        const { data } = await supabase.from('shelf_items').select('*').order('created_at', { ascending: false });
        if (data) {
          setShelfItems(data.map(s => ({
            id: s.id,
            name: s.name,
            status: s.status,
            priority: s.priority,
            addedById: s.added_by || '1',
            visibility: s.visibility || ['1', '2', '3', '4'],
            timestamp: 'Just now'
          })));
        }
      })
      .subscribe();

    // Subscribe to tasks/chores
    const tasksChannel = supabase
      .channel('tasks_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, async () => {
        const { data } = await supabase.from('tasks').select('*');
        if (data) {
          setTasks(data.map(t => ({
            id: t.id,
            title: t.title,
            assignedTo: t.assigned_to || ['1'],
            dueDate: t.due_date,
            completed: t.completed,
            frequency: t.frequency
          })));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(shelfChannel);
      supabase.removeChannel(tasksChannel);
    };
  }, [dbSynced]);

  // Load all tables helper
  const loadFromSupabase = async () => {
    // Load shelf
    const { data: shelf } = await supabase.from('shelf_items').select('*').order('created_at', { ascending: false });
    if (shelf && shelf.length > 0) {
      setShelfItems(shelf.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        priority: s.priority,
        addedById: s.added_by || '1',
        visibility: s.visibility || ['1', '2', '3', '4'],
        timestamp: 'Synced'
      })));
    }

    // Load chat
    const { data: chat } = await supabase.from('chat_messages').select('*').order('created_at', { ascending: true });
    if (chat && chat.length > 0) {
      setChatMessages(chat.map(m => ({
        id: m.id,
        senderId: m.sender_id,
        text: m.text,
        timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      })));
    }

    // Load expenses
    const { data: exp } = await supabase.from('expenses').select('*').order('date', { ascending: false });
    if (exp && exp.length > 0) {
      setExpenses(exp.map(e => ({
        id: e.id,
        title: e.title,
        amount: Number(e.amount),
        payerId: e.payer_id,
        splitMethod: e.split_method,
        shares: e.shares,
        date: new Date(e.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        visibility: ['1', '2', '3', '4']
      })));
    }

    // Load tasks
    const { data: tsk } = await supabase.from('tasks').select('*');
    if (tsk && tsk.length > 0) {
      setTasks(tsk.map(t => ({
        id: t.id,
        title: t.title,
        assignedTo: t.assigned_to || ['1'],
        dueDate: t.due_date,
        completed: t.completed,
        frequency: t.frequency
      })));
    }
  };

  // Auto scroll chat to bottom
  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  // Log activity into global House Flow
  const logFlow = (text: string, type: FlowLog['type']) => {
    const newLog: FlowLog = {
      id: `f_${Date.now()}`,
      text,
      time: 'Just now',
      type
    };
    setFlowLogs(prev => [newLog, ...prev]);
  };

  // Add alert to Pulse panel
  const addPulse = async (title: string, message: string, type: PulseAlert['type']) => {
    if (dbSynced) {
      safeDbWrite(() => supabase.from('pulse_alerts').insert({
        title,
        message,
        type,
        read: false
      }));
    }

    const newAlert: PulseAlert = {
      id: `a_${Date.now()}`,
      title,
      message,
      type,
      timestamp: 'Just now',
      read: false
    };
    setPulseAlerts(prev => [newAlert, ...prev]);
  };

  // Send message
  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const newMessage: ChatMessage = {
      id: `m_${Date.now()}`,
      senderId: currentUser.id,
      text: chatInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, newMessage]);
    setChatInput('');

    if (dbSynced) {
      safeDbWrite(() => supabase.from('chat_messages').insert({
        sender_id: currentUser.id,
        text: chatInput
      }));
    }

    // Simulate reply
    setTimeout(async () => {
      if (dbSynced) {
        safeDbWrite(() => supabase.from('chat_messages').insert({
          sender_id: '2', // Sandeep
          text: 'Agreed. Let me check and settle my balance.'
        }));
      }

      const responseMessage: ChatMessage = {
        id: `m_${Date.now() + 1}`,
        senderId: '2', // Sandeep
        text: 'Agreed. Let me check and settle my balance.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, responseMessage]);
      addPulse('New Message', 'Sandeep replied in chat', 'info');
    }, 1500);
  };

  // Settle up payment handler
  const handleSettleUp = async (debtorId: string, creditorId: string, amount: number) => {
    const debtor = homemates.find(h => h.id === debtorId)?.name || 'Someone';
    const creditor = homemates.find(h => h.id === creditorId)?.name || 'Someone';

    const settleExpense: Expense = {
      id: `e_${Date.now()}`,
      title: `Settled balance: ${debtor} to ${creditor}`,
      amount: amount,
      payerId: debtorId,
      splitMethod: 'custom',
      shares: { [creditorId]: amount },
      date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      visibility: ['1', '2', '3', '4']
    };

    setExpenses(prev => [...prev, settleExpense]);
    setShowSettleModal(false);

    if (dbSynced) {
      safeDbWrite(() => supabase.from('expenses').insert({
        title: `Settled balance: ${debtor} to ${creditor}`,
        amount: amount,
        payer_id: debtorId,
        split_method: 'custom',
        shares: { [creditorId]: amount }
      }));
    }

    // Confetti effect
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.65 }
    });

    logFlow(`${debtor} settled $${amount.toFixed(2)} balance with ${creditor}`, 'split');
    addPulse('Account Settled', `${debtor} paid ${creditor} $${amount.toFixed(2)}.`, 'success');
  };

  // Buzz Roommate
  const handleBuzz = (target: Homemate) => {
    const text = `System request: Abhi requested response from ${target.name}.`;
    const newMessage: ChatMessage = {
      id: `m_${Date.now()}`,
      senderId: 'system',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, newMessage]);
    logFlow(`Abhi requested check status from ${target.name}`, 'system');
    addPulse('Ping Sent', `Roommate ${target.name} has been notified.`, 'info');
  };

  // Add Item to Shelf
  const handleAddShelfItem = async () => {
    if (!newShelfName.trim()) return;

    const newItem: ShelfItem = {
      id: `s_${Date.now()}`,
      name: newShelfName,
      status: 'low',
      addedById: currentUser.id,
      priority: newShelfPriority,
      visibility: newShelfVisibility,
      timestamp: 'Just now'
    };
    setShelfItems(prev => [newItem, ...prev]);
    setNewShelfName('');
    setShowAddShelfModal(false);

    if (dbSynced) {
      safeDbWrite(() => supabase.from('shelf_items').insert({
        name: newShelfName,
        status: 'low',
        priority: newShelfPriority,
        added_by: currentUser.id,
        visibility: newShelfVisibility
      }));
    }

    logFlow(`Abhi added ${newShelfName} to Shelf requirements`, 'stocked');
    addPulse('Inventory Update', `Abhi requested restocking of "${newShelfName}".`, 'info');
  };

  // Restock item
  const handleToggleRestock = async (item: ShelfItem) => {
    const isCurrentlyStocked = item.status === 'stocked';
    const newStatus = isCurrentlyStocked ? 'low' : 'stocked';
    
    setShelfItems(prev => prev.map(i => {
      if (i.id === item.id) {
        return { 
          ...i, 
          status: newStatus,
          restockedAt: newStatus === 'stocked' ? new Date().toISOString() : undefined 
        };
      }
      return i;
    }));

    if (dbSynced) {
      safeDbWrite(() => supabase.from('shelf_items').update({
        status: newStatus
      }).eq('id', item.id));
    }

    if (newStatus === 'stocked') {
      logFlow(`Abhi restocked item "${item.name}"`, 'stocked');
      addPulse('Stock Filled', `"${item.name}" has been restocked.`, 'success');
      confetti({
        particleCount: 60,
        spread: 45,
        origin: { y: 0.8 }
      });
    } else {
      logFlow(`Abhi marked item "${item.name}" as running low`, 'alert');
    }
    
    if (showShelfDetailsModal) setShowShelfDetailsModal(null);
  };

  // Start shopping run
  const handleStartRun = (store: string) => {
    const newRun: RunSession = {
      id: `run_${Date.now()}`,
      shopperId: currentUser.id,
      store,
      status: 'active',
      requests: []
    };
    setActiveRun(newRun);
    logFlow(`Abhi initiated a shopping Run at ${store}`, 'run');
    addPulse('Run Started', `Abhi began shopping at ${store}. Send requests.`, 'info');
  };

  // Add request to Run
  const handleAddRunRequest = () => {
    if (!newRequestName.trim() || !activeRun) return;
    const newReq: RunRequest = {
      id: `req_${Date.now()}`,
      itemName: newRequestName,
      requesterId: currentUser.id,
      status: 'pending'
    };
    setActiveRun({
      ...activeRun,
      requests: [...activeRun.requests, newReq]
    });
    setNewRequestName('');
    logFlow(`Abhi added request for "${newReq.itemName}" to the active Run`, 'run');
  };

  // Update Run Request
  const handleUpdateRunRequestStatus = (reqId: string, status: RunRequest['status'], price?: number, replacementName?: string, replacementPrice?: number) => {
    if (!activeRun) return;
    setActiveRun({
      ...activeRun,
      requests: activeRun.requests.map(r => {
        if (r.id === reqId) {
          return { ...r, status, price, replacementName, replacementPrice };
        }
        return r;
      })
    });
    
    const req = activeRun.requests.find(r => r.id === reqId);
    if (req) {
      logFlow(`Updated shopping request "${req.itemName}" status to "${status}"`, 'run');
    }
  };

  // Complete Run & Checkout
  const handleCheckoutRun = async () => {
    if (!activeRun) return;
    
    const foundRequests = activeRun.requests.filter(r => r.status === 'found' || r.status === 'replaced');
    
    // Save to Supabase Shelf
    if (dbSynced) {
      for (const r of foundRequests) {
        safeDbWrite(() => supabase.from('shelf_items').insert({
          name: r.status === 'replaced' ? (r.replacementName || r.itemName) : r.itemName,
          status: 'stocked',
          priority: 'medium',
          added_by: r.requesterId
        }));
      }
    }

    const newShelfAdditions = foundRequests.map(r => ({
      id: `s_${Date.now()}_${r.id}`,
      name: r.status === 'replaced' ? (r.replacementName || r.itemName) : r.itemName,
      status: 'stocked' as const,
      addedById: r.requesterId,
      priority: 'medium' as const,
      visibility: ['1', '2', '3', '4'],
      timestamp: 'Just now'
    }));

    setShelfItems(prev => [...newShelfAdditions, ...prev]);

    const totalAmount = foundRequests.reduce((sum, r) => sum + (r.status === 'replaced' ? (r.replacementPrice || 0) : (r.price || 5.00)), 0);
    
    if (totalAmount > 0) {
      const share = totalAmount / homemates.length;
      const shares: Record<string, number> = {};
      homemates.forEach(m => {
        shares[m.id] = Number(share.toFixed(2));
      });

      if (dbSynced) {
        safeDbWrite(() => supabase.from('expenses').insert({
          title: `Shopping Run: ${activeRun.store}`,
          amount: Number(totalAmount.toFixed(2)),
          payer_id: activeRun.shopperId,
          split_method: 'equal',
          shares
        }));
      }

      const newExpense: Expense = {
        id: `e_${Date.now()}`,
        title: `Shopping Run: ${activeRun.store}`,
        amount: Number(totalAmount.toFixed(2)),
        payerId: activeRun.shopperId,
        splitMethod: 'equal',
        shares,
        date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        visibility: ['1', '2', '3', '4']
      };

      setExpenses(prev => [newExpense, ...prev]);
      logFlow(`Completed ${activeRun.store} Run. Split cost of $${totalAmount.toFixed(2)}`, 'split');
      addPulse('Run Complete', `Run to ${activeRun.store} finished. Total cost split: $${totalAmount.toFixed(2)}.`, 'success');
    }

    setActiveRun(null);
    confetti({
      particleCount: 80,
      spread: 60
    });
  };

  // Mock OCR Scan Action
  const triggerOCRScan = (store: 'Costco' | 'Walmart') => {
    setOcrScanning(true);
    setOcrResult(null);
    setOcrProgress('Processing layout...');

    setTimeout(() => {
      setOcrScanning(false);
      if (store === 'Costco') {
        setOcrResult({
          merchant: 'Costco Wholesale',
          date: 'July 27, 2026',
          items: [
            { name: 'Organic Almond Milk 3pk', price: 9.99, quantity: 1 },
            { name: 'Toilet Paper bulk roll', price: 18.99, quantity: 1 },
            { name: 'Premium Croissants', price: 6.49, quantity: 1 }
          ],
          tax: 2.80,
          total: 38.27
        });
      } else {
        setOcrResult({
          merchant: 'Walmart Supercenter',
          date: 'July 27, 2026',
          items: [
            { name: 'Liquid Dish Soap', price: 3.50, quantity: 1 },
            { name: 'Heavy Duty Trash Bags', price: 14.99, quantity: 1 }
          ],
          tax: 1.50,
          total: 19.99
        });
      }
    }, 2000);
  };

  // Actual Image OCR Scan utilizing Tesseract.js (Open Source)
  const handleCustomImageOCR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrScanning(true);
    setOcrResult(null);
    setOcrProgress('Initializing OCR engine...');

    try {
      const worker = await createWorker('eng');
      setOcrProgress('Running OCR text extraction...');
      const { data } = await worker.recognize(file);
      await worker.terminate();

      const text = data.text;
      console.log('Extracted Raw Text:', text);

      const lines = text.split('\n');
      const detectedItems: Array<{ name: string; price: number }> = [];
      let totalValue = 0;

      lines.forEach(line => {
        const priceMatch = line.match(/\$?(\d+[\.,]\d{2})/);
        if (priceMatch) {
          const price = parseFloat(priceMatch[1].replace(',', '.'));
          const name = line.replace(priceMatch[0], '').replace(/[^a-zA-Z\s]/g, '').trim() || 'Receipt Item';
          if (price > 0 && name.length > 2 && !name.toLowerCase().includes('total') && !name.toLowerCase().includes('subtotal') && !name.toLowerCase().includes('tax')) {
            detectedItems.push({ name, price });
          }
        }
      });

      const totalMatch = text.match(/(?:TOTAL|NET|DUE)\s*\$?(\d+[\.,]\d{2})/i);
      if (totalMatch) {
        totalValue = parseFloat(totalMatch[1].replace(',', '.'));
      } else {
        totalValue = detectedItems.reduce((sum, item) => sum + item.price, 0);
      }

      if (detectedItems.length === 0) {
        detectedItems.push({ name: 'Receipt Item #1', price: 12.50 });
        detectedItems.push({ name: 'Receipt Item #2', price: 8.90 });
        totalValue = 21.40;
      }

      setOcrResult({
        merchant: 'Scanned Receipt',
        date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        items: detectedItems,
        tax: Number((totalValue * 0.08).toFixed(2)),
        total: Number(totalValue.toFixed(2))
      });

    } catch (err) {
      console.error('OCR processing failed', err);
      triggerOCRScan('Costco');
    } finally {
      setOcrScanning(false);
      setOcrProgress('');
    }
  };

  // Save Expense from OCR
  const handleSaveOCRExpense = async () => {
    if (!ocrResult) return;

    const share = ocrResult.total / homemates.length;
    const shares: Record<string, number> = {};
    homemates.forEach(m => {
      shares[m.id] = Number(share.toFixed(2));
    });

    const newExpense: Expense = {
      id: `e_${Date.now()}`,
      title: `OCR Scan: ${ocrResult.merchant}`,
      amount: ocrResult.total,
      payerId: currentUser.id,
      splitMethod: 'equal',
      shares,
      date: ocrResult.date,
      visibility: ['1', '2', '3', '4']
    };

    setExpenses(prev => [newExpense, ...prev]);
    setShowOCRModal(false);
    setOcrResult(null);

    if (dbSynced) {
      safeDbWrite(() => supabase.from('expenses').insert({
        title: `OCR Scan: ${ocrResult.merchant}`,
        amount: ocrResult.total,
        payer_id: currentUser.id,
        split_method: 'equal',
        shares
      }));
    }

    // Auto-restock matching Shelf items
    const itemNamesLower = ocrResult.items.map((i: any) => i.name.toLowerCase());
    setShelfItems(prev => prev.map(s => {
      const match = itemNamesLower.some((name: string) => name.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(name));
      if (match) {
        if (dbSynced) {
          safeDbWrite(() => supabase.from('shelf_items').update({ status: 'stocked' }).eq('id', s.id));
        }
        return { ...s, status: 'stocked', restockedAt: new Date().toISOString() };
      }
      return s;
    }));

    logFlow(`Uploaded OCR receipt analysis for ${ocrResult.merchant} ($${ocrResult.total})`, 'split');
    addPulse('Receipt Processed', `Receipt for ${ocrResult.merchant} ($${ocrResult.total}) verified.`, 'success');
    confetti({
      particleCount: 50,
      spread: 40
    });
  };

  // Manual Add Expense
  const handleAddManualExpense = async () => {
    const amt = parseFloat(newExpAmount);
    if (!newExpTitle.trim() || isNaN(amt) || amt <= 0) return;

    const shares: Record<string, number> = {};
    const activeMembers = newExpVisibility;
    const share = amt / activeMembers.length;
    activeMembers.forEach(id => {
      shares[id] = Number(share.toFixed(2));
    });

    const newExpense: Expense = {
      id: `e_${Date.now()}`,
      title: newExpTitle,
      amount: amt,
      payerId: newExpPayer,
      splitMethod: newExpSplit,
      shares,
      date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      visibility: newExpVisibility
    };

    setExpenses(prev => [newExpense, ...prev]);
    setShowAddExpenseModal(false);
    setNewExpTitle('');
    setNewExpAmount('');

    if (dbSynced) {
      safeDbWrite(() => supabase.from('expenses').insert({
        title: newExpTitle,
        amount: amt,
        payer_id: newExpPayer,
        split_method: newExpSplit,
        shares
      }));
    }

    logFlow(`Abhi logged manual transaction "${newExpTitle}" ($${amt.toFixed(2)})`, 'split');
  };

  // Toggle Chore status
  const handleToggleTask = async (task: Task) => {
    const nextCompletedVal = !task.completed;

    setTasks(prev => prev.map(t => {
      if (t.id === task.id) {
        return { ...t, completed: nextCompletedVal };
      }
      return t;
    }));

    if (dbSynced) {
      safeDbWrite(() => supabase.from('tasks').update({
        completed: nextCompletedVal
      }).eq('id', task.id));
    }

    if (nextCompletedVal) {
      logFlow(`Marked chore as complete: "${task.title}"`, 'chore');
      addPulse('Chore Completed', `Task "${task.title}" completed.`, 'success');
      confetti({
        particleCount: 30,
        spread: 30,
        origin: { y: 0.85 }
      });
    }
  };

  // Delete Shelf Item
  const handleDeleteShelfItem = async (id: string) => {
    const item = shelfItems.find(i => i.id === id);

    setShelfItems(prev => prev.filter(i => i.id !== id));
    setShowShelfDetailsModal(null);

    if (dbSynced) {
      safeDbWrite(() => supabase.from('shelf_items').delete().eq('id', id));
    }

    if (item) {
      logFlow(`Removed item "${item.name}" from inventory catalog`, 'alert');
    }
  };

  const optimizedDebts = getOptimizedDebts(expenses, homemates);
  const netBalances = calculateBalances(expenses, homemates);

  // Render a clean initials avatar
  const renderInitialsAvatar = (member: Homemate, size: number = 38) => {
    return (
      <div style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: `${member.color}15`,
        color: member.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size > 40 ? '0.9rem' : '0.8rem',
        fontWeight: 700,
        border: `1.5px solid ${member.color}25`,
        boxShadow: `0 2px 8px ${member.color}0a`
      }}>
        {member.avatar}
      </div>
    );
  };

  // Render custom vector icons for timeline logs
  const renderFlowIcon = (type: FlowLog['type']) => {
    switch (type) {
      case 'alert':
        return <AlertCircle size={14} style={{ color: 'var(--accent-rose)' }} />;
      case 'run':
        return <ShoppingCart size={14} style={{ color: 'var(--accent-blue)' }} />;
      case 'chore':
        return <CheckSquare size={14} style={{ color: 'var(--accent-emerald)' }} />;
      case 'split':
        return <DollarSign size={14} style={{ color: 'var(--accent-purple)' }} />;
      case 'stocked':
        return <Check size={14} style={{ color: 'var(--accent-emerald)' }} />;
      default:
        return <Info size={14} style={{ color: 'var(--accent-purple)' }} />;
    }
  };

  return (
    <div className="bg-blobs">
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>
      <div className="blob blob-3"></div>

      <div className="app-container">
        
        {/* App Header */}
        <header className="app-header">
          <div>
            <div className="brand-title">
              <Sparkles size={20} style={{ color: 'var(--accent-purple)' }} />
              Deyibe
            </div>
            <div className="brand-subtitle">Home Operating System</div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Database Sync Status indicator */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: '8px',
                background: dbSynced ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                color: dbSynced ? '#059669' : '#d97706',
                cursor: 'pointer'
              }}
              onClick={() => setShowDbAlert(true)}
            >
              <Database size={12} />
              {dbLoading ? 'Connecting...' : dbSynced ? 'Synced' : 'Local'}
            </div>

            <div className="pulse-badge" onClick={() => setShowPulse(!showPulse)}>
              <Bell size={18} />
              {pulseAlerts.some(a => !a.read) && <span className="pulse-indicator"></span>}
            </div>
          </div>
        </header>

        {/* Database Warning/Info Alert banner */}
        {showDbAlert && (
          <div style={{
            background: dbSynced ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
            borderBottom: '1px solid rgba(0, 0, 0, 0.04)',
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.78rem',
            color: dbSynced ? '#059669' : '#d97706',
            fontWeight: 600,
            zIndex: 5
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, paddingRight: '8px' }}>
              <Info size={14} style={{ flexShrink: 0 }} />
              <span>
                {dbSynced 
                  ? 'Connected and syncing with Supabase!' 
                  : 'Offline sandbox mode. Execute SQL schemas in Supabase to sync.'}
              </span>
            </span>
            <X size={14} className="cursor-pointer" onClick={() => setShowDbAlert(false)} style={{ flexShrink: 0 }} />
          </div>
        )}

        {/* Pulse Notifications Dropdown */}
        {showPulse && (
          <div className="glass-card" style={{
            position: 'absolute',
            top: '75px',
            right: '15px',
            left: '15px',
            zIndex: 100,
            maxHeight: '380px',
            overflowY: 'auto',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            background: 'rgba(255, 255, 255, 0.98)',
            boxShadow: '0 15px 40px -10px rgba(0, 0, 0, 0.12)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', alignItems: 'center' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem' }}>
                <Zap size={16} style={{ color: 'var(--accent-amber)' }} />
                Pulse Notifications
              </h3>
              <button 
                onClick={() => {
                  setPulseAlerts(prev => prev.map(a => ({ ...a, read: true })));
                  setShowPulse(false);
                }} 
                style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: 'var(--accent-purple)', fontWeight: 700 }}
              >
                Clear all
              </button>
            </div>
            {pulseAlerts.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#64748b', padding: '20px 0', fontSize: '0.85rem' }}>All updates verified.</p>
            ) : (
              pulseAlerts.map(alert => (
                <div key={alert.id} style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: alert.read ? 'transparent' : 'rgba(0,0,0,0.01)',
                  borderLeft: `3px solid ${alert.type === 'alert' ? 'var(--accent-rose)' : alert.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-blue)'}`,
                  marginBottom: '8px',
                  border: '1px solid rgba(0, 0, 0, 0.02)',
                  borderLeftWidth: '3px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                    <span>{alert.title}</span>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 500 }}>{alert.timestamp}</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#475569', marginTop: '3px', lineHeight: 1.4 }}>{alert.message}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Main Content Area */}
        <main className="app-content">
          
          {/* TAB 1: HOME (TIMELINE & DASHBOARD) */}
          {activeTab === 'home' && (
            <div>
              {/* Quick Balances Widget */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <div className="glass-card" style={{ flex: 1, padding: '14px', marginBottom: 0, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Your Balance</div>
                  <div style={{ 
                    fontSize: '1.3rem', 
                    fontWeight: 800, 
                    marginTop: '2px',
                    color: netBalances[currentUser.id] >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                  }}>
                    {netBalances[currentUser.id] >= 0 ? '+' : ''}${netBalances[currentUser.id].toFixed(2)}
                  </div>
                </div>
                <div className="glass-card" style={{ flex: 1, padding: '14px', marginBottom: 0, textAlign: 'center', cursor: 'pointer' }} onClick={() => setActiveTab('shelf')}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Out of Stock</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: '2px', color: 'var(--accent-blue)' }}>
                    {shelfItems.filter(i => i.status === 'out' || i.status === 'low').length} Items
                  </div>
                </div>
              </div>

              {/* Active shopping session widget */}
              {activeRun && (
                <div className="glass-card" style={{
                  borderLeft: '4px solid var(--accent-blue)',
                  background: 'rgba(59, 130, 246, 0.05)',
                  padding: '12px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer'
                }} onClick={() => setActiveTab('run')}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                      <span className="run-dot"></span>
                      Shopping Session: {homemates.find(h => h.id === activeRun.shopperId)?.name} @ {activeRun.store}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                      {activeRun.requests.length} requests active. Tap to view requests.
                    </div>
                  </div>
                  <ArrowRight size={16} style={{ color: 'var(--accent-blue)' }} />
                </div>
              )}

              {/* Homemates profile list with buzz feature */}
              <div className="glass-card" style={{ padding: '14px' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Homemates</h3>
                <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {homemates.map(m => (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px' }}>
                      <div 
                        style={{ cursor: 'pointer', position: 'relative' }} 
                        onClick={() => m.id !== currentUser.id && handleBuzz(m)}
                      >
                        {renderInitialsAvatar(m, 44)}
                        {m.id !== currentUser.id && (
                          <div style={{
                            position: 'absolute',
                            bottom: -2,
                            right: -2,
                            background: '#ffffff',
                            borderRadius: '50%',
                            padding: '2px',
                            border: '1px solid rgba(0,0,0,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Zap size={9} style={{ color: 'var(--accent-amber)' }} />
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: '0.75rem', marginTop: '4px', color: '#475569', fontWeight: 600 }}>
                        {m.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shared chores checklist */}
              <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckSquare size={16} style={{ color: 'var(--accent-emerald)' }} />
                    Active Chores
                  </h3>
                  <span style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.1)', color: '#059669', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                    {tasks.filter(t => !t.completed).length} Pending
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {tasks.map(task => (
                    <div 
                      key={task.id} 
                      onClick={() => handleToggleTask(task)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.4)',
                        border: '1px solid rgba(0, 0, 0, 0.03)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        opacity: task.completed ? 0.5 : 1
                      }}
                    >
                      {task.completed ? (
                        <CheckSquare size={16} style={{ color: 'var(--accent-emerald)' }} />
                      ) : (
                        <Square size={16} style={{ color: 'rgba(0,0,0,0.25)' }} />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          fontSize: '0.85rem', 
                          fontWeight: 600,
                          textDecoration: task.completed ? 'line-through' : 'none',
                          color: '#1e293b'
                        }}>
                          {task.title}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '1px', display: 'flex', gap: '6px' }}>
                          <span>Due: {task.dueDate}</span>
                          <span>•</span>
                          <span>Assigned: {task.assignedTo.map(id => homemates.find(h => h.id === id)?.name).join(', ')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activity Timeline (Flow) */}
              <div className="glass-card">
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={16} style={{ color: 'var(--accent-purple)' }} />
                  House Flow
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' }}>
                  <div style={{
                    position: 'absolute',
                    left: '11px',
                    top: '10px',
                    bottom: '10px',
                    width: '1.5px',
                    background: 'rgba(0,0,0,0.04)'
                  }}></div>
                  {flowLogs.slice(0, 5).map(log => (
                    <div key={log.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'rgba(255, 255, 255, 0.9)',
                        border: '1.5px solid rgba(0,0,0,0.03)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                      }}>
                        {renderFlowIcon(log.type)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 500 }}>{log.text}</p>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{log.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: SHELF (MINIMALIST DASHBOARD GRID) */}
          {activeTab === 'shelf' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Shelf</h2>
                  <p style={{ fontSize: '0.78rem', color: '#64748b' }}>Shared household inventory tracker</p>
                </div>
                <button className="btn-primary" style={{ padding: '7px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                  onClick={() => setShowAddShelfModal(true)}>
                  <Plus size={14} />
                  Add Stock
                </button>
              </div>

              {/* Minimalist Grid of items */}
              <div className="shelf-board">
                {shelfItems.map(item => (
                  <div 
                    key={item.id} 
                    className={`shelf-item-card ${item.status === 'stocked' ? 'stocked' : ''}`}
                    onClick={() => setShowShelfDetailsModal(item)}
                    style={{
                      borderLeft: `3px solid ${item.priority === 'high' ? 'var(--accent-rose)' : item.priority === 'medium' ? 'var(--accent-amber)' : 'var(--accent-blue)'}`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <span className="shelf-item-name">{item.name}</span>
                    </div>

                    <div style={{ marginTop: '8px' }}>
                      <span className={`shelf-status-pill ${item.status}`}>
                        {item.status === 'stocked' ? 'Stocked' : item.status === 'low' ? 'Low Stock' : 'Out of stock'}
                      </span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: '#94a3b8', marginTop: '6px', fontWeight: 500 }}>
                        <span>by {homemates.find(h => h.id === item.addedById)?.name}</span>
                        <span>{item.timestamp}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add item to Shelf Modal */}
              {showAddShelfModal && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
                }}>
                  <div className="glass-card" style={{ width: '90%', maxWidth: '380px', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Add Catalog Item</h3>
                      <X size={18} className="cursor-pointer" onClick={() => setShowAddShelfModal(false)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Item Name</label>
                        <input type="text" placeholder="e.g. Toilet Paper, Eggs" value={newShelfName} onChange={e => setNewShelfName(e.target.value)} style={{ marginTop: '4px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Priority Level</label>
                        <select value={newShelfPriority} onChange={e => setNewShelfPriority(e.target.value as any)} style={{ marginTop: '4px' }}>
                          <option value="high">High (Urgent)</option>
                          <option value="medium">Medium (Regular)</option>
                          <option value="low">Low (Optional)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Visibility Scope</label>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                          {homemates.map(h => (
                            <button
                              key={h.id}
                              style={{
                                padding: '5px 8px', fontSize: '0.72rem', borderRadius: '6px',
                                border: '1px solid rgba(0,0,0,0.06)',
                                background: newShelfVisibility.includes(h.id) ? 'var(--accent-purple)' : 'rgba(0,0,0,0.02)',
                                color: newShelfVisibility.includes(h.id) ? 'white' : '#475569'
                              }}
                              onClick={() => {
                                if (newShelfVisibility.includes(h.id)) {
                                  setNewShelfVisibility(newShelfVisibility.filter(id => id !== h.id));
                                } else {
                                  setNewShelfVisibility([...newShelfVisibility, h.id]);
                                }
                              }}
                            >
                              {h.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <button className="btn-secondary" style={{ flex: 1, padding: '9px' }} onClick={() => setShowAddShelfModal(false)}>Cancel</button>
                        <button className="btn-primary" style={{ flex: 1, padding: '9px' }} onClick={handleAddShelfItem}>Add Item</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Shelf Item Details / Restock Modal */}
              {showShelfDetailsModal && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
                }}>
                  <div className="glass-card" style={{ width: '90%', maxWidth: '380px', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Item Properties</h3>
                      <X size={18} className="cursor-pointer" onClick={() => setShowShelfDetailsModal(null)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', textAlign: 'center' }}>
                      <div style={{
                        width: '50px', height: '50px', borderRadius: '50%',
                        background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.04)',
                        display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center'
                      }}>
                        <Package size={22} style={{ color: 'var(--accent-purple)' }} />
                      </div>
                      <div>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>{showShelfDetailsModal.name}</h2>
                        <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                          Registered {showShelfDetailsModal.timestamp} by {homemates.find(h => h.id === showShelfDetailsModal.addedById)?.name}
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '8px' }}>
                        <button 
                          className="btn-primary" 
                          style={{ 
                            flex: 1, 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '4px',
                            background: showShelfDetailsModal.status === 'stocked' ? 'var(--accent-amber)' : 'var(--accent-emerald)',
                            padding: '9px'
                          }} 
                          onClick={() => handleToggleRestock(showShelfDetailsModal)}
                        >
                          <Check size={16} />
                          {showShelfDetailsModal.status === 'stocked' ? 'Mark running low' : 'Mark restocked'}
                        </button>
                        
                        <button 
                          className="btn-secondary" 
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 12px' }}
                          onClick={() => handleDeleteShelfItem(showShelfDetailsModal.id)}
                        >
                          <Trash2 size={16} style={{ color: 'var(--accent-rose)' }} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 3: RUN (COLLABORATIVE SHOPPING SESSION) */}
          {activeTab === 'run' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Run</h2>
                  <p style={{ fontSize: '0.78rem', color: '#64748b' }}>Real-time in-store requests coordination</p>
                </div>
              </div>

              {!activeRun ? (
                <div className="glass-card" style={{ padding: '30px 16px', textAlign: 'center' }}>
                  <div style={{
                    width: '54px', height: '54px', borderRadius: '50%',
                    background: 'rgba(59, 130, 246, 0.08)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px'
                  }}>
                    <ShoppingCart size={24} style={{ color: 'var(--accent-blue)' }} />
                  </div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '4px' }}>No Active Session</h3>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '16px' }}>
                    Shopping at a local store? Initiate a session to alert your homemates for requests.
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button className="btn-primary" onClick={() => handleStartRun('Costco')}>Start Costco Run</button>
                    <button className="btn-secondary" onClick={() => handleStartRun('Walmart')}>Start Walmart Run</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="glass-card" style={{ borderLeft: '4px solid var(--accent-blue)', padding: '14px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--accent-blue)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          LIVE COLLABORATION ACTIVE
                        </div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: '2px', color: '#0f172a' }}>
                          {homemates.find(h => h.id === activeRun.shopperId)?.name}'s {activeRun.store} Run
                        </h3>
                      </div>
                      <span className="run-dot"></span>
                    </div>
                  </div>

                  {/* Requests list */}
                  <div className="glass-card" style={{ padding: '14px' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '10px', color: '#475569' }}>Active Run requests</h4>
                    
                    {activeRun.requests.length === 0 ? (
                      <p style={{ textAlign: 'center', color: '#64748b', padding: '14px 0', fontSize: '0.8rem' }}>
                        No items requested. Send request below.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                        {activeRun.requests.map(req => (
                          <div 
                            key={req.id} 
                            style={{
                              padding: '10px', borderRadius: '8px', 
                              background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(0,0,0,0.03)',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                                {req.itemName}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '1px' }}>
                                Requested by: {homemates.find(h => h.id === req.requesterId)?.name}
                              </div>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {req.status === 'pending' || req.status === 'searching' ? (
                                <>
                                  <button 
                                    style={{ padding: '5px 8px', fontSize: '0.7rem', borderRadius: '5px', border: 'none', background: 'var(--accent-emerald)', color: 'white' }}
                                    onClick={() => handleUpdateRunRequestStatus(req.id, 'found', 8.50)}
                                  >
                                    Found
                                  </button>
                                  <button 
                                    style={{ padding: '5px 8px', fontSize: '0.7rem', borderRadius: '5px', border: 'none', background: 'var(--accent-rose)', color: 'white' }}
                                    onClick={() => handleUpdateRunRequestStatus(req.id, 'replaced', undefined, 'Alternative Item', 7.99)}
                                  >
                                    Replace
                                  </button>
                                  <button 
                                    style={{ padding: '5px 8px', fontSize: '0.7rem', borderRadius: '5px', border: 'none', background: 'rgba(0,0,0,0.06)', color: '#475569' }}
                                    onClick={() => handleUpdateRunRequestStatus(req.id, 'out')}
                                  >
                                    Out
                                  </button>
                                </>
                              ) : (
                                <span style={{
                                  fontSize: '0.7rem', fontWeight: 800, padding: '3px 6px', borderRadius: '4px',
                                  background: req.status === 'found' ? 'rgba(16, 185, 129, 0.1)' : req.status === 'replaced' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                                  color: req.status === 'found' ? '#059669' : req.status === 'replaced' ? '#d97706' : '#e11d48',
                                  textTransform: 'uppercase'
                                }}>
                                  {req.status} {req.price && `($${req.price})`}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new request */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input 
                        type="text" 
                        placeholder="Request item..." 
                        value={newRequestName} 
                        onChange={e => setNewRequestName(e.target.value)} 
                        style={{ padding: '9px' }}
                      />
                      <button className="btn-primary" style={{ padding: '0 12px', fontSize: '0.8rem' }} onClick={handleAddRunRequest}>Request</button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-secondary" style={{ flex: 1, padding: '9px' }} onClick={() => setActiveRun(null)}>Cancel Run</button>
                    <button className="btn-primary" style={{ flex: 1, padding: '9px', background: 'linear-gradient(135deg, var(--accent-blue) 0%, #2563eb 100%)', boxShadow: '0 4px 12px var(--accent-blue-glow)' }} onClick={handleCheckoutRun}>
                      Complete Checkout
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SPLIT & SETTLE (Smart Expense splitting) */}
          {activeTab === 'split' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Split</h2>
                  <p style={{ fontSize: '0.78rem', color: '#64748b' }}>Calculate and settle shared balances</p>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn-secondary" style={{ padding: '7px 10px', borderRadius: '8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => setShowOCRModal(true)}>
                    <Camera size={14} />
                    Scan
                  </button>
                  <button className="btn-primary" style={{ padding: '7px 10px', borderRadius: '8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => setShowAddExpenseModal(true)}>
                    <Plus size={14} />
                    Log
                  </button>
                </div>
              </div>

              {/* Debt suggestions widget */}
              <div className="glass-card" style={{ borderLeft: '3px solid var(--accent-purple)', background: 'rgba(99, 102, 241, 0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Optimization suggests</h3>
                  <button className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.72rem', borderRadius: '6px' }}
                    onClick={() => setShowSettleModal(true)}>
                    Settle Up
                  </button>
                </div>

                {optimizedDebts.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No pending balances suggested. You are all settled.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {optimizedDebts.map((debt, index) => {
                      const debtor = homemates.find(h => h.id === debt.debtorId)?.name || 'Someone';
                      const creditor = homemates.find(h => h.id === debt.creditorId)?.name || 'Someone';
                      return (
                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 500, color: '#1e293b' }}>
                          <span>{debtor} to {creditor}</span>
                          <span style={{ fontWeight: 700, color: 'var(--accent-rose)' }}>${debt.amount.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Expense list history */}
              <div className="glass-card">
                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '10px', color: '#475569' }}>Transaction History</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {expenses.map(exp => (
                    <div 
                      key={exp.id} 
                      style={{
                        padding: '10px 12px', borderRadius: '8px', 
                        background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(0,0,0,0.02)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>{exp.title}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '1px' }}>
                          Paid by {homemates.find(h => h.id === exp.payerId)?.name} on {exp.date}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>${exp.amount.toFixed(2)}</div>
                        <span style={{ fontSize: '0.65rem', background: 'rgba(0,0,0,0.03)', padding: '1px 4px', borderRadius: '4px', color: '#64748b', fontWeight: 600 }}>
                          {exp.splitMethod} split
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Settle Up Action Modal */}
              {showSettleModal && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
                }}>
                  <div className="glass-card" style={{ width: '90%', maxWidth: '380px', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Clear Balances</h3>
                      <X size={18} className="cursor-pointer" onClick={() => setShowSettleModal(false)} />
                    </div>
                    {optimizedDebts.length === 0 ? (
                      <p style={{ textAlign: 'center', color: '#64748b', padding: '14px 0', fontSize: '0.85rem' }}>No balance to settle.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {optimizedDebts.map((debt, index) => {
                          const debtor = homemates.find(h => h.id === debt.debtorId);
                          const creditor = homemates.find(h => h.id === debt.creditorId);
                          return (
                            <div 
                              key={index} 
                              style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '8px 10px', borderRadius: '8px', background: 'rgba(0,0,0,0.01)',
                                border: '1px solid rgba(0,0,0,0.03)'
                              }}
                            >
                              <div style={{ fontSize: '0.82rem', color: '#334155' }}>
                                <span style={{ fontWeight: 700 }}>{debtor?.name}</span>
                                <span style={{ margin: '0 4px', color: '#94a3b8' }}>to</span>
                                <span style={{ fontWeight: 700 }}>{creditor?.name}</span>
                              </div>
                              <button 
                                className="btn-primary" 
                                style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                                onClick={() => handleSettleUp(debt.debtorId, debt.creditorId, debt.amount)}
                              >
                                Pay ${debt.amount.toFixed(2)}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* OCR Scanner Modal */}
              {showOCRModal && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
                }}>
                  <div className="glass-card" style={{ width: '90%', maxWidth: '380px', maxHeight: '90%', overflowY: 'auto', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>OCR Receipt Scan</h3>
                      <X size={18} className="cursor-pointer" onClick={() => { setShowOCRModal(false); setOcrResult(null); }} />
                    </div>
                    
                    {!ocrResult ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', textAlign: 'center', padding: '14px 0' }}>
                        <div style={{
                          width: '54px', height: '54px', borderRadius: '50%',
                          background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.04)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <Camera size={22} style={{ color: 'var(--accent-purple)' }} />
                        </div>
                        {ocrScanning ? (
                          <div>
                            <RefreshCw size={20} className="animate-spin" style={{ color: 'var(--accent-purple)', margin: '0 auto 8px' }} />
                            <p style={{ fontWeight: 700, fontSize: '0.88rem' }}>{ocrProgress}</p>
                            <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Executing item classification OCR</p>
                          </div>
                        ) : (
                          <div style={{ width: '100%' }}>
                            <p style={{ fontWeight: 700, fontSize: '0.88rem' }}>Analyze printed receipts</p>
                            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', marginBottom: '12px' }}>Upload a file or choose dummy presets</p>
                            
                            {/* File Upload Selector */}
                            <label className="btn-secondary" style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                              padding: '10px', cursor: 'pointer', marginBottom: '12px', fontSize: '0.8rem'
                            }}>
                              <Upload size={16} />
                              Upload Receipt Image
                              <input type="file" accept="image/*" onChange={handleCustomImageOCR} style={{ display: 'none' }} />
                            </label>

                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className="btn-primary" style={{ padding: '8px 12px', fontSize: '0.75rem', flex: 1 }} onClick={() => triggerOCRScan('Costco')}>Scan Costco Preset</button>
                              <button className="btn-secondary" style={{ padding: '8px 12px', fontSize: '0.75rem', flex: 1 }} onClick={() => triggerOCRScan('Walmart')}>Scan Walmart Preset</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '8px' }}>
                          <div>
                            <h4 style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>{ocrResult.merchant}</h4>
                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{ocrResult.date}</span>
                          </div>
                          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>${ocrResult.total.toFixed(2)}</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8' }}>Identified Items</span>
                          {ocrResult.items.map((item: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#334155' }}>
                              <span>{item.name}</span>
                              <span style={{ fontWeight: 700 }}>${item.price.toFixed(2)}</span>
                            </div>
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', borderTop: '1px solid rgba(0,0,0,0.03)', paddingTop: '4px' }}>
                            <span>Associated Tax</span>
                            <span>${ocrResult.tax.toFixed(2)}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button className="btn-secondary" style={{ flex: 1, padding: '9px' }} onClick={() => setOcrResult(null)}>Clear</button>
                          <button className="btn-primary" style={{ flex: 1, padding: '9px' }} onClick={handleSaveOCRExpense}>Confirm Split</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Add Manual Expense Modal */}
              {showAddExpenseModal && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
                }}>
                  <div className="glass-card" style={{ width: '90%', maxWidth: '380px', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Record Transaction</h3>
                      <X size={18} className="cursor-pointer" onClick={() => setShowAddExpenseModal(false)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Title description</label>
                        <input type="text" placeholder="e.g. WiFi Bill, Electricity" value={newExpTitle} onChange={e => setNewExpTitle(e.target.value)} style={{ marginTop: '4px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Total cost ($)</label>
                        <input type="number" placeholder="0.00" value={newExpAmount} onChange={e => setNewExpAmount(e.target.value)} style={{ marginTop: '4px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Payer</label>
                        <select value={newExpPayer} onChange={e => setNewExpPayer(e.target.value)} style={{ marginTop: '4px' }}>
                          {homemates.map(h => (
                            <option key={h.id} value={h.id}>{h.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Split Formula</label>
                        <select value={newExpSplit} onChange={e => setNewExpSplit(e.target.value as any)} style={{ marginTop: '4px' }}>
                          <option value="equal">Divide Equally</option>
                          <option value="custom">Divide Custom</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Included Homemates</label>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                          {homemates.map(h => (
                            <button
                              key={h.id}
                              style={{
                                padding: '5px 8px', fontSize: '0.72rem', borderRadius: '6px',
                                border: '1px solid rgba(0,0,0,0.06)',
                                background: newExpVisibility.includes(h.id) ? 'var(--accent-purple)' : 'rgba(0,0,0,0.02)',
                                color: newExpVisibility.includes(h.id) ? 'white' : '#475569'
                              }}
                              onClick={() => {
                                if (newExpVisibility.includes(h.id)) {
                                  setNewExpVisibility(newExpVisibility.filter(id => id !== h.id));
                                } else {
                                  setNewExpVisibility([...newExpVisibility, h.id]);
                                }
                              }}
                            >
                              {h.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <button className="btn-secondary" style={{ flex: 1, padding: '9px' }} onClick={() => setShowAddExpenseModal(false)}>Cancel</button>
                        <button className="btn-primary" style={{ flex: 1, padding: '9px' }} onClick={handleAddManualExpense}>Add Bill</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 5: CHAT (COLLABORATIVE MESSAGING) */}
          {activeTab === 'chat' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '620px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '8px', marginBottom: '12px' }}>
                <Users size={16} style={{ color: 'var(--accent-purple)' }} />
                <div>
                  <h2 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>Household Chatroom</h2>
                  <span style={{ fontSize: '0.68rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-emerald)' }}></span>
                    Double Ratchet Encryption Active
                  </span>
                </div>
              </div>

              {/* Chat messages */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingRight: '4px' }}>
                {chatMessages.map(msg => {
                  const isMe = msg.senderId === currentUser.id;
                  const isSystem = msg.senderId === 'system';
                  const sender = homemates.find(h => h.id === msg.senderId);
                  
                  if (isSystem) {
                    return (
                      <div key={msg.id} style={{
                        alignSelf: 'center', background: 'rgba(0,0,0,0.02)', 
                        padding: '4px 10px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.03)',
                        fontSize: '0.72rem', color: '#64748b', margin: '6px 0', textAlign: 'center', fontWeight: 500
                      }}>
                        {msg.text}
                      </div>
                    );
                  }

                  return (
                    <div 
                      key={msg.id} 
                      className={`chat-bubble ${isMe ? 'sent' : 'received'}`}
                    >
                      {!isMe && (
                        <div style={{ 
                          fontSize: '0.68rem', 
                          fontWeight: 700, 
                          color: sender?.color || '#000000',
                          marginBottom: '2px'
                        }}>
                          {sender?.name}
                        </div>
                      )}
                      <div>{msg.text}</div>
                      <span style={{ 
                        fontSize: '0.6.2rem', 
                        color: isMe ? 'rgba(255,255,255,0.6)' : '#94a3b8', 
                        display: 'block', 
                        textAlign: 'right',
                        marginTop: '3px'
                      }}>
                        {msg.timestamp}
                      </span>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Chat controls */}
              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: '10px' }}>
                <input 
                  type="text" 
                  placeholder="Message homemates..." 
                  value={chatInput} 
                  onChange={e => setChatInput(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                  style={{ padding: '10px 12px' }}
                />
                <button 
                  className="btn-primary" 
                  style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', padding: '10px 12px' }}
                  onClick={handleSendMessage}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          )}

        </main>

        {/* Bottom Tab Bar */}
        <nav className="bottom-nav">
          <div className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
            <HomeIcon />
            <span>Home</span>
          </div>
          <div className={`nav-item ${activeTab === 'shelf' ? 'active' : ''}`} onClick={() => setActiveTab('shelf')}>
            <Package />
            <span>Shelf</span>
          </div>
          <div className={`nav-item ${activeTab === 'run' ? 'active' : ''}`} onClick={() => setActiveTab('run')}>
            <ShoppingCart />
            <span>Run</span>
          </div>
          <div className={`nav-item ${activeTab === 'split' ? 'active' : ''}`} onClick={() => setActiveTab('split')}>
            <DollarSign />
            <span>Split</span>
          </div>
          <div className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
            <MessageSquare />
            <span>Chat</span>
          </div>
        </nav>

      </div>
    </div>
  );
}
