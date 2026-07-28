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
  Zap
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { Homemate, Expense, ShelfItem, ChatMessage, Task, PulseAlert, RunSession, RunRequest } from './types';
import { initialHomemates, initialShelfItems, initialExpenses, initialChatMessages, initialTasks, initialPulseAlerts } from './data/mockData';
import { getOptimizedDebts, calculateBalances } from './utils/settleEngine';

export default function App() {
  // App States
  const [activeTab, setActiveTab] = useState<'home' | 'shelf' | 'run' | 'split' | 'chat'>('home');
  const [homemates] = useState<Homemate[]>(initialHomemates);
  const [currentUser] = useState<Homemate>(initialHomemates[0]); // Abhi
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
      { id: 'req1', itemName: 'Organic Chicken', requesterId: '4', status: 'searching' },
      { id: 'req2', itemName: 'Toilet Paper', requesterId: '1', status: 'pending' }
    ]
  });

  // UI Flow Logs
  const [flowLogs, setFlowLogs] = useState<Array<{ id: string; text: string; time: string; icon: string }>>([
    { id: 'f1', text: 'Divya marked Toilet Paper as OUT OF STOCK on Shelf', time: '3 hours ago', icon: '🚨' },
    { id: 'f2', text: 'Sandeep started a Costco Run', time: '1 hour ago', icon: '🛒' },
    { id: 'f3', text: 'Abhi (You) completed "Take out the trash" chore', time: '2 hours ago', icon: '🧹' },
    { id: 'f4', text: 'Sandeep added Wi-Fi expense ($60.00) to Split', time: 'Yesterday', icon: '💸' }
  ]);

  // Modal / Form States
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
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<any | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll chat to bottom
  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  // Log a new activity into Flow
  const logFlow = (text: string, icon: string) => {
    const newLog = {
      id: `f_${Date.now()}`,
      text,
      time: 'Just now',
      icon
    };
    setFlowLogs(prev => [newLog, ...prev]);
  };

  // Add notification to Pulse
  const addPulse = (title: string, message: string, type: 'info' | 'alert' | 'success') => {
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

  // Handle send message
  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    const newMessage: ChatMessage = {
      id: `m_${Date.now()}`,
      senderId: currentUser.id,
      text: chatInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, newMessage]);
    setChatInput('');

    // Simulate roommate response in chat
    setTimeout(() => {
      const responseMessage: ChatMessage = {
        id: `m_${Date.now() + 1}`,
        senderId: '2', // Sandeep
        text: 'Got it! Just checked that. Let me look.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, responseMessage]);
      addPulse('New Message', 'Sandeep sent a message in Chat', 'info');
    }, 1500);
  };

  // Settle up payment handler
  const handleSettleUp = (debtorId: string, creditorId: string, amount: number) => {
    const debtor = homemates.find(h => h.id === debtorId)?.name || 'Someone';
    const creditor = homemates.find(h => h.id === creditorId)?.name || 'Someone';

    // Add settle transaction as an expense with negative/adjusted values, or resolve balance directly
    const settleExpense: Expense = {
      id: `e_${Date.now()}`,
      title: `Settled: ${debtor} paid ${creditor}`,
      amount: amount,
      payerId: debtorId,
      splitMethod: 'custom',
      shares: { [creditorId]: amount }, // creditor owed this
      date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      visibility: ['1', '2', '3', '4']
    };

    setExpenses(prev => [...prev, settleExpense]);
    setShowSettleModal(false);

    // Confetti effect!
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 }
    });

    logFlow(`${debtor} settled $${amount.toFixed(2)} with ${creditor}`, '💸');
    addPulse('Debt Settled', `${debtor} paid ${creditor} $${amount.toFixed(2)}.`, 'success');
  };

  // Buzz Roommate action
  const handleBuzz = (target: Homemate) => {
    const text = `⚡ Abhi buzzed ${target.name}: "Hey! Check our active tasks/expenses."`;
    const newMessage: ChatMessage = {
      id: `m_${Date.now()}`,
      senderId: 'system',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, newMessage]);
    logFlow(`Abhi buzzed ${target.name}`, '⚡');
    addPulse('Buzz Sent', `You buzzed ${target.name}.`, 'info');
  };

  // Add Item to Shelf
  const handleAddShelfItem = () => {
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
    logFlow(`Abhi added ${newShelfName} to Shelf`, '📦');
    addPulse('Shelf Update', `Abhi added ${newShelfName} to Shelf (low stock).`, 'info');
  };

  // Toggle item status to Restocked (crossed-out animation)
  const handleToggleRestock = (item: ShelfItem) => {
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

    if (newStatus === 'stocked') {
      logFlow(`Abhi restocked ${item.name}`, '✓');
      addPulse('Restocked', `${item.name} has been restocked.`, 'success');
      confetti({
        particleCount: 50,
        spread: 40,
        origin: { y: 0.8 }
      });
    } else {
      logFlow(`Abhi marked ${item.name} as running low`, '⚠️');
    }
    
    if (showShelfDetailsModal) setShowShelfDetailsModal(null);
  };

  // Start a shopping Run
  const handleStartRun = (store: string) => {
    const newRun: RunSession = {
      id: `run_${Date.now()}`,
      shopperId: currentUser.id,
      store,
      status: 'active',
      requests: []
    };
    setActiveRun(newRun);
    logFlow(`Abhi started a ${store} Run`, '🛒');
    addPulse('Run Started', `Abhi is on a Run at ${store}. Add your requests!`, 'info');
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
    logFlow(`Abhi requested ${newReq.itemName} for the ${activeRun.store} Run`, '🛒');
  };

  // Update Run Request status
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
      logFlow(`Status of ${req.itemName} changed to ${status}`, '🛒');
    }
  };

  // Finish shopping session (integration with Shelf and Split)
  const handleCheckoutRun = () => {
    if (!activeRun) return;
    
    // 1. Move "found" items to Shelf
    const foundRequests = activeRun.requests.filter(r => r.status === 'found' || r.status === 'replaced');
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

    // 2. Add as Split Expense
    const totalAmount = foundRequests.reduce((sum, r) => sum + (r.status === 'replaced' ? (r.replacementPrice || 0) : (r.price || 5.00)), 0);
    
    if (totalAmount > 0) {
      // Calculate equal split shares
      const share = totalAmount / homemates.length;
      const shares: Record<string, number> = {};
      homemates.forEach(m => {
        shares[m.id] = Number(share.toFixed(2));
      });

      const newExpense: Expense = {
        id: `e_${Date.now()}`,
        title: `${activeRun.store} Run items`,
        amount: Number(totalAmount.toFixed(2)),
        payerId: activeRun.shopperId,
        splitMethod: 'equal',
        shares,
        date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        visibility: ['1', '2', '3', '4']
      };

      setExpenses(prev => [...prev, newExpense]);
      logFlow(`Completed ${activeRun.store} Run. Added ${foundRequests.length} items to Shelf & split $${totalAmount.toFixed(2)}`, '🛒');
      addPulse('Checkout Successful', `Run checkout complete. $${totalAmount.toFixed(2)} split equally.`, 'success');
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

    setTimeout(() => {
      setOcrScanning(false);
      if (store === 'Costco') {
        setOcrResult({
          merchant: 'Costco Wholesale',
          date: 'July 27, 2026',
          items: [
            { name: 'Organic Milk 3pk', price: 9.99, quantity: 1, payerId: '1' },
            { name: 'Toilet Paper 30ct', price: 18.99, quantity: 1, payerId: '1' },
            { name: 'Kirkland Croissants', price: 6.49, quantity: 1, payerId: '1' }
          ],
          tax: 2.80,
          total: 38.27
        });
      } else {
        setOcrResult({
          merchant: 'Walmart Supercenter',
          date: 'July 27, 2026',
          items: [
            { name: 'Dish Soap', price: 3.50, quantity: 1, payerId: '1' },
            { name: 'Trash Bags 80pk', price: 14.99, quantity: 1, payerId: '1' }
          ],
          tax: 1.50,
          total: 19.99
        });
      }
    }, 2000);
  };

  // Save Expense from OCR
  const handleSaveOCRExpense = () => {
    if (!ocrResult) return;

    // Calculate split
    const share = ocrResult.total / homemates.length;
    const shares: Record<string, number> = {};
    homemates.forEach(m => {
      shares[m.id] = Number(share.toFixed(2));
    });

    const newExpense: Expense = {
      id: `e_${Date.now()}`,
      title: `${ocrResult.merchant} receipt`,
      amount: ocrResult.total,
      payerId: currentUser.id,
      splitMethod: 'equal',
      shares,
      date: ocrResult.date,
      visibility: ['1', '2', '3', '4']
    };

    setExpenses(prev => [...prev, newExpense]);
    setShowOCRModal(false);
    setOcrResult(null);

    // Auto-restock matching Shelf items if scanned
    const itemNamesLower = ocrResult.items.map((i: any) => i.name.toLowerCase());
    setShelfItems(prev => prev.map(s => {
      const match = itemNamesLower.some((name: string) => name.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(name));
      if (match) {
        return { ...s, status: 'stocked', restockedAt: new Date().toISOString() };
      }
      return s;
    }));

    logFlow(`Scanned receipt for ${ocrResult.merchant} ($${ocrResult.total})`, '💸');
    addPulse('Receipt Scanned', `Receipt from ${ocrResult.merchant} uploaded. Total: $${ocrResult.total}.`, 'success');
    confetti({
      particleCount: 50,
      spread: 40
    });
  };

  // Manual Add Expense
  const handleAddManualExpense = () => {
    const amt = parseFloat(newExpAmount);
    if (!newExpTitle.trim() || isNaN(amt) || amt <= 0) return;

    // Calculate split shares based on method
    const shares: Record<string, number> = {};
    if (newExpSplit === 'equal') {
      const activeMembers = newExpVisibility;
      const share = amt / activeMembers.length;
      activeMembers.forEach(id => {
        shares[id] = Number(share.toFixed(2));
      });
    } else {
      // For simplicity, custom split splits equally among selected members in this view
      const activeMembers = newExpVisibility;
      const share = amt / activeMembers.length;
      activeMembers.forEach(id => {
        shares[id] = Number(share.toFixed(2));
      });
    }

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

    setExpenses(prev => [...prev, newExpense]);
    setShowAddExpenseModal(false);
    setNewExpTitle('');
    setNewExpAmount('');
    logFlow(`Abhi added manual expense "${newExpTitle}" ($${amt.toFixed(2)})`, '💸');
  };

  // Toggle Chore status
  const handleToggleTask = (task: Task) => {
    setTasks(prev => prev.map(t => {
      if (t.id === task.id) {
        return { ...t, completed: !t.completed };
      }
      return t;
    }));

    if (!task.completed) {
      logFlow(`Completed task: ${task.title}`, '🧹');
      addPulse('Task Completed', `Task "${task.title}" was marked done.`, 'success');
      confetti({
        particleCount: 30,
        spread: 30,
        origin: { y: 0.85 }
      });
    }
  };

  // Delete Shelf Item
  const handleDeleteShelfItem = (id: string) => {
    const item = shelfItems.find(i => i.id === id);
    setShelfItems(prev => prev.filter(i => i.id !== id));
    setShowShelfDetailsModal(null);
    if (item) {
      logFlow(`Removed ${item.name} from Shelf`, '🗑️');
    }
  };

  // Settle engine calculations
  const optimizedDebts = getOptimizedDebts(expenses, homemates);
  const netBalances = calculateBalances(expenses, homemates);

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
              <Sparkles size={22} className="text-purple-500" style={{ color: 'var(--accent-purple)' }} />
              Deyibe
            </div>
            <div className="brand-subtitle">Dabbulu Eyi Bhe!</div>
          </div>
          
          <div className="pulse-badge" onClick={() => setShowPulse(!showPulse)}>
            <Bell size={20} />
            {pulseAlerts.some(a => !a.read) && <span className="pulse-indicator"></span>}
          </div>
        </header>

        {/* Pulse Notifications Dropdown */}
        {showPulse && (
          <div className="glass-card" style={{
            position: 'absolute',
            top: '75px',
            right: '15px',
            left: '15px',
            zIndex: 100,
            maxHeight: '400px',
            overflowY: 'auto',
            border: '1px solid var(--glass-border-focus)',
            background: 'rgba(15, 17, 28, 0.95)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', alignItems: 'center' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={18} style={{ color: 'var(--accent-amber)' }} />
                Pulse Board
              </h3>
              <button 
                onClick={() => {
                  setPulseAlerts(prev => prev.map(a => ({ ...a, read: true })));
                  setShowPulse(false);
                }} 
                style={{ fontSize: '0.8rem', background: 'none', border: 'none', color: 'var(--accent-purple)' }}
              >
                Mark all read
              </button>
            </div>
            {pulseAlerts.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '20px 0' }}>All quiet on the home front.</p>
            ) : (
              pulseAlerts.map(alert => (
                <div key={alert.id} style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: alert.read ? 'transparent' : 'rgba(255,255,255,0.03)',
                  borderLeft: `3px solid ${alert.type === 'alert' ? 'var(--accent-rose)' : alert.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-blue)'}`,
                  marginBottom: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600 }}>
                    <span>{alert.title}</span>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>{alert.timestamp}</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>{alert.message}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Main Content Area */}
        <main className="app-content">
          
          {/* TAB 1: HOME (FEED & HOME OS) */}
          {activeTab === 'home' && (
            <div>
              {/* Quick Summary widgets */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <div className="glass-card" style={{ flex: 1, padding: '16px', marginBottom: 0, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Your Net Balance</div>
                  <div style={{ 
                    fontSize: '1.4rem', 
                    fontWeight: 800, 
                    marginTop: '4px',
                    color: netBalances[currentUser.id] >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                  }}>
                    {netBalances[currentUser.id] >= 0 ? '+' : ''}${netBalances[currentUser.id].toFixed(2)}
                  </div>
                </div>
                <div className="glass-card" style={{ flex: 1, padding: '16px', marginBottom: 0, textAlign: 'center', cursor: 'pointer' }} onClick={() => setActiveTab('shelf')}>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Needed Stock</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '4px', color: 'var(--accent-blue)' }}>
                    {shelfItems.filter(i => i.status === 'out' || i.status === 'low').length} items
                  </div>
                </div>
              </div>

              {/* Active Run Companion Alert banner */}
              {activeRun && (
                <div className="glass-card" style={{
                  borderLeft: '4px solid var(--accent-blue)',
                  background: 'rgba(59, 130, 246, 0.06)',
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer'
                }} onClick={() => setActiveTab('run')}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.95rem' }}>
                      <span className="run-dot"></span>
                      Active Run: {homemates.find(h => h.id === activeRun.shopperId)?.name} @ {activeRun.store}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>
                      {activeRun.requests.length} requests active. Tap to coordinate!
                    </div>
                  </div>
                  <ArrowRight size={18} style={{ color: 'var(--accent-blue)' }} />
                </div>
              )}

              {/* Quick Homemates Buzz Section */}
              <div className="glass-card" style={{ padding: '16px' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px', color: 'rgba(255,255,255,0.85)' }}>Homemates</h3>
                <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '6px' }}>
                  {homemates.map(m => (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}>
                      <div style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '50%',
                        background: m.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.4rem',
                        border: '2px solid rgba(255,255,255,0.1)',
                        boxShadow: `0 0 15px ${m.color}33`,
                        cursor: 'pointer',
                        position: 'relative'
                      }} onClick={() => m.id !== currentUser.id && handleBuzz(m)}>
                        {m.avatar}
                        {m.id !== currentUser.id && (
                          <div style={{
                            position: 'absolute',
                            bottom: -2,
                            right: -2,
                            background: '#0d0f1a',
                            borderRadius: '50%',
                            padding: '3px',
                            border: '1px solid var(--glass-border)'
                          }}>
                            <Zap size={10} style={{ color: 'var(--accent-amber)' }} />
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: '0.75rem', marginTop: '6px', color: 'rgba(255,255,255,0.8)' }}>
                        {m.name.split(' ')[0]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shared Chores & Tasks checklist */}
              <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckSquare size={18} style={{ color: 'var(--accent-emerald)' }} />
                    Active Chores
                  </h3>
                  <span style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                    {tasks.filter(t => !t.completed).length} pending
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {tasks.map(task => (
                    <div 
                      key={task.id} 
                      onClick={() => handleToggleTask(task)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--glass-border)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        opacity: task.completed ? 0.5 : 1
                      }}
                    >
                      {task.completed ? (
                        <CheckSquare size={18} style={{ color: 'var(--accent-emerald)' }} />
                      ) : (
                        <Square size={18} style={{ color: 'rgba(255,255,255,0.4)' }} />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          fontSize: '0.9rem', 
                          fontWeight: 600,
                          textDecoration: task.completed ? 'line-through' : 'none' 
                        }}>
                          {task.title}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '2px', display: 'flex', gap: '8px' }}>
                          <span>Due: {task.dueDate}</span>
                          <span>•</span>
                          <span>Assigned: {task.assignedTo.map(id => homemates.find(h => h.id === id)?.name.split(' ')[0]).join(', ')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Household Flow Timeline logs */}
              <div className="glass-card">
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={18} style={{ color: 'var(--accent-purple)' }} />
                  House Flow
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
                  <div style={{
                    position: 'absolute',
                    left: '11px',
                    top: '12px',
                    bottom: '12px',
                    width: '1px',
                    background: 'rgba(255,255,255,0.06)'
                  }}></div>
                  {flowLogs.slice(0, 5).map(log => (
                    <div key={log.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--glass-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.85rem',
                        zIndex: 1
                      }}>
                        {log.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)' }}>{log.text}</p>
                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>{log.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: SHELF (DIGITAL REFRIGERATOR DOOR BOARD) */}
          {activeTab === 'shelf' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Shelf</h2>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Household pantry & inventory</p>
                </div>
                <button className="btn-primary" style={{ padding: '8px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                  onClick={() => setShowAddShelfModal(true)}>
                  <Plus size={16} />
                  Add Stock
                </button>
              </div>

              {/* Fridge Door container with sticky note elements */}
              <div className="fridge-door">
                {shelfItems.map(item => (
                  <div 
                    key={item.id} 
                    className={`fridge-magnet ${item.status === 'stocked' ? 'stocked' : ''}`}
                    onClick={() => setShowShelfDetailsModal(item)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                      <span className="magnet-text" style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                        {item.name}
                      </span>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: item.status === 'stocked' ? 'var(--accent-emerald)' : item.status === 'low' ? 'var(--accent-amber)' : 'var(--accent-rose)',
                        boxShadow: `0 0 8px ${item.status === 'stocked' ? 'var(--accent-emerald)' : item.status === 'low' ? 'var(--accent-amber)' : 'var(--accent-rose)'}`
                      }}></span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                      <span className="magnet-priority" style={{
                        background: item.priority === 'high' ? 'rgba(244, 63, 94, 0.15)' : item.priority === 'medium' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.1)',
                        color: item.priority === 'high' ? 'var(--accent-rose)' : item.priority === 'medium' ? 'var(--accent-amber)' : 'rgba(255,255,255,0.6)'
                      }}>
                        {item.priority}
                      </span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'rgba(0,0,0,0.65)', fontWeight: 600 }}>
                        <span>by {homemates.find(h => h.id === item.addedById)?.name.split(' ')[0]}</span>
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
                  background: 'rgba(5,5,8,0.85)', backdropFilter: 'blur(10px)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
                }}>
                  <div className="glass-card" style={{ width: '90%', maxWidth: '400px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Add to Shelf</h3>
                      <X size={20} className="cursor-pointer" onClick={() => setShowAddShelfModal(false)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Item Name</label>
                        <input type="text" placeholder="e.g. Toilet Paper, Eggs" value={newShelfName} onChange={e => setNewShelfName(e.target.value)} style={{ marginTop: '4px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Priority</label>
                        <select value={newShelfPriority} onChange={e => setNewShelfPriority(e.target.value as any)} style={{ marginTop: '4px' }}>
                          <option value="high">High (Urgent)</option>
                          <option value="medium">Medium (Regular)</option>
                          <option value="low">Low (Optional)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Visibility (Who sees this?)</label>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                          {homemates.map(h => (
                            <button
                              key={h.id}
                              style={{
                                padding: '6px 10px', fontSize: '0.8rem', borderRadius: '8px',
                                border: '1px solid var(--glass-border)',
                                background: newShelfVisibility.includes(h.id) ? 'var(--accent-purple)' : 'var(--glass-bg)',
                                color: 'white'
                              }}
                              onClick={() => {
                                if (newShelfVisibility.includes(h.id)) {
                                  setNewShelfVisibility(newShelfVisibility.filter(id => id !== h.id));
                                } else {
                                  setNewShelfVisibility([...newShelfVisibility, h.id]);
                                }
                              }}
                            >
                              {h.name.split(' ')[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                        <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddShelfModal(false)}>Cancel</button>
                        <button className="btn-primary" style={{ flex: 1 }} onClick={handleAddShelfItem}>Add Item</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Shelf Item Details / Restock Modal */}
              {showShelfDetailsModal && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(5,5,8,0.85)', backdropFilter: 'blur(10px)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
                }}>
                  <div className="glass-card" style={{ width: '90%', maxWidth: '400px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Shelf Item</h3>
                      <X size={20} className="cursor-pointer" onClick={() => setShowShelfDetailsModal(null)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center', textAlign: 'center' }}>
                      <div style={{
                        width: '60px', height: '60px', borderRadius: '50%',
                        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem'
                      }}>
                        📦
                      </div>
                      <div>
                        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{showShelfDetailsModal.name}</h2>
                        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                          Added {showShelfDetailsModal.timestamp} by {homemates.find(h => h.id === showShelfDetailsModal.addedById)?.name}
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '10px' }}>
                        <button 
                          className="btn-primary" 
                          style={{ 
                            flex: 1, 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '6px',
                            background: showShelfDetailsModal.status === 'stocked' ? 'var(--accent-amber)' : 'var(--accent-emerald)'
                          }} 
                          onClick={() => handleToggleRestock(showShelfDetailsModal)}
                        >
                          <Check size={18} />
                          {showShelfDetailsModal.status === 'stocked' ? 'Mark Out of Stock' : 'Mark Restocked'}
                        </button>
                        
                        <button 
                          className="btn-secondary" 
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}
                          onClick={() => handleDeleteShelfItem(showShelfDetailsModal.id)}
                        >
                          <Trash2 size={18} style={{ color: 'var(--accent-rose)' }} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 3: RUN (COLLABORATIVE SHOPPING COMPANION) */}
          {activeTab === 'run' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Run</h2>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Real-time grocery & store run companion</p>
                </div>
              </div>

              {!activeRun ? (
                /* No Active Run state */
                <div className="glass-card" style={{ padding: '40px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🛒</div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '6px' }}>No Active Run</h3>
                  <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>
                    Going to a store? Start a Run session so roommates can add live requests.
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button className="btn-primary" onClick={() => handleStartRun('Costco')}>Start Costco Run</button>
                    <button className="btn-secondary" onClick={() => handleStartRun('Walmart')}>Start Walmart Run</button>
                  </div>
                </div>
              ) : (
                /* Active Run state */
                <div>
                  <div className="glass-card" style={{ borderLeft: '4px solid var(--accent-blue)', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                          LIVE SHOPPING SESSION
                        </div>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '2px' }}>
                          {homemates.find(h => h.id === activeRun.shopperId)?.name}'s {activeRun.store} Run
                        </h3>
                      </div>
                      <span className="run-dot"></span>
                    </div>
                  </div>

                  {/* Requests list */}
                  <div className="glass-card" style={{ padding: '18px' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '14px' }}>Roommate Requests</h4>
                    
                    {activeRun.requests.length === 0 ? (
                      <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '20px 0', fontSize: '0.85rem' }}>
                        No requests yet. Send a request below!
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>
                        {activeRun.requests.map(req => (
                          <div 
                            key={req.id} 
                            style={{
                              padding: '12px', borderRadius: '10px', 
                              background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                                {req.itemName}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                                From: {homemates.find(h => h.id === req.requesterId)?.name.split(' ')[0]}
                              </div>
                            </div>
                            
                            {/* Shopper controls status */}
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {req.status === 'pending' || req.status === 'searching' ? (
                                <>
                                  <button 
                                    style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: 'var(--accent-emerald)', color: 'white' }}
                                    onClick={() => handleUpdateRunRequestStatus(req.id, 'found', 8.50)}
                                  >
                                    Found
                                  </button>
                                  <button 
                                    style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: 'var(--accent-rose)', color: 'white' }}
                                    onClick={() => handleUpdateRunRequestStatus(req.id, 'replaced', undefined, 'Kirkland alternative', 7.99)}
                                  >
                                    Replace
                                  </button>
                                  <button 
                                    style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white' }}
                                    onClick={() => handleUpdateRunRequestStatus(req.id, 'out')}
                                  >
                                    Out
                                  </button>
                                </>
                              ) : (
                                <span style={{
                                  fontSize: '0.75rem', fontWeight: 800, padding: '4px 8px', borderRadius: '6px',
                                  background: req.status === 'found' ? 'rgba(16, 185, 129, 0.15)' : req.status === 'replaced' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                                  color: req.status === 'found' ? 'var(--accent-emerald)' : req.status === 'replaced' ? 'var(--accent-amber)' : 'var(--accent-rose)',
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

                    {/* Add new request input */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        placeholder="Add item request..." 
                        value={newRequestName} 
                        onChange={e => setNewRequestName(e.target.value)} 
                      />
                      <button className="btn-primary" style={{ padding: '0 16px' }} onClick={handleAddRunRequest}>Request</button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setActiveRun(null)}>Cancel Run</button>
                    <button className="btn-primary" style={{ flex: 1, background: 'linear-gradient(135deg, var(--accent-blue) 0%, #2563eb 100%)', boxShadow: '0 4px 15px var(--accent-blue-glow)' }} onClick={handleCheckoutRun}>
                      Checkout & Add Stock
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SPLIT & SETTLE (EXPENSE SPLITTING & RECEIPT SCANNING) */}
          {activeTab === 'split' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Split</h2>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Splitwise style expense settlement</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-secondary" style={{ padding: '8px 12px', borderRadius: '10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => setShowOCRModal(true)}>
                    <Camera size={16} />
                    Scan
                  </button>
                  <button className="btn-primary" style={{ padding: '8px 12px', borderRadius: '10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => setShowAddExpenseModal(true)}>
                    <Plus size={16} />
                    Add Bill
                  </button>
                </div>
              </div>

              {/* Debt suggestions widget */}
              <div className="glass-card" style={{ borderLeft: '4px solid var(--accent-purple)', background: 'rgba(139, 92, 246, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>Settle Suggestions</h3>
                  <button className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '6px' }}
                    onClick={() => setShowSettleModal(true)}>
                    Settle Up
                  </button>
                </div>

                {optimizedDebts.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>All settled! No debts suggestions.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {optimizedDebts.map((debt, index) => {
                      const debtor = homemates.find(h => h.id === debt.debtorId)?.name || 'Someone';
                      const creditor = homemates.find(h => h.id === debt.creditorId)?.name || 'Someone';
                      return (
                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span>{debtor} owes {creditor}</span>
                          <span style={{ fontWeight: 800, color: 'var(--accent-rose)' }}>${debt.amount.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Expenses List */}
              <div className="glass-card">
                <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '14px' }}>Expense History</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {expenses.map(exp => (
                    <div 
                      key={exp.id} 
                      style={{
                        padding: '12px', borderRadius: '10px', 
                        background: 'rgba(255,255,255,0.01)', border: '1px solid var(--glass-border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{exp.title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                          Paid by {homemates.find(h => h.id === exp.payerId)?.name.split(' ')[0]} on {exp.date}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: '1rem' }}>${exp.amount.toFixed(2)}</div>
                        <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'rgba(255,255,255,0.6)' }}>
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
                  background: 'rgba(5,5,8,0.85)', backdropFilter: 'blur(10px)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
                }}>
                  <div className="glass-card" style={{ width: '90%', maxWidth: '400px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Settle Balances</h3>
                      <X size={20} className="cursor-pointer" onClick={() => setShowSettleModal(false)} />
                    </div>
                    {optimizedDebts.length === 0 ? (
                      <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: '20px 0' }}>Nothing to settle!</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {optimizedDebts.map((debt, index) => {
                          const debtor = homemates.find(h => h.id === debt.debtorId);
                          const creditor = homemates.find(h => h.id === debt.creditorId);
                          return (
                            <div 
                              key={index} 
                              style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)',
                                border: '1px solid var(--glass-border)'
                              }}
                            >
                              <div>
                                <span style={{ fontWeight: 600 }}>{debtor?.name}</span>
                                <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.4)' }}>to</span>
                                <span style={{ fontWeight: 600 }}>{creditor?.name}</span>
                              </div>
                              <button 
                                className="btn-primary" 
                                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
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

              {/* OCR Receipt Upload Modal */}
              {showOCRModal && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(5,5,8,0.85)', backdropFilter: 'blur(10px)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
                }}>
                  <div className="glass-card" style={{ width: '90%', maxWidth: '400px', maxHeight: '90%', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Scan Receipt</h3>
                      <X size={20} className="cursor-pointer" onClick={() => { setShowOCRModal(false); setOcrResult(null); }} />
                    </div>
                    
                    {!ocrResult ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center', textAlign: 'center', padding: '20px 0' }}>
                        <div style={{
                          width: '70px', height: '70px', borderRadius: '50%',
                          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem'
                        }}>
                          📷
                        </div>
                        {ocrScanning ? (
                          <div>
                            <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--accent-purple)', margin: '0 auto 10px' }} />
                            <p style={{ fontWeight: 600 }}>Analyzing receipt layout...</p>
                            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>Extracting lines, taxes, and merchant info</p>
                          </div>
                        ) : (
                          <div>
                            <p style={{ fontWeight: 600 }}>Upload receipt snapshot</p>
                            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginTop: '4px', marginBottom: '16px' }}>Supports PNG, JPG, or PDF file types</p>
                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button className="btn-primary" onClick={() => triggerOCRScan('Costco')}>Scan Costco Receipt</button>
                              <button className="btn-secondary" onClick={() => triggerOCRScan('Walmart')}>Scan Walmart Receipt</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* OCR Results display */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                          <div>
                            <h4 style={{ fontWeight: 800 }}>{ocrResult.merchant}</h4>
                            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{ocrResult.date}</span>
                          </div>
                          <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>${ocrResult.total.toFixed(2)}</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>Detected Items</span>
                          {ocrResult.items.map((item: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0' }}>
                              <span>{item.name}</span>
                              <span style={{ fontWeight: 700 }}>${item.price.toFixed(2)}</span>
                            </div>
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                            <span>Tax</span>
                            <span>${ocrResult.tax.toFixed(2)}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setOcrResult(null)}>Rescan</button>
                          <button className="btn-primary" style={{ flex: 1 }} onClick={handleSaveOCRExpense}>Confirm & Split</button>
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
                  background: 'rgba(5,5,8,0.85)', backdropFilter: 'blur(10px)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
                }}>
                  <div className="glass-card" style={{ width: '90%', maxWidth: '400px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Add Expense</h3>
                      <X size={20} className="cursor-pointer" onClick={() => setShowAddExpenseModal(false)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Title</label>
                        <input type="text" placeholder="e.g. WiFi Bill, Electricity" value={newExpTitle} onChange={e => setNewExpTitle(e.target.value)} style={{ marginTop: '4px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Total Amount ($)</label>
                        <input type="number" placeholder="0.00" value={newExpAmount} onChange={e => setNewExpAmount(e.target.value)} style={{ marginTop: '4px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Paid By</label>
                        <select value={newExpPayer} onChange={e => setNewExpPayer(e.target.value)} style={{ marginTop: '4px' }}>
                          {homemates.map(h => (
                            <option key={h.id} value={h.id}>{h.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Split Mode</label>
                        <select value={newExpSplit} onChange={e => setNewExpSplit(e.target.value as any)} style={{ marginTop: '4px' }}>
                          <option value="equal">Split Equally</option>
                          <option value="custom">Split Custom</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Shareholders (Visibility)</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                          {homemates.map(h => (
                            <button
                              key={h.id}
                              style={{
                                padding: '6px 10px', fontSize: '0.8rem', borderRadius: '8px',
                                border: '1px solid var(--glass-border)',
                                background: newExpVisibility.includes(h.id) ? 'var(--accent-purple)' : 'var(--glass-bg)',
                                color: 'white'
                              }}
                              onClick={() => {
                                if (newExpVisibility.includes(h.id)) {
                                  setNewExpVisibility(newExpVisibility.filter(id => id !== h.id));
                                } else {
                                  setNewExpVisibility([...newExpVisibility, h.id]);
                                }
                              }}
                            >
                              {h.name.split(' ')[0]}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                        <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddExpenseModal(false)}>Cancel</button>
                        <button className="btn-primary" style={{ flex: 1 }} onClick={handleAddManualExpense}>Add Expense</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 5: CHAT (SECURED END-TO-END ENCRYPTED HOME CHAT) */}
          {activeTab === 'chat' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '620px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', marginBottom: '14px' }}>
                <Users size={18} style={{ color: 'var(--accent-purple)' }} />
                <div>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Household Chat</h2>
                  <span style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-emerald)' }}></span>
                    End-to-End Encrypted
                  </span>
                </div>
              </div>

              {/* Message History list */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingRight: '4px' }}>
                {chatMessages.map(msg => {
                  const isMe = msg.senderId === currentUser.id;
                  const isSystem = msg.senderId === 'system';
                  const sender = homemates.find(h => h.id === msg.senderId);
                  
                  if (isSystem) {
                    return (
                      <div key={msg.id} style={{
                        alignSelf: 'center', background: 'rgba(255,255,255,0.03)', 
                        padding: '6px 12px', borderRadius: '12px', border: '1px solid var(--glass-border)',
                        fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', margin: '8px 0', textAlign: 'center'
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
                          fontSize: '0.7rem', 
                          fontWeight: 700, 
                          color: sender?.color || 'white',
                          marginBottom: '4px'
                        }}>
                          {sender?.name}
                        </div>
                      )}
                      <div>{msg.text}</div>
                      <span style={{ 
                        fontSize: '0.62rem', 
                        color: 'rgba(255,255,255,0.4)', 
                        display: 'block', 
                        textAlign: 'right',
                        marginTop: '4px'
                      }}>
                        {msg.timestamp}
                      </span>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input row */}
              <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: '12px' }}>
                <input 
                  type="text" 
                  placeholder="Message homemates..." 
                  value={chatInput} 
                  onChange={e => setChatInput(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                />
                <button 
                  className="btn-primary" 
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}
                  onClick={handleSendMessage}
                >
                  <Send size={18} />
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
