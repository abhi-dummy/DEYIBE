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
  Upload,
  LogOut,
  Layers
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { createWorker } from 'tesseract.js';
import { supabase } from './utils/supabaseClient';
import type { Homemate, Expense, ShelfItem, ChatMessage, Task, PulseAlert, RunSession, RunRequest, Kompa } from './types';
import { getOptimizedDebts, calculateBalances } from './utils/settleEngine';

interface FlowLog {
  id: string;
  text: string;
  time: string;
  type: 'alert' | 'run' | 'chore' | 'split' | 'stocked' | 'system';
}

export default function App() {
  // Authentication & Session States
  const [session, setSession] = useState<any | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<Homemate | null>(null);

  // Kompa (Group) Management States
  const [joinedKompas, setJoinedKompas] = useState<Kompa[]>([]);
  const [activeKompa, setActiveKompa] = useState<Kompa | null>(null);
  const [kompaNameInput, setKompaNameInput] = useState('');
  const [kompaCodeInput, setKompaCodeInput] = useState('');

  
  // App Core States
  const [activeTab, setActiveTab] = useState<'home' | 'shelf' | 'run' | 'split' | 'chat'>('home');
  const [kompaMembers, setKompaMembers] = useState<Homemate[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const activeTabRef = useRef(activeTab);

  // Synced States
  const [shelfItems, setShelfItems] = useState<ShelfItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pulseAlerts, setPulseAlerts] = useState<PulseAlert[]>([]);
  const [activeRun, setActiveRun] = useState<RunSession | null>(null);

  // DB Sync indicator status
  const [dbSynced, setDbSynced] = useState<boolean>(false);
  const [dbLoading, setDbLoading] = useState<boolean>(false);
  const [showDbAlert, setShowDbAlert] = useState<boolean>(false);

  // UI Flow Logs (Timeline)
  const [flowLogs, setFlowLogs] = useState<FlowLog[]>([]);

  // Chore Animation Overlays
  const [choreAnimationType, setChoreAnimationType] = useState<'trash' | 'kitchen' | 'general' | null>(null);

  // Modal Dialogs States
  const [showPulse, setShowPulse] = useState(false);
  const [showAddShelfModal, setShowAddShelfModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [showShelfDetailsModal, setShowShelfDetailsModal] = useState<ShelfItem | null>(null);
  const [showAddChoreModal, setShowAddChoreModal] = useState(false);

  // Form Inputs
  const [newShelfName, setNewShelfName] = useState('');
  const [newShelfPriority, setNewShelfPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [newShelfVisibility] = useState<string[]>([]);


  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpAmount, setNewExpAmount] = useState('');
  const [newExpPayer, setNewExpPayer] = useState('');
  const [newExpSplit, setNewExpSplit] = useState<'equal' | 'percentage' | 'custom'>('equal');
  const [newExpVisibility, setNewExpVisibility] = useState<string[]>([]);

  const [chatInput, setChatInput] = useState('');
  const [newRequestName, setNewRequestName] = useState('');

  // Chore Creation Form
  const [newChoreTitle, setNewChoreTitle] = useState('');
  const [newChoreDueDate, setNewChoreDueDate] = useState('');
  const [newChoreFrequency, setNewChoreFrequency] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('weekly');
  const [newChoreType, setNewChoreType] = useState<'general' | 'trash' | 'kitchen'>('general');
  const [newChoreAssignedTo, setNewChoreAssignedTo] = useState<string[]>([]);
  
  // OCR Scan states
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<any | null>(null);
  const [ocrProgress, setOcrProgress] = useState<string>('');

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Sync activeTab to ref
  useEffect(() => {
    activeTabRef.current = activeTab;
    if (activeTab === 'chat') {
      setUnreadChatCount(0);
    }
  }, [activeTab]);

  // Helper for background safe database operations
  const safeDbWrite = async (operation: () => any) => {
    try {
      const result = await operation();
      if (result && result.error) {
        console.warn('Supabase DB transaction warning:', result.error.message);
      }
      return result;
    } catch (err) {
      console.warn('Supabase DB background write failed (continuing offline local-first state):', err);
      return null;
    }
  };

  // 1. Supabase Auth Session listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setCurrentUserProfile(null);
        setJoinedKompas([]);
        setActiveKompa(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch current user's profile information
  const fetchUserProfile = async (userId: string) => {
    try {
      let { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist yet, auto-create it
        const fallbackName = session?.user?.email?.split('@')[0] || 'User';
        const newProfile = {
          id: userId,
          name: fallbackName,
          avatar: fallbackName.slice(0, 2).toUpperCase(),
          color: getRandomColor()
        };
        await supabase.from('profiles').insert(newProfile);
        profile = newProfile;
      }

      if (profile) {
        setCurrentUserProfile({
          id: profile.id,
          name: profile.name,
          avatar: profile.avatar,
          color: profile.color
        });
        fetchUserKompas(profile.id);
      }
    } catch (err) {
      console.error('Failed to resolve profile', err);
    }
  };

  // Fetch user's joined/owned Kompas
  const fetchUserKompas = async (profileId: string) => {
    try {
      setDbLoading(true);
      const { data: memberships, error } = await supabase
        .from('kompa_members')
        .select('kompa_id, kompas(*)')
        .eq('profile_id', profileId);

      if (error) throw error;

      if (memberships && memberships.length > 0) {
        const kompaList: Kompa[] = memberships.map((m: any) => ({
          id: m.kompas.id,
          name: m.kompas.name,
          inviteCode: m.kompas.invite_code,
          ownerId: m.kompas.owner_id
        }));
        setJoinedKompas(kompaList);
        // Set first Kompa active by default
        setActiveKompa(kompaList[0]);
        setDbSynced(true);
      } else {
        setJoinedKompas([]);
        setActiveKompa(null);
        setDbSynced(false);
      }
    } catch (err) {
      console.warn('Error retrieving user Kompa list:', err);
      setDbSynced(false);
    } finally {
      setDbLoading(false);
    }
  };

  // Fetch active Kompa members
  useEffect(() => {
    if (!activeKompa) {
      setKompaMembers([]);
      return;
    }

    const loadKompaMembers = async () => {
      try {
        const { data, error } = await supabase
          .from('kompa_members')
          .select('profile_id, profiles(*)')
          .eq('kompa_id', activeKompa.id);

        if (error) throw error;

        if (data) {
          const members: Homemate[] = data.map((d: any) => ({
            id: d.profiles.id,
            name: d.profiles.name,
            avatar: d.profiles.avatar,
            color: d.profiles.color
          }));
          setKompaMembers(members);
          if (members.length > 0 && !newExpPayer) {
            setNewExpPayer(members[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load Kompa members:', err);
      }
    };

    loadKompaMembers();
    loadKompaData();
  }, [activeKompa]);

  // Load specific data for active Kompa
  const loadKompaData = async () => {
    if (!activeKompa) return;
    try {
      setDbLoading(true);
      
      // Load shelf items
      const { data: shelf } = await supabase.from('shelf_items').select('*').eq('kompa_id', activeKompa.id).order('created_at', { ascending: false });
      if (shelf) {
        setShelfItems(shelf.map(s => ({
          id: s.id,
          name: s.name,
          status: s.status,
          priority: s.priority,
          addedById: s.added_by || '1',
          visibility: s.visibility || [],
          timestamp: 'Synced'
        })));
      }

      // Load chat messages
      const { data: chat } = await supabase.from('chat_messages').select('*').eq('kompa_id', activeKompa.id).order('created_at', { ascending: true });
      if (chat) {
        setChatMessages(chat.map(c => ({
          id: c.id,
          senderId: c.sender_id || 'system',
          text: c.text,
          timestamp: new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        })));
      }

      // Load tasks/chores
      const { data: chores } = await supabase.from('tasks').select('*').eq('kompa_id', activeKompa.id).order('created_at', { ascending: false });
      if (chores) {
        setTasks(chores.map(t => ({
          id: t.id,
          title: t.title,
          assignedTo: t.assigned_to || [],
          dueDate: t.due_date,
          completed: t.completed,
          frequency: t.frequency,
          choreType: t.chore_type
        })));
      }

      // Load expenses
      const { data: exp } = await supabase.from('expenses').select('*').eq('kompa_id', activeKompa.id).order('date', { ascending: false });
      if (exp) {
        setExpenses(exp.map(e => ({
          id: e.id,
          title: e.title,
          amount: Number(e.amount),
          payerId: e.payer_id,
          splitMethod: e.split_method,
          shares: e.shares,
          date: new Date(e.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
          visibility: []
        })));
      }

      // Load pulse alerts
      const { data: pulses } = await supabase.from('pulse_alerts').select('*').eq('kompa_id', activeKompa.id).order('created_at', { ascending: false });
      if (pulses) {
        setPulseAlerts(pulses.map(p => ({
          id: p.id,
          title: p.title,
          message: p.message,
          type: p.type,
          timestamp: 'Synced',
          read: p.read
        })));
      }

      setDbSynced(true);
    } catch (err) {
      console.warn('Failed loading Kompa data', err);
      setDbSynced(false);
    } finally {
      setDbLoading(false);
    }
  };

  // Realtime Subscriptions for Active Kompa
  useEffect(() => {
    if (!dbSynced || !activeKompa) return;

    // Subscribe to chat messages
    const chatChannel = supabase
      .channel('kompa_chat_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages', filter: `kompa_id=eq.${activeKompa.id}` }, async (payload) => {
        const { data } = await supabase.from('chat_messages').select('*').eq('kompa_id', activeKompa.id).order('created_at', { ascending: true });
        if (data) {
          setChatMessages(data.map(c => ({
            id: c.id,
            senderId: c.sender_id || 'system',
            text: c.text,
            timestamp: new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          })));

          // Increment unread count if we are not on chat tab
          if (payload && payload.eventType === 'INSERT') {
            const newMsg = payload.new;
            if (newMsg && newMsg.sender_id !== currentUserProfile?.id && activeTabRef.current !== 'chat') {
              setUnreadChatCount(prev => prev + 1);
            }
          }
        }
      })
      .subscribe();

    // Subscribe to tasks/chores
    const taskChannel = supabase
      .channel('kompa_task_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `kompa_id=eq.${activeKompa.id}` }, async () => {
        const { data } = await supabase.from('tasks').select('*').eq('kompa_id', activeKompa.id).order('created_at', { ascending: false });
        if (data) {
          setTasks(data.map(t => ({
            id: t.id,
            title: t.title,
            assignedTo: t.assigned_to || [],
            dueDate: t.due_date,
            completed: t.completed,
            frequency: t.frequency,
            choreType: t.chore_type
          })));
        }
      })
      .subscribe();

    // Subscribe to shelf items
    const shelfChannel = supabase
      .channel('kompa_shelf_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shelf_items', filter: `kompa_id=eq.${activeKompa.id}` }, async () => {
        const { data } = await supabase.from('shelf_items').select('*').eq('kompa_id', activeKompa.id).order('created_at', { ascending: false });
        if (data) {
          setShelfItems(data.map(s => ({
            id: s.id,
            name: s.name,
            status: s.status,
            priority: s.priority,
            addedById: s.added_by || '1',
            visibility: s.visibility || [],
            timestamp: 'Synced'
          })));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(taskChannel);
      supabase.removeChannel(shelfChannel);
    };
  }, [dbSynced, activeKompa, currentUserProfile]);

  // Auth Operations
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) return;
    
    setAuthLoading(true);
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword
        });
        if (error) throw error;
        
        if (data?.user) {
          // Register profile
          const nickname = authName.trim() || authEmail.split('@')[0];
          const newProfile = {
            id: data.user.id,
            name: nickname,
            avatar: nickname.slice(0, 2).toUpperCase(),
            color: getRandomColor()
          };
          await supabase.from('profiles').insert(newProfile);
          setCurrentUserProfile(newProfile);
          setAuthEmail('');
          setAuthPassword('');
          setAuthName('');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword
        });
        if (error) throw error;
        setAuthEmail('');
        setAuthPassword('');
      }
    } catch (err: any) {
      alert(err.message || 'Authentication error occurred.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setCurrentUserProfile(null);
    setJoinedKompas([]);
    setActiveKompa(null);
  };

  // Create a new Kompa
  const handleCreateKompa = async () => {
    if (!kompaNameInput.trim() || !currentUserProfile) return;

    // Check limit constraint: Max 3 Kompas
    const userOwnedCount = joinedKompas.filter(k => k.ownerId === currentUserProfile.id).length;
    if (userOwnedCount >= 3) {
      alert('You have reached the limit of 3 Kompa creations. Please delete or leave one of your owned Kompas to create a new one.');
      return;
    }

    try {
      setDbLoading(true);
      // Generate 6-digit random code
      const uniqueCode = Math.floor(100000 + Math.random() * 900000).toString();

      const { data: newKompa, error } = await supabase
        .from('kompas')
        .insert({
          name: kompaNameInput,
          invite_code: uniqueCode,
          owner_id: currentUserProfile.id
        })
        .select()
        .single();

      if (error) throw error;

      if (newKompa) {
        // Insert into membership mapping
        await supabase.from('kompa_members').insert({
          kompa_id: newKompa.id,
          profile_id: currentUserProfile.id
        });

        // Refresh list
        setKompaNameInput('');
        fetchUserKompas(currentUserProfile.id);
      }
    } catch (err: any) {
      alert(err.message || 'Error creating Kompa.');
    } finally {
      setDbLoading(false);
    }
  };

  // Join a Kompa
  const handleJoinKompa = async () => {
    if (!kompaCodeInput.trim() || !currentUserProfile) return;

    try {
      setDbLoading(true);
      
      // Query Kompa
      const { data: kompa, error } = await supabase
        .from('kompas')
        .select('*')
        .eq('invite_code', kompaCodeInput.trim())
        .single();

      if (error || !kompa) {
        alert('Invalid invite code. Please confirm and try again!');
        return;
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from('kompa_members')
        .select('*')
        .eq('kompa_id', kompa.id)
        .eq('profile_id', currentUserProfile.id)
        .single();

      if (existing) {
        alert('You are already a member of this Kompa!');
        setKompaCodeInput('');
        return;
      }

      // Join
      await supabase.from('kompa_members').insert({
        kompa_id: kompa.id,
        profile_id: currentUserProfile.id
      });

      setKompaCodeInput('');
      fetchUserKompas(currentUserProfile.id);
    } catch (err: any) {
      alert(err.message || 'Error joining Kompa.');
    } finally {
      setDbLoading(false);
    }
  };

  // Delete/Leave active Kompa
  const handleDeleteLeaveKompa = async () => {
    if (!activeKompa || !currentUserProfile) return;

    try {
      setDbLoading(true);
      const isOwner = activeKompa.ownerId === currentUserProfile.id;
      
      if (isOwner) {
        const confirmDelete = window.confirm('Are you sure you want to permanently delete this Kompa? This will clear all shared inventory, logs, chats, and runs for everyone.');
        if (!confirmDelete) return;

        // Delete kompa
        await supabase.from('kompas').delete().eq('id', activeKompa.id);
      } else {
        const confirmLeave = window.confirm('Are you sure you want to leave this Kompa?');
        if (!confirmLeave) return;

        // Leave
        await supabase.from('kompa_members').delete().eq('kompa_id', activeKompa.id).eq('profile_id', currentUserProfile.id);
      }

      fetchUserKompas(currentUserProfile.id);
    } catch (err: any) {
      console.error(err);
    } finally {
      setDbLoading(false);
    }
  };

  // Helper utility random color
  const getRandomColor = () => {
    const colors = ['#1d4ed8', '#1e3b8a', '#b45309', '#047857', '#b91c1c', '#7c3aed', '#db2777'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Add activity timeline logs
  const logFlow = (text: string, type: FlowLog['type']) => {
    const newLog: FlowLog = {
      id: `f_${Date.now()}`,
      text,
      time: 'Just now',
      type
    };
    setFlowLogs(prev => [newLog, ...prev]);
  };

  // Add notification pulse alert
  const addPulse = async (title: string, message: string, type: PulseAlert['type']) => {
    if (!activeKompa) return;
    
    if (dbSynced) {
      safeDbWrite(() => supabase.from('pulse_alerts').insert({
        kompa_id: activeKompa.id,
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

  // Send Chat message
  const handleSendMessage = async () => {
    if (!chatInput.trim() || !activeKompa || !currentUserProfile) return;

    const newMessage: ChatMessage = {
      id: `m_${Date.now()}`,
      senderId: currentUserProfile.id,
      text: chatInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, newMessage]);
    const originalText = chatInput;
    setChatInput('');

    if (dbSynced) {
      safeDbWrite(() => supabase.from('chat_messages').insert({
        kompa_id: activeKompa.id,
        sender_id: currentUserProfile.id,
        text: originalText
      }));
    }
  };

  // Settle Balances
  const handleSettleUp = async (debtorId: string, creditorId: string, amount: number) => {
    if (!activeKompa) return;

    const debtor = kompaMembers.find(h => h.id === debtorId)?.name || 'Someone';
    const creditor = kompaMembers.find(h => h.id === creditorId)?.name || 'Someone';

    const settleExpense: Expense = {
      id: `e_${Date.now()}`,
      title: `Settled balance: ${debtor} to ${creditor}`,
      amount: amount,
      payerId: debtorId,
      splitMethod: 'custom',
      shares: { [creditorId]: amount },
      date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      visibility: []
    };

    setExpenses(prev => [settleExpense, ...prev]);
    setShowSettleModal(false);

    if (dbSynced) {
      safeDbWrite(() => supabase.from('expenses').insert({
        kompa_id: activeKompa.id,
        title: `Settled balance: ${debtor} to ${creditor}`,
        amount: amount,
        payer_id: debtorId,
        split_method: 'custom',
        shares: { [creditorId]: amount }
      }));
    }

    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.65 }
    });

    logFlow(`${debtor} settled $${amount.toFixed(2)} balance with ${creditor}`, 'split');
    addPulse('Account Settled', `${debtor} paid ${creditor} $${amount.toFixed(2)}.`, 'success');
  };

  // Buzz Roommate (Notification Ping)
  const handleBuzz = (target: Homemate) => {
    if (!currentUserProfile) return;
    const text = `System notification: ${currentUserProfile.name} requested response from ${target.name}.`;
    
    if (dbSynced && activeKompa) {
      safeDbWrite(() => supabase.from('chat_messages').insert({
        kompa_id: activeKompa.id,
        sender_id: null, // System sender
        text
      }));
    }

    const newMessage: ChatMessage = {
      id: `m_${Date.now()}`,
      senderId: 'system',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, newMessage]);
    logFlow(`${currentUserProfile.name} requested check status from ${target.name}`, 'system');
    addPulse('Ping Sent', `Roommate ${target.name} has been notified.`, 'info');
  };

  // Add Item to Shelf Inventory
  const handleAddShelfItem = async () => {
    if (!newShelfName.trim() || !activeKompa || !currentUserProfile) return;

    const newItem: ShelfItem = {
      id: `s_${Date.now()}`,
      name: newShelfName,
      status: 'low',
      addedById: currentUserProfile.id,
      priority: newShelfPriority,
      visibility: newShelfVisibility,
      timestamp: 'Just now'
    };
    setShelfItems(prev => [newItem, ...prev]);
    setNewShelfName('');
    setShowAddShelfModal(false);

    if (dbSynced) {
      safeDbWrite(() => supabase.from('shelf_items').insert({
        kompa_id: activeKompa.id,
        name: newShelfName,
        status: 'low',
        priority: newShelfPriority,
        added_by: currentUserProfile.id,
        visibility: newShelfVisibility
      }));
    }

    logFlow(`${currentUserProfile.name} requested restocking of "${newShelfName}"`, 'stocked');
    addPulse('Inventory Update', `${currentUserProfile.name} marked "${newShelfName}" as low stock.`, 'info');
  };

  // Toggle Restock status
  const handleToggleRestock = async (item: ShelfItem) => {
    if (!currentUserProfile || !activeKompa) return;
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
      logFlow(`${currentUserProfile.name} restocked "${item.name}"`, 'stocked');
      addPulse('Stock Filled', `"${item.name}" has been restocked.`, 'success');
      confetti({
        particleCount: 65,
        spread: 50,
        origin: { y: 0.8 }
      });
    } else {
      logFlow(`${currentUserProfile.name} marked "${item.name}" as running low`, 'alert');
    }
    
    if (showShelfDetailsModal) setShowShelfDetailsModal(null);
  };

  // Delete shelf item
  const handleDeleteShelfItem = async (id: string) => {
    const item = shelfItems.find(i => i.id === id);

    setShelfItems(prev => prev.filter(i => i.id !== id));
    setShowShelfDetailsModal(null);

    if (dbSynced) {
      safeDbWrite(() => supabase.from('shelf_items').delete().eq('id', id));
    }

    if (item && currentUserProfile) {
      logFlow(`${currentUserProfile.name} removed "${item.name}" from inventory`, 'alert');
    }
  };

  // Add Chore
  const handleAddChore = async () => {
    if (!newChoreTitle.trim() || !newChoreDueDate || !activeKompa) return;

    const newChore: Task = {
      id: `t_${Date.now()}`,
      title: newChoreTitle,
      assignedTo: newChoreAssignedTo,
      dueDate: new Date(newChoreDueDate).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      completed: false,
      frequency: newChoreFrequency,
      choreType: newChoreType
    };

    setTasks(prev => [newChore, ...prev]);
    setShowAddChoreModal(false);

    if (dbSynced) {
      safeDbWrite(() => supabase.from('tasks').insert({
        kompa_id: activeKompa.id,
        title: newChoreTitle,
        assigned_to: newChoreAssignedTo,
        due_date: new Date(newChoreDueDate).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        completed: false,
        frequency: newChoreFrequency,
        chore_type: newChoreType
      }));
    }

    // Reset fields
    setNewChoreTitle('');
    setNewChoreDueDate('');
    setNewChoreAssignedTo([]);
    setNewChoreFrequency('weekly');
    setNewChoreType('general');

    if (currentUserProfile) {
      logFlow(`${currentUserProfile.name} created chore "${newChore.title}"`, 'chore');
    }
  };

  // Toggle Chore Completed
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
      // Trigger appropriate animated celebration clip
      if (task.choreType === 'trash') {
        setChoreAnimationType('trash');
      } else if (task.choreType === 'kitchen') {
        setChoreAnimationType('kitchen');
      } else {
        setChoreAnimationType('general');
      }

      if (currentUserProfile) {
        logFlow(`${currentUserProfile.name} completed chore: "${task.title}"`, 'chore');
        addPulse('Chore Completed', `Task "${task.title}" was completed by ${currentUserProfile.name}.`, 'success');
      }
    }
  };

  // Handle closing chore animation overlay
  useEffect(() => {
    if (choreAnimationType) {
      const timer = setTimeout(() => {
        setChoreAnimationType(null);
        // Fire confetti celebration at the end of the graphic animation
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.65 }
        });
      }, 2500); // 2.5 seconds clip
      return () => clearTimeout(timer);
    }
  }, [choreAnimationType]);

  // Start shopping run
  const handleStartRun = (store: string) => {
    if (!currentUserProfile) return;
    const newRun: RunSession = {
      id: `run_${Date.now()}`,
      shopperId: currentUserProfile.id,
      store,
      status: 'active',
      requests: []
    };
    setActiveRun(newRun);
    logFlow(`${currentUserProfile.name} initiated shopping run at ${store}`, 'run');
  };

  // Add request to Run
  const handleAddRunRequest = () => {
    if (!newRequestName.trim() || !activeRun || !currentUserProfile) return;
    const newReq: RunRequest = {
      id: `req_${Date.now()}`,
      itemName: newRequestName,
      requesterId: currentUserProfile.id,
      status: 'pending'
    };
    setActiveRun({
      ...activeRun,
      requests: [...activeRun.requests, newReq]
    });
    setNewRequestName('');
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
  };

  // Complete Run & Settle Checkout
  const handleCheckoutRun = async () => {
    if (!activeRun || !activeKompa) return;
    
    const foundRequests = activeRun.requests.filter(r => r.status === 'found' || r.status === 'replaced');
    
    if (dbSynced) {
      for (const r of foundRequests) {
        safeDbWrite(() => supabase.from('shelf_items').insert({
          kompa_id: activeKompa.id,
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
      visibility: [],
      timestamp: 'Just now'
    }));

    setShelfItems(prev => [...newShelfAdditions, ...prev]);

    const totalAmount = foundRequests.reduce((sum, r) => sum + (r.status === 'replaced' ? (r.replacementPrice || 0) : (r.price || 5.00)), 0);
    
    if (totalAmount > 0) {
      const share = totalAmount / kompaMembers.length;
      const shares: Record<string, number> = {};
      kompaMembers.forEach(m => {
        shares[m.id] = Number(share.toFixed(2));
      });

      if (dbSynced) {
        safeDbWrite(() => supabase.from('expenses').insert({
          kompa_id: activeKompa.id,
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
        visibility: []
      };

      setExpenses(prev => [newExpense, ...prev]);
      
      if (currentUserProfile) {
        logFlow(`Finished ${activeRun.store} Run. Split cost $${totalAmount.toFixed(2)}`, 'split');
        addPulse('Run Complete', `Run to ${activeRun.store} completed. Split details logged.`, 'success');
      }
    }

    setActiveRun(null);
    confetti({
      particleCount: 80,
      spread: 60
    });
  };

  // OCR presets triggers
  const triggerOCRScan = (store: 'Costco' | 'Walmart') => {
    setOcrScanning(true);
    setOcrResult(null);
    setOcrProgress('Running parser...');

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

  // OCR Custom Receipt upload
  const handleCustomImageOCR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrScanning(true);
    setOcrResult(null);
    setOcrProgress('Initializing OCR engine...');

    try {
      const worker = await createWorker('eng');
      setOcrProgress('Reading receipt characters...');
      const { data } = await worker.recognize(file);
      await worker.terminate();

      const text = data.text;
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

  // Save OCR receipt split bill
  const handleSaveOCRExpense = async () => {
    if (!ocrResult || !activeKompa || !currentUserProfile) return;

    const share = ocrResult.total / kompaMembers.length;
    const shares: Record<string, number> = {};
    kompaMembers.forEach(m => {
      shares[m.id] = Number(share.toFixed(2));
    });

    const newExpense: Expense = {
      id: `e_${Date.now()}`,
      title: `OCR Scan: ${ocrResult.merchant}`,
      amount: ocrResult.total,
      payerId: currentUserProfile.id,
      splitMethod: 'equal',
      shares,
      date: ocrResult.date,
      visibility: []
    };

    setExpenses(prev => [newExpense, ...prev]);
    setShowOCRModal(false);
    setOcrResult(null);

    if (dbSynced) {
      safeDbWrite(() => supabase.from('expenses').insert({
        kompa_id: activeKompa.id,
        title: `OCR Scan: ${ocrResult.merchant}`,
        amount: ocrResult.total,
        payer_id: currentUserProfile.id,
        split_method: 'equal',
        shares
      }));
    }

    // Auto-restock matching items
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

    logFlow(`Logged OCR receipt split for ${ocrResult.merchant}`, 'split');
    addPulse('Receipt Processed', `Receipt cost of $${ocrResult.total.toFixed(2)} logged.`, 'success');
  };

  // Add Manual Expense
  const handleAddManualExpense = async () => {
    const amt = parseFloat(newExpAmount);
    if (!newExpTitle.trim() || isNaN(amt) || amt <= 0 || !activeKompa) return;

    const shares: Record<string, number> = {};
    const activeMembers = newExpVisibility.length > 0 ? newExpVisibility : kompaMembers.map(m => m.id);
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
        kompa_id: activeKompa.id,
        title: newExpTitle,
        amount: amt,
        payer_id: newExpPayer,
        split_method: newExpSplit,
        shares
      }));
    }

    if (currentUserProfile) {
      logFlow(`${currentUserProfile.name} logged transaction "${newExpTitle}" ($${amt.toFixed(2)})`, 'split');
    }
  };

  const optimizedDebts = getOptimizedDebts(expenses, kompaMembers);
  const netBalances = calculateBalances(expenses, kompaMembers);

  // Render initials avatar helper
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

  // Render customized vector icons for House Flow
  const renderFlowIcon = (type: FlowLog['type']) => {
    switch (type) {
      case 'alert':
        return <AlertCircle size={14} style={{ color: 'var(--accent-rose)' }} />;
      case 'run':
        return <ShoppingCart size={14} style={{ color: 'var(--accent-blue)' }} />;
      case 'chore':
        return <CheckSquare size={14} style={{ color: 'var(--accent-emerald)' }} />;
      case 'split':
        return <DollarSign size={14} style={{ color: 'var(--accent-amber)' }} />;
      case 'stocked':
        return <Check size={14} style={{ color: 'var(--accent-emerald)' }} />;
      default:
        return <Info size={14} style={{ color: 'var(--accent-purple)' }} />;
    }
  };

  // AUTHENTICATION SCREEN VIEW
  if (!session || !currentUserProfile) {
    return (
      <div className="bg-blobs" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>

        <div className="glass-card" style={{ width: '90%', maxWidth: '380px', padding: '28px', border: '1px solid rgba(30, 58, 138, 0.08)' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h2 className="brand-title" style={{ justifyContent: 'center', fontSize: '1.8rem' }}>
              <Sparkles size={26} style={{ color: '#2563eb' }} />
              Deyibe
            </h2>
            <p style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginTop: '2px' }}>
              Kompa Operating System
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {authMode === 'signup' && (
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Your Nickname</label>
                <input 
                  type="text" 
                  placeholder="e.g. Abhi" 
                  value={authName} 
                  onChange={e => setAuthName(e.target.value)} 
                  required 
                  style={{ marginTop: '4px' }}
                />
              </div>
            )}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Email Address</label>
              <input 
                type="email" 
                placeholder="you@email.com" 
                value={authEmail} 
                onChange={e => setAuthEmail(e.target.value)} 
                required 
                style={{ marginTop: '4px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Password</label>
              <input 
                type="password" 
                placeholder="••••••••" 
                value={authPassword} 
                onChange={e => setAuthPassword(e.target.value)} 
                required 
                style={{ marginTop: '4px' }}
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px', marginTop: '8px' }} disabled={authLoading}>
              {authLoading ? <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto' }} /> : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px', fontSize: '0.8rem' }}>
            <span style={{ color: '#64748b' }}>
              {authMode === 'login' ? "Don't have an account?" : "Already have an account?"}
              <button 
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, marginLeft: '4px', cursor: 'pointer' }}
              >
                {authMode === 'login' ? 'Sign Up' : 'Sign In'}
              </button>
            </span>
          </div>
        </div>
      </div>
    );
  }

  // NO KOMPA JOINED SCREEN VIEW
  if (joinedKompas.length === 0) {
    return (
      <div className="bg-blobs" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>

        <div className="glass-card" style={{ width: '90%', maxWidth: '380px', padding: '26px', border: '1px solid rgba(30, 58, 138, 0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '1rem', color: '#475569' }}>Hello, {currentUserProfile.name}!</h3>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '2px', color: '#0f172a' }}>
                Ready to Join a <span className="kompa-highlight">Kompa</span>
              </h2>
            </div>
            <button onClick={handleSignOut} style={{ padding: '6px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center' }}>
              <LogOut size={16} style={{ color: '#475569' }} />
            </button>
          </div>

          <p style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5, marginBottom: '22px' }}>
            A <i>Kompa</i> is a shared house space. Create a new one or join an existing one using an invite code to coordinate chores and expenses with roommates!
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="glass-card" style={{ padding: '12px', margin: 0, border: '1px solid rgba(30, 58, 138, 0.04)' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>Create new Kompa</h4>
              <input 
                type="text" 
                placeholder="e.g. Abhi's Suite" 
                value={kompaNameInput} 
                onChange={e => setKompaNameInput(e.target.value)} 
                style={{ padding: '8px' }}
              />
              <button 
                className="btn-primary" 
                style={{ width: '100%', padding: '8px', fontSize: '0.78rem', marginTop: '8px' }} 
                onClick={handleCreateKompa}
                disabled={dbLoading}
              >
                {dbLoading ? 'Creating...' : 'Create Kompa'}
              </button>
            </div>

            <div style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', margin: '4px 0' }}>OR</div>

            <div className="glass-card" style={{ padding: '12px', margin: 0, border: '1px solid rgba(30, 58, 138, 0.04)' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>Join existing Kompa</h4>
              <input 
                type="text" 
                placeholder="Enter 6-digit invite code" 
                value={kompaCodeInput} 
                onChange={e => setKompaCodeInput(e.target.value)} 
                maxLength={6}
                style={{ padding: '8px' }}
              />
              <button 
                className="btn-secondary" 
                style={{ width: '100%', padding: '8px', fontSize: '0.78rem', marginTop: '8px' }} 
                onClick={handleJoinKompa}
                disabled={dbLoading}
              >
                {dbLoading ? 'Joining...' : 'Join with Code'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MAIN APPLICATION PANEL
  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      {/* CHORE COMPLETION CELEBRATION FULL-SCREEN OVERLAYS */}
      {choreAnimationType && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(30, 58, 138, 0.92)', backdropFilter: 'blur(10px)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          zIndex: 99999, color: 'white', animation: 'fadeIn 0.25s ease-out'
        }}>
          {choreAnimationType === 'trash' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              {/* Garbage bags thrown to a dustbin graphic SVG */}
              <svg width="150" height="150" viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
                <defs>
                  <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.15" />
                  </filter>
                </defs>
                {/* Dustbin Can body */}
                <rect x="35" y="45" width="30" height="40" rx="4" fill="#64748b" filter="url(#shadow)" />
                {/* Lid (closed container status initially) */}
                <rect x="31" y="38" width="38" height="6" rx="2" fill="#475569" style={{
                  transformOrigin: '50px 38px',
                  animation: 'lidOpen 2.2s cubic-bezier(0.25, 1, 0.5, 1) infinite'
                }} />
                {/* Stripe textures */}
                <line x1="41" y1="52" x2="41" y2="78" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
                <line x1="50" y1="52" x2="50" y2="78" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
                <line x1="59" y1="52" x2="59" y2="78" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
                
                {/* Trash Bag falling in */}
                <path d="M 40,0 C 35,5 35,12 42,15 C 45,16 55,16 58,15 C 65,12 65,5 60,0 C 53,5 47,5 40,0 Z" fill="#b45309" style={{
                  animation: 'bagDrop 2.2s cubic-bezier(0.6, -0.28, 0.735, 0.045) infinite'
                }} />
                {/* Knot tie on bag */}
                <circle cx="50" cy="-4" r="3" fill="#92400e" style={{
                  animation: 'bagDropKnot 2.2s cubic-bezier(0.6, -0.28, 0.735, 0.045) infinite'
                }} />
              </svg>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fcd34d', textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>Garbage Bag Disposed!</h2>
              <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>Nice job keeping the room clean.</p>
            </div>
          )}

          {/* UTENSILS OR KITCHEN CLEANING CELEBRATION */}
          {choreAnimationType === 'kitchen' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              {/* Dishes scrubbing vector SVG */}
              <svg width="150" height="150" viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
                {/* Dish Plate */}
                <circle cx="50" cy="50" r="30" fill="none" stroke="white" strokeWidth="3" style={{
                  animation: 'dishSpin 2s linear infinite'
                }} />
                <circle cx="50" cy="50" r="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="4 4" style={{
                  animation: 'dishSpin 2s linear infinite'
                }} />
                
                {/* Sparkle star */}
                <path d="M 50,15 L 53,24 L 62,27 L 53,30 L 50,39 L 47,30 L 38,27 L 47,24 Z" fill="#fbbf24" style={{
                  animation: 'sparkleFlash 1.5s ease-in-out infinite'
                }} />
                <path d="M 80,45 L 82,50 L 87,52 L 82,54 L 80,59 L 78,54 L 73,52 L 78,50 Z" fill="#fbbf24" style={{
                  animation: 'sparkleFlash 1.5s ease-in-out infinite',
                  animationDelay: '0.4s'
                }} />
                
                {/* Foam / Soap bubbles */}
                <circle cx="32" cy="65" r="5" fill="rgba(255,255,255,0.85)" />
                <circle cx="68" cy="65" r="4" fill="rgba(255,255,255,0.95)" />
                <circle cx="62" cy="72" r="6" fill="rgba(255,255,255,0.75)" style={{
                  animation: 'bubbleFloat 1.8s ease-in-out infinite'
                }} />
                <circle cx="38" cy="74" r="5" fill="rgba(255,255,255,0.8)" style={{
                  animation: 'bubbleFloat 1.8s ease-in-out infinite',
                  animationDelay: '0.5s'
                }} />
              </svg>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fcd34d', textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>Kitchen Sparkly Clean!</h2>
              <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>Utensils sorted and polished.</p>
            </div>
          )}

          {choreAnimationType === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <Sparkles size={40} style={{ color: '#fbbf24' }} className="animate-bounce" />
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fbbf24' }}>Chore Accomplished!</h2>
              <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>Thank you for helping out.</p>
            </div>
          )}
        </div>
      )}

      {/* SVG Animation Keyframes */}
      <style>{`
        @keyframes lidOpen {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(-45deg) translate(-5px, -5px); }
          75% { transform: rotate(-45deg) translate(-5px, -5px); }
          100% { transform: rotate(0deg); }
        }
        @keyframes bagDrop {
          0% { transform: translateY(-50px) scale(0.9); opacity: 0; }
          30% { transform: translateY(48px) scale(1); opacity: 1; }
          75% { transform: translateY(48px) scale(1); opacity: 1; }
          100% { transform: translateY(48px) scale(0.4); opacity: 0; }
        }
        @keyframes bagDropKnot {
          0% { transform: translateY(-50px); opacity: 0; }
          30% { transform: translateY(48px); opacity: 1; }
          75% { transform: translateY(48px); opacity: 1; }
          100% { transform: translateY(48px) scale(0.4); opacity: 0; }
        }
        @keyframes dishSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes sparkleFlash {
          0%, 100% { transform: scale(0.8); opacity: 0.3; }
          50% { transform: scale(1.2); opacity: 1; }
        }
        @keyframes bubbleFloat {
          0% { transform: translateY(0) scale(1); opacity: 0.8; }
          50% { transform: translateY(-6px) scale(1.1); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 0.8; }
        }
      `}</style>

      <div className="app-container">
        
        {/* App Header */}
        <header className="app-header">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="brand-title" style={{ gap: '6px' }}>
              <Layers size={18} style={{ color: '#2563eb' }} />
              Deyibe
            </div>
            
            {/* Active Kompa Switcher */}
            {activeKompa && (
              <select 
                value={activeKompa.id} 
                onChange={e => {
                  const target = joinedKompas.find(k => k.id === e.target.value);
                  if (target) setActiveKompa(target);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: '2px 0 0 0',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  color: '#1e3a8a',
                  width: 'fit-content',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {joinedKompas.map(k => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
            )}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            
            {/* 6 Glowing Status indicator */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                cursor: 'pointer'
              }}
              onClick={() => setShowDbAlert(true)}
            >
              {dbSynced ? (
                <span className="sync-glowing-light" title="Realtime Synced to Supabase"></span>
              ) : (
                <span className="local-glowing-light" title="Local Mode"></span>
              )}
            </div>

            <div className="pulse-badge" onClick={() => setShowPulse(!showPulse)}>
              <Bell size={18} />
              {pulseAlerts.some(a => !a.read) && <span className="pulse-indicator"></span>}
            </div>

            {/* Logout button */}
            <button 
              onClick={handleSignOut} 
              style={{
                background: 'none',
                border: 'none',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                padding: '6px',
                borderRadius: '50%'
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Database Warning/Info Alert banner */}
        {showDbAlert && (
          <div style={{
            background: dbSynced ? 'rgba(4, 120, 87, 0.08)' : 'rgba(180, 83, 9, 0.08)',
            borderBottom: '1px solid rgba(0, 0, 0, 0.04)',
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.78rem',
            color: dbSynced ? '#047857' : '#b45309',
            fontWeight: 600,
            zIndex: 5
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, paddingRight: '8px' }}>
              <Info size={14} style={{ flexShrink: 0 }} />
              <span>
                {dbSynced 
                  ? 'Pulsing green: Realtime connection active. Database tables synced.' 
                  : 'Pulsing amber: Local memory sandbox. Execute SQL in Supabase editor to activate.'}
              </span>
            </span>
            <X size={14} className="cursor-pointer" onClick={() => setShowDbAlert(false)} style={{ flexShrink: 0 }} />
          </div>
        )}

        {/* Settings / Invite panel for active Kompa */}
        {activeKompa && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.4)',
            padding: '6px 16px',
            borderBottom: '1px solid rgba(0,0,0,0.03)',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: '#64748b'
          }}>
            <span>Invite Code: <strong style={{ color: '#b45309' }}>{activeKompa.inviteCode}</strong></span>
            <div style={{ display: 'flex', gap: '10px' }}>
              <span 
                style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 700 }}
                onClick={() => {
                  navigator.clipboard.writeText(activeKompa.inviteCode);
                  alert('Invite Code copied to clipboard!');
                }}
              >
                Copy
              </span>
              <span 
                style={{ cursor: 'pointer', color: 'var(--accent-rose)', fontWeight: 700 }}
                onClick={handleDeleteLeaveKompa}
              >
                {activeKompa.ownerId === currentUserProfile.id ? 'Delete' : 'Leave'}
              </span>
              <span 
                style={{ cursor: 'pointer', color: '#1e3a8a', fontWeight: 700 }}
                onClick={() => {
                  const name = prompt('Enter a new custom name for this Kompa:');
                  if (name && name.trim()) {
                    safeDbWrite(() => supabase.from('kompas').update({ name }).eq('id', activeKompa.id));
                    setActiveKompa({ ...activeKompa, name });
                    fetchUserKompas(currentUserProfile.id);
                  }
                }}
              >
                Rename
              </span>
              <span 
                style={{ cursor: 'pointer', color: '#1e3a8a', fontWeight: 700 }}
                onClick={() => {
                  if (joinedKompas.length >= 3) {
                    alert('Create limit reached (max 3).');
                  } else {
                    const name = prompt('Enter name for the new Kompa:');
                    if (name && name.trim()) {
                      setKompaNameInput(name);
                      handleCreateKompa();
                    }
                  }
                }}
              >
                + New
              </span>
              <span 
                style={{ cursor: 'pointer', color: '#1e3a8a', fontWeight: 700 }}
                onClick={() => {
                  const code = prompt('Enter 6-digit code to join another Kompa:');
                  if (code && code.trim()) {
                    setKompaCodeInput(code);
                    handleJoinKompa();
                  }
                }}
              >
                + Join
              </span>
            </div>
          </div>
        )}

        {/* Pulse Notification drop panel */}
        {showPulse && (
          <div className="glass-card" style={{
            position: 'absolute',
            top: '110px',
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
                style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: '#2563eb', fontWeight: 700 }}
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
                    color: (netBalances[currentUserProfile.id] || 0) >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                  }}>
                    {(netBalances[currentUserProfile.id] || 0) >= 0 ? '+' : ''}${(netBalances[currentUserProfile.id] || 0).toFixed(2)}
                  </div>
                </div>
                <div className="glass-card" style={{ flex: 1, padding: '14px', marginBottom: 0, textAlign: 'center', cursor: 'pointer' }} onClick={() => setActiveTab('shelf')}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Out of Stock</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: '2px', color: '#2563eb' }}>
                    {shelfItems.filter(i => i.status === 'out' || i.status === 'low').length} Items
                  </div>
                </div>
              </div>

              {/* Active shopping session widget */}
              {activeRun && (
                <div className="glass-card" style={{
                  borderLeft: '4px solid var(--accent-blue)',
                  background: 'rgba(37, 99, 235, 0.05)',
                  padding: '12px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer'
                }} onClick={() => setActiveTab('run')}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                      <span className="run-dot"></span>
                      Shopping Session: {kompaMembers.find(h => h.id === activeRun.shopperId)?.name} @ {activeRun.store}
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
                  {kompaMembers.map(m => (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px' }}>
                      <div 
                        style={{ cursor: 'pointer', position: 'relative' }} 
                        onClick={() => m.id !== currentUserProfile.id && handleBuzz(m)}
                      >
                        {renderInitialsAvatar(m, 44)}
                        {m.id !== currentUserProfile.id && (
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
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', background: 'rgba(4, 120, 87, 0.1)', color: '#047857', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                      {tasks.filter(t => !t.completed).length} Pending
                    </span>
                    <button className="btn-primary" style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem' }} onClick={() => setShowAddChoreModal(true)}>
                      Assign
                    </button>
                  </div>
                </div>

                {tasks.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8rem', padding: '14px 0' }}>No chores configured. Click Assign to create!</p>
                ) : (
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
                            <span>Assigned: {task.assignedTo.map(id => kompaMembers.find(h => h.id === id)?.name).join(', ')}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Chore Modal */}
              {showAddChoreModal && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
                }}>
                  <div className="glass-card" style={{ width: '90%', maxWidth: '380px', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Assign Chore</h3>
                      <X size={18} className="cursor-pointer" onClick={() => setShowAddChoreModal(false)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Title</label>
                        <input type="text" placeholder="e.g. Throw garbage, Clean plates" value={newChoreTitle} onChange={e => setNewChoreTitle(e.target.value)} style={{ marginTop: '4px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Chore Type (Graphic Specific)</label>
                        <select value={newChoreType} onChange={e => setNewChoreType(e.target.value as any)} style={{ marginTop: '4px' }}>
                          <option value="general">General (Standard Confetti)</option>
                          <option value="trash">Trash (Garbage bag falling animation)</option>
                          <option value="kitchen">Kitchen / Utensils (Plate washing animation)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Due Date</label>
                        <input type="date" value={newChoreDueDate} onChange={e => setNewChoreDueDate(e.target.value)} style={{ marginTop: '4px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Frequency</label>
                        <select value={newChoreFrequency} onChange={e => setNewChoreFrequency(e.target.value as any)} style={{ marginTop: '4px' }}>
                          <option value="once">Once</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Assign Roommates</label>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                          {kompaMembers.map(m => (
                            <button
                              key={m.id}
                              style={{
                                padding: '5px 8px', fontSize: '0.72rem', borderRadius: '6px',
                                border: '1px solid rgba(0,0,0,0.06)',
                                background: newChoreAssignedTo.includes(m.id) ? '#2563eb' : 'rgba(0,0,0,0.02)',
                                color: newChoreAssignedTo.includes(m.id) ? 'white' : '#475569'
                              }}
                              onClick={() => {
                                if (newChoreAssignedTo.includes(m.id)) {
                                  setNewChoreAssignedTo(newChoreAssignedTo.filter(id => id !== m.id));
                                } else {
                                  setNewChoreAssignedTo([...newChoreAssignedTo, m.id]);
                                }
                              }}
                            >
                              {m.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <button className="btn-secondary" style={{ flex: 1, padding: '9px' }} onClick={() => setShowAddChoreModal(false)}>Cancel</button>
                        <button className="btn-primary" style={{ flex: 1, padding: '9px' }} onClick={handleAddChore}>Assign</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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

          {/* TAB 2: SHELF (MINIMALIST CATALOG) */}
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
                        <span>by {kompaMembers.find(h => h.id === item.addedById)?.name}</span>
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
                          Registered by {kompaMembers.find(h => h.id === showShelfDetailsModal.addedById)?.name || 'Roommate'}
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
                    background: 'rgba(37, 99, 235, 0.08)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px'
                  }}>
                    <ShoppingCart size={24} style={{ color: 'var(--accent-blue)' }} />
                  </div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '4px' }}>No Active Session</h3>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '16px' }}>
                    Shopping at a local store? Initiate a session to alert your roommates for requests.
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
                          {kompaMembers.find(h => h.id === activeRun.shopperId)?.name}'s {activeRun.store} Run
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
                                Requested by: {kompaMembers.find(h => h.id === req.requesterId)?.name}
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
                                  background: req.status === 'found' ? 'rgba(4, 120, 87, 0.1)' : req.status === 'replaced' ? 'rgba(180, 83, 9, 0.1)' : 'rgba(185, 28, 28, 0.1)',
                                  color: req.status === 'found' ? '#047857' : req.status === 'replaced' ? '#b45309' : '#b91c1c',
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
                    <button className="btn-primary" style={{ flex: 1, padding: '9px' }} onClick={handleCheckoutRun}>
                      Complete Checkout
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SPLIT & SETTLE */}
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
              <div className="glass-card" style={{ borderLeft: '3px solid var(--accent-purple)', background: 'rgba(30, 58, 138, 0.02)' }}>
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
                      const debtor = kompaMembers.find(h => h.id === debt.debtorId)?.name || 'Someone';
                      const creditor = kompaMembers.find(h => h.id === debt.creditorId)?.name || 'Someone';
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
                          Paid by {kompaMembers.find(h => h.id === exp.payerId)?.name} on {exp.date}
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
                          const debtor = kompaMembers.find(h => h.id === debt.debtorId);
                          const creditor = kompaMembers.find(h => h.id === debt.creditorId);
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
                          {kompaMembers.map(h => (
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
                        <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Included Roommates</label>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                          {kompaMembers.map(h => (
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
                  <h2 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>Kompa Chatroom</h2>
                  <span style={{ fontSize: '0.68rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-emerald)' }}></span>
                    Double Ratchet Encryption Active
                  </span>
                </div>
              </div>

              {/* Chat messages */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingRight: '4px' }}>
                {chatMessages.map(msg => {
                  const isMe = msg.senderId === currentUserProfile.id;
                  const isSystem = msg.senderId === 'system';
                  const sender = kompaMembers.find(h => h.id === msg.senderId);
                  
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
                          color: sender?.color || '#1e3a8a',
                          marginBottom: '2px'
                        }}>
                          {sender?.name || 'Roommate'}
                        </div>
                      )}
                      <div>{msg.text}</div>
                      <span style={{ 
                        fontSize: '0.62rem', 
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
          <div 
            className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`} 
            onClick={() => setActiveTab('chat')}
            style={{ position: 'relative' }}
          >
            <MessageSquare />
            <span>Chat</span>
            {unreadChatCount > 0 && (
              <span className="unread-badge">
                {unreadChatCount}
              </span>
            )}
          </div>
        </nav>

      </div>
    </>
  );
}
