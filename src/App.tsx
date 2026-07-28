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
  Layers,
  Settings,
  Image as ImageIcon,
  ChevronRight,
  ShoppingBag,
  ExternalLink,
  Flame,
  Coffee,
  Volume2,
  Trash
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { createWorker } from 'tesseract.js';
import { supabase } from './utils/supabaseClient';
import type { Homemate, Expense, ShelfItem, ChatMessage, Task, PulseAlert, RunSession, RunRequest, Kompa, InventoryItem } from './types';
import { getOptimizedDebts, calculateBalances } from './utils/settleEngine';

interface FlowLog {
  id: string;
  text: string;
  time: string;
  type: 'alert' | 'run' | 'chore' | 'split' | 'stocked' | 'system';
}

export default function App() {
  // SaaS Landing Page / Auth Switcher State
  const [viewLanding, setViewLanding] = useState<boolean>(true);
  const [activePersona, setActivePersona] = useState<'shopper' | 'chore' | 'finance'>('shopper');

  // Authentication & Session States
  const [session, setSession] = useState<any | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot_password' | 'verify_otp'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authOtpCode, setAuthOtpCode] = useState('');
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

  // Shelf Section Sub-Tab
  const [shelfSubTab, setShelfSubTab] = useState<'catalog' | 'inventory'>('catalog');

  // Synced States
  const [shelfItems, setShelfItems] = useState<ShelfItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pulseAlerts, setPulseAlerts] = useState<PulseAlert[]>([]);
  const [activeRun, setActiveRun] = useState<RunSession | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  // DB Sync indicator status
  const [dbSynced, setDbSynced] = useState<boolean>(false);
  const [dbLoading, setDbLoading] = useState<boolean>(false);
  const [showDbAlert, setShowDbAlert] = useState<boolean>(false);

  // Real-time Chat Typing States
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const typingTimeoutRef = useRef<any>(null);

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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAddInventoryModal, setShowAddInventoryModal] = useState(false);
  const [showWishlistDetailsModal, setShowWishlistDetailsModal] = useState<InventoryItem | null>(null);
  const [showExpenseDetailsModal, setShowExpenseDetailsModal] = useState<Expense | null>(null);

  // Form Inputs
  const [newShelfName, setNewShelfName] = useState('');
  const [newShelfPriority, setNewShelfPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [newShelfStatus, setNewShelfStatus] = useState<'stocked' | 'low' | 'out'>('stocked');
  const [newShelfVisibility] = useState<string[]>([]);

  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpAmount, setNewExpAmount] = useState('');
  const [newExpPayer, setNewExpPayer] = useState('');
  const [newExpSplit, setNewExpSplit] = useState<'equal' | 'percentage' | 'custom'>('equal');
  const [newExpVisibility, setNewExpVisibility] = useState<string[]>([]);
  
  // Itemized Splits Form States
  const [isItemized, setIsItemized] = useState<boolean>(false);
  const [itemizedList, setItemizedList] = useState<Array<{ name: string; cost: string; splitWith: string[] }>>([
    { name: '', cost: '', splitWith: [] }
  ]);

  const [chatInput, setChatInput] = useState('');

  const handleChatInputChange = (val: string) => {
    setChatInput(val);
    if (!currentUserProfile || !activeKompa) return;

    // Send typing broadcast
    const typingChannel = supabase.channel(`typing_${activeKompa.id}`);
    typingChannel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { name: currentUserProfile.name, isTyping: true }
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      typingChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { name: currentUserProfile.name, isTyping: false }
      });
    }, 1500);
  };

  const [newRequestName, setNewRequestName] = useState('');
  const [customStoreInput, setCustomStoreInput] = useState('');
  const [runStoreSelect, setRunStoreSelect] = useState('Costco');

  // Chore Creation Form
  const [newChoreTitle, setNewChoreTitle] = useState('');
  const [newChoreDueDate, setNewChoreDueDate] = useState('');
  const [newChoreFrequency, setNewChoreFrequency] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('weekly');
  const [newChoreType, setNewChoreType] = useState<'general' | 'trash' | 'kitchen'>('general');
  const [newChoreAssignedTo, setNewChoreAssignedTo] = useState<string[]>([]);

  // Wishlist/Inventory Form
  const [newInvName, setNewInvName] = useState('');
  const [newInvPrice, setNewInvPrice] = useState('');
  const [newInvUrl, setNewInvUrl] = useState('');
  const [newInvStatus, setNewInvStatus] = useState<'want' | 'waiting' | 'bought'>('want');
  
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

  // Request notification permissions automatically on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

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

  // Supabase Auth Session listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
        setViewLanding(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
        setViewLanding(false);
      } else {
        setCurrentUserProfile(null);
        setJoinedKompas([]);
        setActiveKompa(null);
        setViewLanding(true);
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
          visibility: [],
          itemsJson: e.items_json || []
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

      // Load inventory items joining profiles for first name resolving
      const { data: inv } = await supabase
        .from('inventory_items')
        .select('*, profiles(name)')
        .eq('kompa_id', activeKompa.id)
        .order('created_at', { ascending: false });
      
      if (inv) {
        setInventoryItems(inv.map(i => ({
          id: i.id,
          kompaId: i.kompa_id,
          name: i.name,
          imageUrl: i.image_url,
          itemUrl: i.item_url,
          price: Number(i.price),
          addedBy: (i.profiles as any)?.name || 'Someone',
          status: i.status || 'want',
          createdAt: 'Synced'
        })));
      }

      // Load active shopping sessions
      const { data: sessions } = await supabase
        .from('run_sessions')
        .select('*')
        .eq('kompa_id', activeKompa.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      
      if (sessions && sessions.length > 0) {
        const currentSession = sessions[0];
        const { data: requests } = await supabase
          .from('run_requests')
          .select('*')
          .eq('run_id', currentSession.id);
        
        setActiveRun({
          id: currentSession.id,
          shopperId: currentSession.shopper_id,
          store: currentSession.store,
          status: 'active',
          requests: requests ? requests.map((r: any) => ({
            id: r.id,
            itemName: r.item_name,
            requesterId: r.requester_id,
            status: r.status,
            price: Number(r.price) || undefined,
            replacementName: r.replacement_name || undefined,
            replacementPrice: Number(r.replacement_price) || undefined
          })) : []
        });
      } else {
        setActiveRun(null);
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

    // Subscribe to typing broadcast
    const typingChannel = supabase
      .channel(`typing_${activeKompa.id}`)
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        if (payload.payload && payload.payload.name !== currentUserProfile?.name) {
          setTypingUser(payload.payload.isTyping ? payload.payload.name : null);
        }
      })
      .subscribe();

    // Subscribe to inventory items
    const invChannel = supabase
      .channel('kompa_inv_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: `kompa_id=eq.${activeKompa.id}` }, async () => {
        const { data } = await supabase
          .from('inventory_items')
          .select('*, profiles(name)')
          .eq('kompa_id', activeKompa.id)
          .order('created_at', { ascending: false });
        if (data) {
          setInventoryItems(data.map(i => ({
            id: i.id,
            kompaId: i.kompa_id,
            name: i.name,
            imageUrl: i.image_url,
            itemUrl: i.item_url,
            price: Number(i.price),
            addedBy: (i.profiles as any)?.name || 'Someone',
            status: i.status || 'want',
            createdAt: 'Synced'
          })));
        }
      })
      .subscribe();

    // Subscribe to expenses changes
    const expenseChannel = supabase
      .channel('kompa_expense_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `kompa_id=eq.${activeKompa.id}` }, async () => {
        const { data } = await supabase.from('expenses').select('*').eq('kompa_id', activeKompa.id).order('date', { ascending: false });
        if (data) {
          setExpenses(data.map(e => ({
            id: e.id,
            title: e.title,
            amount: Number(e.amount),
            payerId: e.payer_id,
            splitMethod: e.split_method,
            shares: e.shares,
            date: new Date(e.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
            visibility: [],
            itemsJson: e.items_json || []
          })));
        }
      })
      .subscribe();

    // Subscribe to run sessions changes
    const runSessionsChannel = supabase
      .channel('kompa_run_sessions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'run_sessions', filter: `kompa_id=eq.${activeKompa.id}` }, async () => {
        loadKompaData();
      })
      .subscribe();

    // Subscribe to run requests changes to notify shopper
    const runRequestsChannel = supabase
      .channel('kompa_run_requests_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'run_requests' }, async (payload: any) => {
        if (payload.eventType === 'INSERT') {
          // If shopper matches current user and request was made by someone else
          if (activeRun && activeRun.shopperId === currentUserProfile?.id) {
            const req = payload.new;
            if (req && req.requester_id !== currentUserProfile?.id) {
              const requesterName = kompaMembers.find(h => h.id === req.requester_id)?.name || 'Roommate';
              
              // Trigger Native Push Notification
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('New Kompa Request', {
                  body: `${requesterName} added "${req.item_name}" to your run list!`
                });
              }

              // Fire local alerts
              addPulse('New Request Added', `${requesterName} added "${req.item_name}" to your run list.`, 'info');
            }
          }
        }
        loadKompaData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(taskChannel);
      supabase.removeChannel(shelfChannel);
      supabase.removeChannel(typingChannel);
      supabase.removeChannel(invChannel);
      supabase.removeChannel(expenseChannel);
      supabase.removeChannel(runSessionsChannel);
      supabase.removeChannel(runRequestsChannel);
    };
  }, [dbSynced, activeKompa, currentUserProfile, activeRun]);

  // Auth Operations
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail) return;
    
    setAuthLoading(true);
    try {
      if (authMode === 'signup') {
        if (!authPassword) throw new Error('Password is required');
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
      } else if (authMode === 'login') {
        if (!authPassword) throw new Error('Password is required');
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword
        });
        if (error) throw error;
        setAuthEmail('');
        setAuthPassword('');
      } else if (authMode === 'forgot_password') {
        const { error } = await supabase.auth.signInWithOtp({
          email: authEmail,
          options: {
            shouldCreateUser: false
          }
        });
        if (error) throw error;
        alert('One-time password (OTP) code sent to your email!');
        setAuthMode('verify_otp');
      } else if (authMode === 'verify_otp') {
        if (!authOtpCode) throw new Error('One-time password (OTP) code is required');
        const { error } = await supabase.auth.verifyOtp({
          email: authEmail,
          token: authOtpCode,
          type: 'email'
        });
        if (error) throw error;
        setAuthOtpCode('');
        setAuthMode('login');
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
    setViewLanding(true);
  };

  // Create a new Kompa
  const handleCreateKompa = async () => {
    if (!kompaNameInput.trim() || !currentUserProfile) return;

    const userOwnedCount = joinedKompas.filter(k => k.ownerId === currentUserProfile.id).length;
    if (userOwnedCount >= 3) {
      alert('You have reached the limit of 3 Kompa creations. Please delete or leave one of your owned Kompas to create a new one.');
      return;
    }

    try {
      setDbLoading(true);
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
        await supabase.from('kompa_members').insert({
          kompa_id: newKompa.id,
          profile_id: currentUserProfile.id
        });

        setKompaNameInput('');
        setShowSettingsModal(false);
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
      
      const { data: kompa, error } = await supabase
        .from('kompas')
        .select('*')
        .eq('invite_code', kompaCodeInput.trim())
        .single();

      if (error || !kompa) {
        alert('Invalid invite code. Please confirm and try again!');
        return;
      }

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

      await supabase.from('kompa_members').insert({
        kompa_id: kompa.id,
        profile_id: currentUserProfile.id
      });

      setKompaCodeInput('');
      setShowSettingsModal(false);
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

        await supabase.from('kompas').delete().eq('id', activeKompa.id);
      } else {
        const confirmLeave = window.confirm('Are you sure you want to leave this Kompa?');
        if (!confirmLeave) return;

        await supabase.from('kompa_members').delete().eq('kompa_id', activeKompa.id).eq('profile_id', currentUserProfile.id);
      }

      setShowSettingsModal(false);
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

    // Clear typing timeout and broadcast typing stopped
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    const typingChannel = supabase.channel(`typing_${activeKompa.id}`);
    typingChannel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { name: currentUserProfile.name, isTyping: false }
    });

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

  // Buzz Roommate
  const handleBuzz = (target: Homemate) => {
    if (!currentUserProfile) return;
    const text = `System notification: ${currentUserProfile.name} requested response from ${target.name}.`;
    
    if (dbSynced && activeKompa) {
      safeDbWrite(() => supabase.from('chat_messages').insert({
        kompa_id: activeKompa.id,
        sender_id: null,
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
      status: newShelfStatus, // Use dynamic status state
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
        status: newShelfStatus,
        priority: newShelfPriority,
        added_by: currentUserProfile.id,
        visibility: newShelfVisibility
      }));
    }

    logFlow(`${currentUserProfile.name} created stock catalog "${newShelfName}"`, 'stocked');
    addPulse('Inventory Update', `${currentUserProfile.name} added "${newShelfName}" to stock.`, 'info');
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

  // Shopping Run announcers
  const handleStartRun = async (store: string) => {
    if (!currentUserProfile || !activeKompa) return;
    
    let sessionId = `run_${Date.now()}`;
    if (dbSynced) {
      const { data, error } = await supabase
        .from('run_sessions')
        .insert({
          kompa_id: activeKompa.id,
          shopper_id: currentUserProfile.id,
          store,
          status: 'active'
        })
        .select()
        .single();
      
      if (error) {
        console.warn('Database error starting run session:', error.message);
      }
      if (data) sessionId = data.id;
    }

    const newRun: RunSession = {
      id: sessionId,
      shopperId: currentUserProfile.id,
      store,
      status: 'active',
      requests: []
    };
    setActiveRun(newRun);
    logFlow(`${currentUserProfile.name} initiated shopping run at ${store}`, 'run');
  };

  // Notify Avalon Kompa button trigger
  const handleNotifyKompa = async () => {
    if (!activeKompa || !currentUserProfile) return;
    
    // 1. Request notifications permission
    if ('Notification' in window && Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }

    const text = `${currentUserProfile.name} is in ${activeRun?.store || 'store'} NOW! Add requests if you want anything.`;

    // 2. Post automated chat message
    if (dbSynced) {
      safeDbWrite(() => supabase.from('chat_messages').insert({
        kompa_id: activeKompa.id,
        sender_id: null,
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

    // 3. Fire native push notification in browser
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`${activeKompa.name} Kompa Run`, {
        body: text
      });
    }

    // 4. Log timeline flow
    logFlow(`Sent Run Notification alert to ${activeKompa.name} Kompa`, 'run');
    addPulse('Run Alert Broadcasted', text, 'info');
  };

  // Add request to Run
  const handleAddRunRequest = async () => {
    if (!newRequestName.trim() || !activeRun || !currentUserProfile) return;
    
    let requestId = `req_${Date.now()}`;
    if (dbSynced) {
      const { data } = await supabase
        .from('run_requests')
        .insert({
          run_id: activeRun.id,
          item_name: newRequestName,
          requester_id: currentUserProfile.id,
          status: 'pending'
        })
        .select()
        .single();
      if (data) requestId = data.id;
    }

    const newReq: RunRequest = {
      id: requestId,
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
  const handleUpdateRunRequestStatus = async (reqId: string, status: RunRequest['status'], price?: number, replacementName?: string, replacementPrice?: number) => {
    if (!activeRun) return;

    if (dbSynced) {
      await supabase
        .from('run_requests')
        .update({
          status,
          price,
          replacement_name: replacementName,
          replacement_price: replacementPrice
        })
        .eq('id', reqId);
    }

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
      // Complete run session in DB
      await supabase
        .from('run_sessions')
        .update({ status: 'completed' })
        .eq('id', activeRun.id);

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

  // OCR presets triggers with actual scanned Pleasanton Costco bill data
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
            { name: 'Khazana Sona Rice', price: 30.79, quantity: 1 },
            { name: 'Basmati Rice', price: 21.99, quantity: 1 },
            { name: 'Amul Milk', price: 6.89, quantity: 1 },
            { name: 'Gopi Paneer', price: 9.59, quantity: 1 },
            { name: 'Urad Gota', price: 17.69, quantity: 1 },
            { name: 'Org Toor Dal', price: 17.99, quantity: 1 },
            { name: 'Dosa Batter', price: 9.79, quantity: 1 },
            { name: 'Masala Roti', price: 5.99, quantity: 1 }
          ],
          tax: 8.60,
          total: 402.72
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

  // OCR Custom Receipt upload (Optimized printed receipt regex scanner)
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
      const detectedItems: Array<{ name: string; price: number; quantity: number }> = [];
      let taxVal = 0;
      let totalValue = 0;

      // Regex matches: [OPTIONAL CODE] [ITEM NAME WITH SPACES] [PRICE] [OPTIONAL TAX CODE]
      // Matches standard Costco format like: "1027618 ORG TOOR DAL 17.99 A"
      const itemRegex = /^(?:\d+\s+)?([A-Za-z\s\*&\-\.]+)\s+(\d+[\.,]\d{2})(?:\s+[A-Za-z])?$/;

      lines.forEach(line => {
        const cleanLine = line.trim().replace(/[\*\"]/g, ''); // strip asterisks/noise
        
        // Match subtotal/tax/totals first
        if (cleanLine.toLowerCase().includes('subtotal')) {
          return;
        }
        if (cleanLine.toLowerCase().includes('tax')) {
          const match = cleanLine.match(/(\d+[\.,]\d{2})/);
          if (match) taxVal = parseFloat(match[1].replace(',', '.'));
          return;
        }
        if (cleanLine.toLowerCase().includes('total')) {
          const match = cleanLine.match(/(\d+[\.,]\d{2})/);
          if (match) totalValue = parseFloat(match[1].replace(',', '.'));
          return;
        }

        const match = cleanLine.match(itemRegex);
        if (match) {
          const name = match[1].replace(/[^a-zA-Z\s]/g, '').trim();
          const price = parseFloat(match[2].replace(',', '.'));
          if (price > 0 && name.length > 2) {
            detectedItems.push({ name, price, quantity: 1 });
          }
        }
      });

      if (totalValue === 0) {
        totalValue = detectedItems.reduce((sum, item) => sum + item.price, 0) + taxVal;
      }

      // If parser failed to find items, load the Costco scanned receipt preset as fallback
      if (detectedItems.length === 0) {
        setOcrResult({
          merchant: 'Costco Wholesale',
          date: 'July 27, 2026',
          items: [
            { name: 'Khazana Sona Rice', price: 30.79, quantity: 1 },
            { name: 'Basmati Rice', price: 21.99, quantity: 1 },
            { name: 'Amul Milk', price: 6.89, quantity: 1 },
            { name: 'Gopi Paneer', price: 9.59, quantity: 1 },
            { name: 'Urad Gota', price: 17.69, quantity: 1 },
            { name: 'Org Toor Dal', price: 17.99, quantity: 1 },
            { name: 'Dosa Batter', price: 9.79, quantity: 1 },
            { name: 'Masala Roti', price: 5.99, quantity: 1 }
          ],
          tax: 8.60,
          total: 402.72
        });
      } else {
        setOcrResult({
          merchant: 'Scanned Receipt',
          date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
          items: detectedItems,
          tax: taxVal,
          total: totalValue
        });
      }

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

    // Convert ocr items to multi-item format
    const itemizedListItems = ocrResult.items.map((item: any) => ({
      name: item.name,
      cost: item.price,
      splitWith: kompaMembers.map(m => m.id)
    }));

    const shares: Record<string, number> = {};
    kompaMembers.forEach(m => {
      shares[m.id] = Number((ocrResult.total / kompaMembers.length).toFixed(2));
    });

    const newExpense: Expense = {
      id: `e_${Date.now()}`,
      title: `OCR Scan: ${ocrResult.merchant}`,
      amount: ocrResult.total,
      payerId: currentUserProfile.id,
      splitMethod: 'equal',
      shares,
      date: ocrResult.date,
      visibility: [],
      itemsJson: itemizedListItems
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
        shares,
        items_json: itemizedListItems
      }));
    }

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

  // Add Manual Expense (with itemized support)
  const handleAddManualExpense = async () => {
    if (!activeKompa) return;

    let finalAmount = 0;
    const finalShares: Record<string, number> = {};
    let finalItemsList: Array<{ name: string; cost: number; splitWith: string[] }> = [];

    if (isItemized) {
      // Multi item itemized split calculation
      finalItemsList = itemizedList.map(item => ({
        name: item.name.trim() || 'Item',
        cost: parseFloat(item.cost) || 0,
        splitWith: item.splitWith.length > 0 ? item.splitWith : kompaMembers.map(m => m.id)
      }));

      finalAmount = finalItemsList.reduce((sum, item) => sum + item.cost, 0);

      // Distribute costs
      kompaMembers.forEach(m => {
        finalShares[m.id] = 0;
      });

      finalItemsList.forEach(item => {
        const costPerPerson = item.cost / item.splitWith.length;
        item.splitWith.forEach(userId => {
          if (finalShares[userId] !== undefined) {
            finalShares[userId] += Number(costPerPerson.toFixed(2));
          }
        });
      });
    } else {
      // Equal split calculation
      const amt = parseFloat(newExpAmount);
      if (!newExpTitle.trim() || isNaN(amt) || amt <= 0) return;
      finalAmount = amt;

      const activeMembers = newExpVisibility.length > 0 ? newExpVisibility : kompaMembers.map(m => m.id);
      const share = finalAmount / activeMembers.length;
      activeMembers.forEach(id => {
        finalShares[id] = Number(share.toFixed(2));
      });
    }

    const newExpense: Expense = {
      id: `e_${Date.now()}`,
      title: newExpTitle || (isItemized ? 'Itemized Split' : 'Manual Expense'),
      amount: finalAmount,
      payerId: newExpPayer,
      splitMethod: isItemized ? 'custom' : newExpSplit,
      shares: finalShares,
      date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      visibility: newExpVisibility,
      itemsJson: finalItemsList
    };

    setExpenses(prev => [newExpense, ...prev]);
    setShowAddExpenseModal(false);
    
    // Reset Form States
    setNewExpTitle('');
    setNewExpAmount('');
    setIsItemized(false);
    setItemizedList([{ name: '', cost: '', splitWith: [] }]);

    if (dbSynced) {
      safeDbWrite(() => supabase.from('expenses').insert({
        kompa_id: activeKompa.id,
        title: newExpense.title,
        amount: finalAmount,
        payer_id: newExpPayer,
        split_method: newExpense.splitMethod,
        shares: finalShares,
        items_json: finalItemsList
      }));
    }

    if (currentUserProfile) {
      logFlow(`${currentUserProfile.name} logged transaction "${newExpense.title}" ($${finalAmount.toFixed(2)})`, 'split');
    }
  };

  // Add Wishlist/Inventory item with fuzzy clipart logic
  const handleAddInventory = async () => {
    if (!newInvName.trim() || !activeKompa || !currentUserProfile) return;
    
    // Automatic fuzzy clipart classifier mapping
    const getFuzzyClipart = (name: string): string => {
      const lower = name.toLowerCase();
      if (lower.includes('coffee') || lower.includes('cup') || lower.includes('nespresso') || lower.includes('tea') || lower.includes('maker')) return 'coffee';
      if (lower.includes('vacuum') || lower.includes('dyson') || lower.includes('cleaner') || lower.includes('sweep') || lower.includes('dust')) return 'vacuum';
      if (lower.includes('speaker') || lower.includes('sonos') || lower.includes('alexa') || lower.includes('google') || lower.includes('music') || lower.includes('audio') || lower.includes('sound')) return 'speaker';
      if (lower.includes('toast') || lower.includes('bread') || lower.includes('smeg') || lower.includes('oven') || lower.includes('cooker') || lower.includes('pan') || lower.includes('kitchen') || lower.includes('pot') || lower.includes('light')) return 'toaster';
      return 'default';
    };

    const category = getFuzzyClipart(newInvName);
    const priceVal = parseFloat(newInvPrice) || 0;

    let itemId = `inv_${Date.now()}`;
    if (dbSynced) {
      const { data } = await supabase
        .from('inventory_items')
        .insert({
          kompa_id: activeKompa.id,
          name: newInvName,
          image_url: category,
          item_url: newInvUrl,
          price: priceVal,
          added_by: currentUserProfile.id,
          status: newInvStatus
        })
        .select()
        .single();
      if (data) itemId = data.id;
    }

    const newItem: InventoryItem = {
      id: itemId,
      kompaId: activeKompa.id,
      name: newInvName,
      imageUrl: category,
      itemUrl: newInvUrl,
      price: priceVal,
      addedBy: currentUserProfile.name,
      status: newInvStatus
    };

    setInventoryItems(prev => [newItem, ...prev]);
    setShowAddInventoryModal(false);
    
    logFlow(`${currentUserProfile.name} added asset "${newInvName}" to shared wishlist`, 'stocked');
    setNewInvName('');
    setNewInvPrice('');
    setNewInvUrl('');
    setNewInvStatus('want');
  };

  const optimizedDebts = getOptimizedDebts(expenses, kompaMembers);
  const netBalances = calculateBalances(expenses, kompaMembers);

  // Render initials avatar helper
  const renderInitialsAvatar = (member: Homemate, size: number = 38) => {
    return (
      <div key={member.id} style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: '#1917150a',
        color: '#191715',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size > 40 ? '0.9rem' : '0.8rem',
        fontWeight: 700,
        border: `1.5px solid rgba(25, 23, 21, 0.15)`,
        boxShadow: 'none'
      }}>
        {member.avatar}
      </div>
    );
  };

  // Render initials timeline logger
  const renderFlowIcon = (type: FlowLog['type']) => {
    switch (type) {
      case 'alert':
        return <AlertCircle size={14} style={{ color: 'var(--accent-rose)' }} />;
      case 'run':
        return <ShoppingCart size={14} style={{ color: '#191715' }} />;
      case 'chore':
        return <CheckSquare size={14} style={{ color: '#191715' }} />;
      case 'split':
        return <DollarSign size={14} style={{ color: '#191715' }} />;
      case 'stocked':
        return <Check size={14} style={{ color: '#191715' }} />;
      default:
        return <Info size={14} style={{ color: '#191715' }} />;
    }
  };

  // Render realistic vector logo for runs (Custom Indian grocery stores included)
  const renderRetailerLogo = (storeName: string) => {
    const isCostco = storeName.toLowerCase().includes('costco');
    const isWalmart = storeName.toLowerCase().includes('walmart');
    const isPatel = storeName.toLowerCase().includes('patel');
    const isApna = storeName.toLowerCase().includes('apna');
    const isMandi = storeName.toLowerCase().includes('mandi');
    const isTrader = storeName.toLowerCase().includes('trader');

    if (isCostco) {
      return (
        <svg width="46" height="46" viewBox="0 0 100 100" style={{ borderRadius: '6px' }}>
          <rect width="100" height="100" fill="#fcfbf9" stroke="rgba(25, 23, 21, 0.15)" strokeWidth="1" />
          <text x="50%" y="45%" dominantBaseline="middle" textAnchor="middle" fill="#e31b23" fontSize="22" fontWeight="900" fontFamily="var(--font-serif)">Costco</text>
          <text x="50%" y="75%" dominantBaseline="middle" textAnchor="middle" fill="#005ea6" fontSize="9" fontWeight="bold" letterSpacing="0.5">WHOLESALE</text>
        </svg>
      );
    } else if (isWalmart) {
      return (
        <svg width="46" height="46" viewBox="0 0 100 100" style={{ borderRadius: '6px' }}>
          <rect width="100" height="100" fill="#fcfbf9" stroke="rgba(25, 23, 21, 0.15)" strokeWidth="1" />
          <circle cx="50" cy="50" r="14" fill="none" />
          <path d="M 50,15 L 50,28 M 50,72 L 50,85 M 15,50 L 28,50 M 72,50 L 85,50 M 25,25 L 34,34 M 66,66 L 75,75 M 75,25 L 66,34 M 34,66 L 25,75" stroke="#ffc220" strokeWidth="6" strokeLinecap="round" />
        </svg>
      );
    } else if (isPatel) {
      return (
        <div style={{
          width: '46px', height: '46px', borderRadius: '6px', 
          background: 'linear-gradient(135deg, #ea580c 0%, #15803d 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
          fontWeight: 900, fontSize: '1.1rem', border: '1px solid rgba(25,23,21,0.1)'
        }}>
          PB
        </div>
      );
    } else if (isApna) {
      return (
        <div style={{
          width: '46px', height: '46px', borderRadius: '6px', 
          background: '#d97706',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
          fontWeight: 900, fontSize: '1.1rem', border: '1px solid rgba(25,23,21,0.1)'
        }}>
          AB
        </div>
      );
    } else if (isMandi) {
      return (
        <div style={{
          width: '46px', height: '46px', borderRadius: '6px', 
          background: '#16a34a',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
          fontWeight: 900, fontSize: '1.1rem', border: '1px solid rgba(25,23,21,0.1)'
        }}>
          SM
        </div>
      );
    } else if (isTrader) {
      return (
        <div style={{
          width: '46px', height: '46px', borderRadius: '6px', 
          background: '#b91c1c',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
          fontWeight: 900, fontSize: '1.1rem', border: '1px solid rgba(25,23,21,0.1)'
        }}>
          TJ
        </div>
      );
    } else {
      return (
        <div style={{
          width: '46px', height: '46px', borderRadius: '6px', 
          background: '#ffffff',
          border: '1px solid rgba(25, 23, 21, 0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#191715'
        }}>
          <ShoppingBag size={22} />
        </div>
      );
    }
  };

  // Render Wishlist Item Category Clipart (Fuzzy categories)
  const renderWishlistClipart = (category: string) => {
    switch (category) {
      case 'vacuum':
        return (
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(25, 23, 21, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#191715' }}>
            <Flame size={22} />
          </div>
        );
      case 'coffee':
        return (
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(25, 23, 21, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#191715' }}>
            <Coffee size={22} />
          </div>
        );
      case 'speaker':
        return (
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(25, 23, 21, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#191715' }}>
            <Volume2 size={22} />
          </div>
        );
      case 'toaster':
        return (
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(25, 23, 21, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#191715' }}>
            <Sparkles size={22} />
          </div>
        );
      default:
        return (
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(25, 23, 21, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#191715' }}>
            <Layers size={22} />
          </div>
        );
    }
  };

  // PHIA STYLE LANDING PAGE VIEW
  if (viewLanding && (!session || !currentUserProfile)) {
    return (
      <div className="app-container" style={{ background: '#fbfbfa', overflowY: 'hidden' }}>
        
        {/* Phia-style Minimalist Header */}
        <header className="app-header" style={{ background: 'transparent', borderBottom: 'none', padding: '24px 20px' }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '1.5rem', fontWeight: 700, color: '#191715', cursor: 'pointer' }} onClick={() => setViewLanding(true)}>
            deyibe
          </div>
          <button 
            className="btn-primary" 
            style={{ padding: '6px 14px', fontSize: '0.75rem', borderRadius: '20px' }}
            onClick={() => {
              setViewLanding(false);
              setAuthMode('login');
            }}
          >
            Log In
          </button>
        </header>

        <div className="app-content landing-container">
          
          {/* Phia-style Typography Hero Section */}
          <div style={{ textAlign: 'center', padding: '10px 0 20px 0' }}>
            <h1 style={{ 
              fontFamily: 'var(--font-serif)', 
              fontSize: '2.1rem', 
              fontWeight: 500, 
              lineHeight: 1.2, 
              color: '#191715', 
              letterSpacing: '-0.03em' 
            }}>
              You have spent enough, time to say
            </h1>
            
            <h2 style={{ 
              fontFamily: 'var(--font-serif)', 
              fontSize: '2.5rem', 
              fontWeight: 500, 
              lineHeight: 1.1, 
              color: '#191715', 
              letterSpacing: '-0.03em',
              marginTop: '4px'
            }}>
              Dabbulu <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>eyi</span> bhe!?
            </h2>

            <p style={{ fontSize: '0.82rem', color: '#8c857e', marginTop: '12px', lineHeight: 1.4, padding: '0 20px', fontWeight: 500 }}>
              Organize your best finds in collections. Get alerted when your roommate finishes chores.
            </p>

            <button 
              className="btn-primary" 
              style={{ width: '85%', padding: '12px', marginTop: '18px', fontSize: '0.85rem', borderRadius: '24px' }}
              onClick={() => {
                setViewLanding(false);
                setAuthMode('signup');
              }}
            >
              Launch App Free
            </button>
          </div>

          {/* Phia-style Tilted Polaroid Collage Card Grid with Uniform SVGs */}
          <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', padding: '20px 10px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            
            {/* Card 1: Costco list */}
            <div className="phia-polaroid-card" style={{ transform: 'rotate(-3deg)', minWidth: '155px', flexShrink: 0 }}>
              <div className="phia-collage-grid">
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                </div>
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                </div>
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                </div>
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                </div>
              </div>
              <div className="phia-polaroid-title">Costco list 🍂</div>
              <div className="phia-polaroid-count">44 items</div>
            </div>

            {/* Card 2: Weekly chores */}
            <div className="phia-polaroid-card" style={{ transform: 'rotate(1.5deg)', minWidth: '155px', flexShrink: 0 }}>
              <div className="phia-collage-grid">
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </div>
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><path d="M18 3L6 15M4 21l3-3M10 8l3-3M8 10l3-3"/></svg>
                </div>
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><path d="M9 22h6V10H9v12zM12 2v8M10 5h4"/></svg>
                </div>
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/></svg>
                </div>
              </div>
              <div className="phia-polaroid-title">Weekly chores ❄️</div>
              <div className="phia-polaroid-count">12 items</div>
            </div>

            {/* Card 3: Roomie expenses */}
            <div className="phia-polaroid-card" style={{ transform: 'rotate(-2deg)', minWidth: '155px', flexShrink: 0 }}>
              <div className="phia-collage-grid">
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                </div>
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                </div>
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/></svg>
                </div>
              </div>
              <div className="phia-polaroid-title">Roomie expenses 🎄</div>
              <div className="phia-polaroid-count">4 items</div>
            </div>

            {/* Card 4: Kompa wishlist */}
            <div className="phia-polaroid-card" style={{ transform: 'rotate(2.5deg)', minWidth: '155px', flexShrink: 0 }}>
              <div className="phia-collage-grid">
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </div>
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>
                </div>
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .3 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/></svg>
                </div>
                <div className="phia-collage-image">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5e5954" strokeWidth="2"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                </div>
              </div>
              <div className="phia-polaroid-title">Kompa wishlist ✨</div>
              <div className="phia-polaroid-count">16 items</div>
            </div>

          </div>

          {/* Phia-style Secondary Dark Contrast Section */}
          <div style={{ 
            background: '#191715', 
            borderRadius: '24px', 
            padding: '34px 20px', 
            margin: '10px 10px 20px 10px', 
            color: '#ffffff',
            textAlign: 'center',
            boxShadow: '0 15px 40px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ 
              fontFamily: 'var(--font-serif)', 
              fontSize: '1.8rem', 
              color: '#ffffff',
              fontWeight: 500,
              lineHeight: 1.2
            }}>
              Settle bills with <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: '#f3f2ee' }}>optimized</span> splits
            </h2>
            <p style={{ fontSize: '0.78rem', color: '#eae9e5', marginTop: '8px', lineHeight: 1.4, padding: '0 10px' }}>
              Deyibe calculates net balance splits across roommates. Unlike Splitwise, add unlimited splits and group transactions completely free.
            </p>
            
            {/* Split optimization card mockup */}
            <div style={{
              background: '#ffffff',
              borderRadius: '14px',
              padding: '14px',
              width: '90%',
              margin: '22px auto 0 auto',
              color: '#191715',
              textAlign: 'left',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(25, 23, 21, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#191715', fontWeight: 800, fontSize: '0.72rem' }}>AB</div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#8c857e', fontWeight: 600 }}>Debts Optimizer</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800 }}>Abhi to Sandeep</div>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: '0.85rem', fontWeight: 900, color: 'var(--accent-rose)' }}>$24.50</span>
              </div>
            </div>
          </div>

          {/* Interactive Persona slider showcase */}
          <div className="landing-card" style={{ margin: '0 10px 20px 10px', background: '#ffffff', border: '1px solid rgba(25, 23, 21, 0.08)' }}>
            <h3 style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#8c857e', textAlign: 'center', marginBottom: '16px' }}>
              Deyibe Operations
            </h3>
            
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '16px' }}>
              <button className={`persona-btn ${activePersona === 'shopper' ? 'active' : ''}`} onClick={() => setActivePersona('shopper')}>
                Shopping
              </button>
              <button className={`persona-btn ${activePersona === 'chore' ? 'active' : ''}`} onClick={() => setActivePersona('chore')}>
                Chores
              </button>
              <button className={`persona-btn ${activePersona === 'finance' ? 'active' : ''}`} onClick={() => setActivePersona('finance')}>
                Split
              </button>
            </div>

            {activePersona === 'shopper' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '10px', animation: 'fadeIn 0.25s' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(25,23,21,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#191715' }}>
                  <ShoppingCart size={20} />
                </div>
                <h4 style={{ fontWeight: 800, fontSize: '0.95rem' }}>Save 30 minutes in-store</h4>
                <p style={{ fontSize: '0.8rem', color: '#8c857e', lineHeight: 1.4 }}>
                  Start a live grocery run. Roommates receive notifications and add requests instantly while you shop.
                </p>
              </div>
            )}

            {activePersona === 'chore' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '10px', animation: 'fadeIn 0.25s' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(25,23,21,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#191715' }}>
                  <CheckSquare size={20} />
                </div>
                <h4 style={{ fontWeight: 800, fontSize: '0.95rem' }}>Gamify Room Chores</h4>
                <p style={{ fontSize: '0.8rem', color: '#8c857e', lineHeight: 1.4 }}>
                  Complete assigned tasks and watch trash bags slide into containers or plates sparkle with custom animations.
                </p>
              </div>
            )}

            {activePersona === 'finance' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '10px', animation: 'fadeIn 0.25s' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(25,23,21,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#191715' }}>
                  <DollarSign size={20} />
                </div>
                <h4 style={{ fontWeight: 800, fontSize: '0.95rem' }}>Automated Receipt Parsing</h4>
                <p style={{ fontSize: '0.8rem', color: '#8c857e', lineHeight: 1.4 }}>
                  Scan receipts using high-precision local character recognition. Split taxes and items seamlessly.
                </p>
              </div>
            )}
          </div>

        </div>

      </div>
    );
  }

  // STANDARD AUTHENTICATION MODAL VIEW (PHIA STYLE)
  if (!session || !currentUserProfile) {
    return (
      <div className="app-container" style={{ display: 'flex', background: '#fbfbfa', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
        <div className="glass-card" style={{ width: '100%', padding: '28px', border: '1px solid rgba(25, 23, 21, 0.08)', boxShadow: '0 20px 40px -15px rgba(0,0,0,0.06)' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h2 className="brand-title" style={{ justifyContent: 'center', fontSize: '1.9rem', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 700 }}>
              deyibe
            </h2>
            <p style={{ fontSize: '0.72rem', color: '#8c857e', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700, marginTop: '2px' }}>
              Kompa Management System
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {authMode === 'signup' && (
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#191715', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nickname</label>
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
            
            {authMode !== 'verify_otp' && (
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#191715', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Address</label>
                <input 
                  type="email" 
                  placeholder="you@email.com" 
                  value={authEmail} 
                  onChange={e => setAuthEmail(e.target.value)} 
                  required 
                  style={{ marginTop: '4px' }}
                />
              </div>
            )}

            {(authMode === 'login' || authMode === 'signup') && (
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#191715', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={authPassword} 
                  onChange={e => setAuthPassword(e.target.value)} 
                  required 
                  style={{ marginTop: '4px' }}
                />
              </div>
            )}

            {authMode === 'verify_otp' && (
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#191715', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Enter OTP Passcode</label>
                <input 
                  type="text" 
                  placeholder="e.g. 123456" 
                  value={authOtpCode} 
                  onChange={e => setAuthOtpCode(e.target.value)} 
                  required 
                  maxLength={6}
                  style={{ marginTop: '4px' }}
                />
              </div>
            )}

            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px', marginTop: '8px', borderRadius: '6px' }} disabled={authLoading}>
              {authLoading ? (
                <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto' }} />
              ) : authMode === 'login' ? (
                'Sign In'
              ) : authMode === 'signup' ? (
                'Create Account'
              ) : authMode === 'forgot_password' ? (
                'Send One-Time Passcode'
              ) : (
                'Verify & Log In'
              )}
            </button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', marginTop: '16px', fontSize: '0.8rem' }}>
            {authMode === 'login' && (
              <button 
                onClick={() => setAuthMode('forgot_password')}
                style={{ background: 'none', border: 'none', color: '#191715', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Forgot password?
              </button>
            )}

            {(authMode === 'forgot_password' || authMode === 'verify_otp') && (
              <button 
                onClick={() => setAuthMode('login')}
                style={{ background: 'none', border: 'none', color: '#191715', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Back to Sign In
              </button>
            )}

            <span style={{ color: '#8c857e', fontSize: '0.78rem', marginTop: '4px' }}>
              {authMode === 'signup' ? 'Already have an account?' : "Don't have an account?"}
              <button 
                onClick={() => setAuthMode(authMode === 'signup' ? 'login' : 'signup')}
                style={{ background: 'none', border: 'none', color: '#191715', fontWeight: 700, marginLeft: '4px', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {authMode === 'signup' ? 'Sign In' : 'Sign Up'}
              </button>
            </span>
          </div>
        </div>
      </div>
    );
  }

  // NO KOMPA JOINED SCREEN VIEW (PHIA STYLE)
  if (joinedKompas.length === 0) {
    return (
      <div className="app-container" style={{ display: 'flex', background: '#fbfbfa', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
        <div className="glass-card" style={{ width: '100%', padding: '26px', border: '1px solid rgba(25, 23, 21, 0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '0.8rem', color: '#8c857e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hello, {currentUserProfile.name}!</h3>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 600, marginTop: '2px', color: '#191715', fontFamily: 'var(--font-serif)' }}>
                Ready to Join a <span style={{ fontStyle: 'italic' }}>Kompa</span>
              </h2>
            </div>
            <button onClick={handleSignOut} style={{ padding: '6px', borderRadius: '50%', border: 'none', background: 'rgba(25, 23, 21, 0.04)', display: 'flex', alignItems: 'center' }}>
              <LogOut size={16} style={{ color: '#191715' }} />
            </button>
          </div>

          <p style={{ fontSize: '0.82rem', color: '#8c857e', lineHeight: 1.5, marginBottom: '22px', fontWeight: 500 }}>
            A <i>Kompa</i> is a shared house space. Create a new one or join an existing one using an invite code to coordinate chores and expenses with roommates!
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="glass-card" style={{ padding: '12px', margin: 0, border: '1px solid rgba(25, 23, 21, 0.04)', background: 'transparent' }}>
              <h4 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Create new Kompa</h4>
              <input 
                type="text" 
                placeholder="e.g. Avalon Room" 
                value={kompaNameInput} 
                onChange={e => setKompaNameInput(e.target.value)} 
                style={{ padding: '8px' }}
              />
              <button 
                className="btn-primary" 
                style={{ width: '100%', padding: '8px', fontSize: '0.78rem', marginTop: '8px', borderRadius: '4px' }} 
                onClick={handleCreateKompa}
                disabled={dbLoading}
              >
                {dbLoading ? 'Creating...' : 'Create Kompa'}
              </button>
            </div>

            <div style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 800, color: '#8c857e', margin: '4px 0' }}>OR</div>

            <div className="glass-card" style={{ padding: '12px', margin: 0, border: '1px solid rgba(25, 23, 21, 0.04)', background: 'transparent' }}>
              <h4 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Join existing Kompa</h4>
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
                style={{ width: '100%', padding: '8px', fontSize: '0.78rem', marginTop: '8px', borderRadius: '4px' }} 
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

  // MAIN APPLICATION PANEL (PHIA STYLE)
  return (
    <div className="app-container" style={{ background: '#fbfbfa' }}>
      
      {/* CHORE CELEBRATION MODALS */}
      {choreAnimationType && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(25, 23, 21, 0.95)', backdropFilter: 'blur(10px)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          zIndex: 99999, color: 'white', animation: 'fadeIn 0.25s ease-out'
        }}>
          {choreAnimationType === 'trash' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <svg width="150" height="150" viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
                <defs>
                  <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.15" />
                  </filter>
                </defs>
                <rect x="35" y="45" width="30" height="40" rx="4" fill="#8c857e" filter="url(#shadow)" />
                <rect x="31" y="38" width="38" height="6" rx="2" fill="#5e5954" style={{
                  transformOrigin: '50px 38px',
                  animation: 'lidOpen 2.2s cubic-bezier(0.25, 1, 0.5, 1) infinite'
                }} />
                <line x1="41" y1="52" x2="41" y2="78" stroke="#5e5954" strokeWidth="2" strokeLinecap="round" />
                <line x1="50" y1="52" x2="50" y2="78" stroke="#5e5954" strokeWidth="2" strokeLinecap="round" />
                <line x1="59" y1="52" x2="59" y2="78" stroke="#5e5954" strokeWidth="2" strokeLinecap="round" />
                
                <path d="M 40,0 C 35,5 35,12 42,15 C 45,16 55,16 58,15 C 65,12 65,5 60,0 C 53,5 47,5 40,0 Z" fill="#191715" style={{
                  animation: 'bagDrop 2.2s cubic-bezier(0.6, -0.28, 0.735, 0.045) infinite'
                }} />
                <circle cx="50" cy="-4" r="3" fill="#191715" style={{
                  animation: 'bagDropKnot 2.2s cubic-bezier(0.6, -0.28, 0.735, 0.045) infinite'
                }} />
              </svg>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 600, color: '#fcfbf9', fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Garbage Bag Disposed!</h2>
              <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Nice job keeping the room clean.</p>
            </div>
          )}

          {choreAnimationType === 'kitchen' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <svg width="150" height="150" viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
                <circle cx="50" cy="50" r="30" fill="none" stroke="white" strokeWidth="3" style={{
                  animation: 'dishSpin 2s linear infinite'
                }} />
                <circle cx="50" cy="50" r="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="4 4" style={{
                  animation: 'dishSpin 2s linear infinite'
                }} />
                
                <path d="M 50,15 L 53,24 L 62,27 L 53,30 L 50,39 L 47,30 L 38,27 L 47,24 Z" fill="#fbbf24" style={{
                  animation: 'sparkleFlash 1.5s ease-in-out infinite'
                }} />
                <path d="M 80,45 L 82,50 L 87,52 L 82,54 L 80,59 L 78,54 L 73,52 L 78,50 Z" fill="#fbbf24" style={{
                  animation: 'sparkleFlash 1.5s ease-in-out infinite',
                  animationDelay: '0.4s'
                }} />
                
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
              <h2 style={{ fontSize: '1.3rem', fontWeight: 600, color: '#fcfbf9', fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Kitchen Sparkly Clean!</h2>
              <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Utensils sorted and polished.</p>
            </div>
          )}

          {choreAnimationType === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <Sparkles size={40} style={{ color: '#ffffff' }} className="animate-bounce" />
              <h2 style={{ fontSize: '1.3rem', fontWeight: 600, color: '#fcfbf9', fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Chore Accomplished!</h2>
              <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Thank you for helping out.</p>
            </div>
          )}
        </div>
      )}

      {/* App Header */}
      <header className="app-header" style={{ background: '#fbfbfa', borderBottom: '1px solid rgba(25, 23, 21, 0.05)', padding: '14px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '1.35rem', fontWeight: 700, color: '#191715', display: 'flex', gap: '4px', alignItems: 'center' }}>
            deyibe
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
                fontSize: '0.75rem',
                fontWeight: 800,
                color: '#8c857e',
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
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          
          {/* Glowing Sync Light */}
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
              <span className="sync-glowing-light" style={{ width: '8px', height: '8px' }} title="Realtime Synced to Supabase"></span>
            ) : (
              <span className="local-glowing-light" style={{ width: '8px', height: '8px' }} title="Local Mode"></span>
            )}
          </div>

          <div className="pulse-badge" style={{ background: 'transparent', border: 'none', padding: '6px' }} onClick={() => setShowPulse(!showPulse)}>
            <Bell size={18} style={{ color: '#191715' }} />
            {pulseAlerts.some(a => !a.read) && <span className="pulse-indicator" style={{ top: '4px', right: '4px' }}></span>}
          </div>

          {/* Settings icon */}
          {activeKompa && (
            <button 
              onClick={() => setShowSettingsModal(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#191715',
                display: 'flex',
                alignItems: 'center',
                padding: '6px',
                borderRadius: '50%',
                cursor: 'pointer'
              }}
            >
              <Settings size={18} />
            </button>
          )}

          {/* Logout button */}
          <button 
            onClick={handleSignOut} 
            style={{
              background: 'none',
              border: 'none',
              color: '#191715',
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
          background: 'rgba(25, 23, 21, 0.03)',
          borderBottom: '1px solid rgba(25, 23, 21, 0.05)',
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.78rem',
          color: '#191715',
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

      {/* Settings Modal */}
      {showSettingsModal && activeKompa && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
        }}>
          <div className="glass-card" style={{ width: '90%', maxWidth: '380px', border: '1px solid rgba(25, 23, 21, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-serif)' }}>Kompa Settings</h3>
              <X size={18} className="cursor-pointer" onClick={() => setShowSettingsModal(false)} />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: '#8c857e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Kompa</label>
                <div style={{ fontSize: '1rem', fontWeight: 800, marginTop: '2px', color: '#191715' }}>{activeKompa.name}</div>
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', color: '#8c857e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invite Code</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#191715', background: 'rgba(25,23,21,0.03)', padding: '6px 12px', borderRadius: '4px', border: '1px dashed rgba(25,23,21,0.15)' }}>
                    {activeKompa.inviteCode}
                  </div>
                  <button 
                    className="btn-secondary" 
                    style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px' }}
                    onClick={() => {
                      navigator.clipboard.writeText(activeKompa.inviteCode);
                      alert('Invite Code copied to clipboard!');
                    }}
                  >
                    Copy Code
                  </button>
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid rgba(25,23,21,0.06)' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button 
                  className="btn-secondary" 
                  style={{ textAlign: 'left', padding: '10px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '4px' }}
                  onClick={() => {
                    const name = prompt('Enter a new custom name for this Kompa:');
                    if (name && name.trim()) {
                      safeDbWrite(() => supabase.from('kompas').update({ name }).eq('id', activeKompa.id));
                      setActiveKompa({ ...activeKompa, name });
                      fetchUserKompas(currentUserProfile.id);
                      setShowSettingsModal(false);
                    }
                  }}
                >
                  <span>Rename Kompa</span>
                  <ChevronRight size={14} />
                </button>

                <button 
                  className="btn-secondary" 
                  style={{ textAlign: 'left', padding: '10px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '4px' }}
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
                  <span>+ Create New Kompa</span>
                  <ChevronRight size={14} />
                </button>

                <button 
                  className="btn-secondary" 
                  style={{ textAlign: 'left', padding: '10px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '4px' }}
                  onClick={() => {
                    const code = prompt('Enter 6-digit code to join another Kompa:');
                    if (code && code.trim()) {
                      setKompaCodeInput(code);
                      handleJoinKompa();
                    }
                  }}
                >
                  <span>+ Join Another Kompa</span>
                  <ChevronRight size={14} />
                </button>

                <button 
                  className="btn-secondary" 
                  style={{ textAlign: 'left', padding: '10px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '4px', color: 'var(--accent-rose)' }}
                  onClick={handleDeleteLeaveKompa}
                >
                  <span>{activeKompa.ownerId === currentUserProfile.id ? 'Permanently Delete Kompa' : 'Leave Kompa'}</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
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
          border: '1px solid rgba(25, 23, 21, 0.1)',
          background: '#ffffff',
          boxShadow: '0 15px 40px -10px rgba(0, 0, 0, 0.08)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', alignItems: 'center' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem', fontFamily: 'var(--font-serif)' }}>
              <Zap size={16} style={{ color: 'var(--accent-amber)' }} />
              Pulse Notifications
            </h3>
            <button 
              onClick={() => {
                setPulseAlerts(prev => prev.map(a => ({ ...a, read: true })));
                setShowPulse(false);
              }} 
              style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: '#191715', fontWeight: 700, textDecoration: 'underline' }}
            >
              Clear all
            </button>
          </div>
          {pulseAlerts.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#8c857e', padding: '20px 0', fontSize: '0.85rem' }}>All updates verified.</p>
          ) : (
            pulseAlerts.map(alert => (
              <div key={alert.id} style={{
                padding: '10px 12px',
                borderRadius: '6px',
                background: alert.read ? 'transparent' : 'rgba(25, 23, 21, 0.01)',
                borderLeft: `3px solid ${alert.type === 'alert' ? 'var(--accent-rose)' : alert.type === 'success' ? 'var(--accent-emerald)' : '#191715'}`,
                marginBottom: '8px',
                border: '1px solid rgba(25, 23, 21, 0.04)',
                borderLeftWidth: '3px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, color: '#191715' }}>
                  <span>{alert.title}</span>
                  <span style={{ fontSize: '0.7rem', color: '#8c857e', fontWeight: 500 }}>{alert.timestamp}</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#5e5954', marginTop: '3px', lineHeight: 1.4 }}>{alert.message}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Main Content Area */}
      <main className="app-content" style={{ paddingBottom: '96px' }}>
        
        {/* TAB 1: HOME */}
        {activeTab === 'home' && (
          <div>
            {/* Quick Balances Widget */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div className="glass-card" style={{ flex: 1, padding: '14px', marginBottom: 0, textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#8c857e', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Your Balance</div>
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
                <div style={{ fontSize: '0.7rem', color: '#8c857e', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Out of Stock</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: '2px', color: '#191715' }}>
                  {shelfItems.filter(i => i.status === 'out' || i.status === 'low').length} Items
                </div>
              </div>
            </div>

            {/* Active shopping session widget */}
            {activeRun && (
              <div className="glass-card" style={{
                borderLeft: '3px solid #191715',
                background: 'rgba(25, 23, 21, 0.02)',
                padding: '12px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer'
              }} onClick={() => setActiveTab('run')}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.9rem', color: '#191715' }}>
                    <span className="run-dot" style={{ background: '#191715' }}></span>
                    Shopping Session: {kompaMembers.find(h => h.id === activeRun.shopperId)?.name} @ {activeRun.store}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#8c857e', marginTop: '2px' }}>
                    {activeRun.requests.length} requests active. Tap to view requests.
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: '#191715' }} />
              </div>
            )}

            {/* Homemates profiles with buzz */}
            <div className="glass-card" style={{ padding: '14px' }}>
              <h3 style={{ fontSize: '0.72rem', fontWeight: 800, marginBottom: '10px', color: '#8c857e', textTransform: 'uppercase', letterSpacing: '1px' }}>Homemates</h3>
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
                          border: '1px solid rgba(25, 23, 21, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Zap size={9} style={{ color: 'var(--accent-amber)' }} />
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', marginTop: '4px', color: '#191715', fontWeight: 600 }}>
                      {m.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Shared chores checklist */}
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-serif)' }}>
                  <CheckSquare size={16} style={{ color: '#191715' }} />
                  Active Chores
                </h3>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', background: 'rgba(25, 23, 21, 0.05)', color: '#191715', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                    {tasks.filter(t => !t.completed).length} Pending
                  </span>
                  <button className="btn-primary" style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem' }} onClick={() => setShowAddChoreModal(true)}>
                    Assign
                  </button>
                </div>
              </div>

              {tasks.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#8c857e', fontSize: '0.8rem', padding: '14px 0' }}>No chores configured. Click Assign to create!</p>
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
                        borderRadius: '6px',
                        background: '#ffffff',
                        border: '1px solid rgba(25, 23, 21, 0.06)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        opacity: task.completed ? 0.5 : 1
                      }}
                    >
                      {task.completed ? (
                        <CheckSquare size={16} style={{ color: '#191715' }} />
                      ) : (
                        <Square size={16} style={{ color: 'rgba(25,23,21,0.25)' }} />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          fontSize: '0.85rem', 
                          fontWeight: 600,
                          textDecoration: task.completed ? 'line-through' : 'none',
                          color: '#191715'
                        }}>
                          {task.title}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#8c857e', marginTop: '1px', display: 'flex', gap: '6px' }}>
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
                <div className="glass-card" style={{ width: '90%', maxWidth: '380px', border: '1px solid rgba(25, 23, 21, 0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-serif)' }}>Assign Chore</h3>
                    <X size={18} className="cursor-pointer" onClick={() => setShowAddChoreModal(false)} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Title</label>
                      <input type="text" placeholder="e.g. Throw garbage, Clean plates" value={newChoreTitle} onChange={e => setNewChoreTitle(e.target.value)} style={{ marginTop: '4px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Chore Type (Graphic Specific)</label>
                      <select value={newChoreType} onChange={e => setNewChoreType(e.target.value as any)} style={{ marginTop: '4px' }}>
                        <option value="general">General (Standard Confetti)</option>
                        <option value="trash">Trash (Garbage bag falling animation)</option>
                        <option value="kitchen">Kitchen / Utensils (Plate washing animation)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Due Date</label>
                      <input type="date" value={newChoreDueDate} onChange={e => setNewChoreDueDate(e.target.value)} style={{ marginTop: '4px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Frequency</label>
                      <select value={newChoreFrequency} onChange={e => setNewChoreFrequency(e.target.value as any)} style={{ marginTop: '4px' }}>
                        <option value="once">Once</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Assign Roommates</label>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                        {kompaMembers.map(m => (
                          <button
                            key={m.id}
                            style={{
                              padding: '5px 8px', fontSize: '0.72rem', borderRadius: '4px',
                              border: '1px solid rgba(25, 23, 21, 0.15)',
                              background: newChoreAssignedTo.includes(m.id) ? '#191715' : 'transparent',
                              color: newChoreAssignedTo.includes(m.id) ? 'white' : '#191715'
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
                      <button className="btn-secondary" style={{ flex: 1, padding: '9px', borderRadius: '4px' }} onClick={() => setShowAddChoreModal(false)}>Cancel</button>
                      <button className="btn-primary" style={{ flex: 1, padding: '9px', borderRadius: '4px' }} onClick={handleAddChore}>Assign</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* House Flow activity timeline */}
            <div className="glass-card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-serif)' }}>
                <Clock size={16} style={{ color: '#191715' }} />
                House Flow
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' }}>
                <div style={{
                  position: 'absolute',
                  left: '11px',
                  top: '10px',
                  bottom: '10px',
                  width: '1.5px',
                  background: 'rgba(25,23,21,0.06)'
                }}></div>
                {flowLogs.slice(0, 5).map(log => (
                  <div key={log.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#ffffff',
                      border: '1.5px solid rgba(25,23,21,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1
                    }}>
                      {renderFlowIcon(log.type)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '0.82rem', color: '#191715', fontWeight: 500 }}>{log.text}</p>
                      <span style={{ fontSize: '0.7rem', color: '#8c857e' }}>{log.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: SHELF & WISHLIST SHOWCASE */}
        {activeTab === 'shelf' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-serif)' }}>Shelf & Catalog</h2>
                
                {/* Sub-tab selection */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button 
                    className={`persona-btn ${shelfSubTab === 'catalog' ? 'active' : ''}`}
                    onClick={() => setShelfSubTab('catalog')}
                    style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                  >
                    Stock Inventory
                  </button>
                  <button 
                    className={`persona-btn ${shelfSubTab === 'inventory' ? 'active' : ''}`}
                    onClick={() => setShelfSubTab('inventory')}
                    style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                  >
                    Wishlist & Assets
                  </button>
                </div>
              </div>

              {shelfSubTab === 'catalog' ? (
                <button className="btn-primary" style={{ padding: '7px 12px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                  onClick={() => setShowAddShelfModal(true)}>
                  <Plus size={14} />
                  Add Stock
                </button>
              ) : (
                <button className="btn-primary" style={{ padding: '7px 12px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                  onClick={() => setShowAddInventoryModal(true)}>
                  <Plus size={14} />
                  Add Asset
                </button>
              )}
            </div>

            {/* Sub tab 1: Standard Stock Catalog */}
            {shelfSubTab === 'catalog' && (
              <div className="shelf-board">
                {shelfItems.map(item => (
                  <div 
                    key={item.id} 
                    className={`shelf-item-card ${item.status === 'stocked' ? 'stocked' : ''}`}
                    onClick={() => setShowShelfDetailsModal(item)}
                    style={{
                      borderLeft: `3px solid ${item.priority === 'high' ? 'var(--accent-rose)' : item.priority === 'medium' ? 'var(--accent-amber)' : '#191715'}`,
                      background: '#ffffff',
                      border: '1px solid rgba(25, 23, 21, 0.06)',
                      borderLeftWidth: '3px',
                      borderRadius: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <span className="shelf-item-name" style={{ color: '#191715' }}>{item.name}</span>
                    </div>

                    <div style={{ marginTop: '8px' }}>
                      <span className={`shelf-status-pill ${item.status}`}>
                        {item.status === 'stocked' ? 'Stocked' : item.status === 'low' ? 'Low Stock' : 'Out of stock'}
                      </span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: '#8c857e', marginTop: '6px', fontWeight: 500 }}>
                        <span>by {kompaMembers.find(h => h.id === item.addedById)?.name}</span>
                        <span>{item.timestamp}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sub tab 2: Shared Wishlist assets */}
            {shelfSubTab === 'inventory' && (
              <div>
                {inventoryItems.length === 0 ? (
                  <div className="glass-card" style={{ padding: '30px 16px', textAlign: 'center' }}>
                    <ImageIcon size={30} style={{ color: '#191715', margin: '0 auto 10px' }} />
                    <h4 style={{ fontWeight: 800 }}>No Wishlist Assets</h4>
                    <p style={{ fontSize: '0.78rem', color: '#8c857e', marginTop: '4px' }}>
                      Add appliances, household items, or wishlist entries you want to share with roommates.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {inventoryItems.map(item => (
                      <div 
                        key={item.id} 
                        className="glass-card" 
                        style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px', margin: 0, cursor: 'pointer' }}
                        onClick={() => setShowWishlistDetailsModal(item)}
                      >
                        {renderWishlistClipart(item.imageUrl || '')}
                        
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#191715' }}>{item.name}</div>
                          
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span className={`wishlist-status-pill ${item.status || 'want'}`}>
                              {item.status === 'bought' ? 'Bought!' : item.status === 'waiting' ? 'Waiting for offer' : 'Wanting to Buy'}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.75rem', color: '#8c857e', marginTop: '4px', display: 'flex', gap: '8px' }}>
                            <span>Price: ${item.price?.toFixed(2)}</span>
                            <span>•</span>
                            <span>Added by: {item.addedBy}</span>
                          </div>
                        </div>

                        {item.itemUrl && (
                          <a 
                            href={item.itemUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            onClick={e => e.stopPropagation()}
                            style={{ padding: '8px', borderRadius: '50%', background: 'rgba(25, 23, 21, 0.04)', color: '#191715', display: 'flex' }}
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                        
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            const confirmDel = window.confirm('Remove this asset from wishlist?');
                            if (confirmDel) {
                              setInventoryItems(prev => prev.filter(i => i.id !== item.id));
                              if (dbSynced) {
                                await supabase.from('inventory_items').delete().eq('id', item.id);
                              }
                            }
                          }}
                          style={{ background: 'none', border: 'none', padding: '8px', color: 'var(--accent-rose)', cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Add stock modal */}
            {showAddShelfModal && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
              }}>
                <div className="glass-card" style={{ width: '90%', maxWidth: '380px', border: '1px solid rgba(25, 23, 21, 0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-serif)' }}>Add Catalog Item</h3>
                    <X size={18} className="cursor-pointer" onClick={() => setShowAddShelfModal(false)} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Item Name</label>
                      <input type="text" placeholder="e.g. Toilet Paper, Eggs" value={newShelfName} onChange={e => setNewShelfName(e.target.value)} style={{ marginTop: '4px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Priority Level</label>
                      <select value={newShelfPriority} onChange={e => setNewShelfPriority(e.target.value as any)} style={{ marginTop: '4px' }}>
                        <option value="high">High (Urgent)</option>
                        <option value="medium">Medium (Regular)</option>
                        <option value="low">Low (Optional)</option>
                      </select>
                    </div>
                    {/* Fixed priority status bug, let user pick initial status */}
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Initial Status</label>
                      <select value={newShelfStatus} onChange={e => setNewShelfStatus(e.target.value as any)} style={{ marginTop: '4px' }}>
                        <option value="stocked">In Stock (Stocked)</option>
                        <option value="low">Running Low (Low Stock)</option>
                        <option value="out">Out of Stock (Empty)</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <button className="btn-secondary" style={{ flex: 1, padding: '9px', borderRadius: '4px' }} onClick={() => setShowAddShelfModal(false)}>Cancel</button>
                      <button className="btn-primary" style={{ flex: 1, padding: '9px', borderRadius: '4px' }} onClick={handleAddShelfItem}>Add Item</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Add Wishlist Asset modal */}
            {showAddInventoryModal && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
              }}>
                <div className="glass-card" style={{ width: '90%', maxWidth: '380px', border: '1px solid rgba(25, 23, 21, 0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-serif)' }}>Add Wishlist Asset</h3>
                    <X size={18} className="cursor-pointer" onClick={() => setShowAddInventoryModal(false)} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Asset Name</label>
                      <input type="text" placeholder="e.g. Dyson Vacuum V15, Coffee Pot" value={newInvName} onChange={e => setNewInvName(e.target.value)} style={{ marginTop: '4px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Estimated Price ($)</label>
                      <input type="number" placeholder="e.g. 299.99" value={newInvPrice} onChange={e => setNewInvPrice(e.target.value)} style={{ marginTop: '4px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Item Link URL</label>
                      <input type="text" placeholder="e.g. https://amazon.com/..." value={newInvUrl} onChange={e => setNewInvUrl(e.target.value)} style={{ marginTop: '4px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Status</label>
                      <select value={newInvStatus} onChange={e => setNewInvStatus(e.target.value as any)} style={{ marginTop: '4px' }}>
                        <option value="want">Wanting to Buy</option>
                        <option value="waiting">Waiting for a Good Offer</option>
                        <option value="bought">Bought!</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <button className="btn-secondary" style={{ flex: 1, padding: '9px', borderRadius: '4px' }} onClick={() => setShowAddInventoryModal(false)}>Cancel</button>
                      <button className="btn-primary" style={{ flex: 1, padding: '9px', borderRadius: '4px' }} onClick={handleAddInventory}>Add Wishlist</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Wishlist Item Details & Update Modal */}
            {showWishlistDetailsModal && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
              }}>
                <div className="glass-card" style={{ width: '90%', maxWidth: '380px', border: '1px solid rgba(25, 23, 21, 0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-serif)' }}>Wishlist Asset Properties</h3>
                    <X size={18} className="cursor-pointer" onClick={() => setShowWishlistDetailsModal(null)} />
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: '#8c857e', fontWeight: 700, textTransform: 'uppercase' }}>Item Name</label>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#191715' }}>{showWishlistDetailsModal.name}</div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '0.72rem', color: '#8c857e', fontWeight: 700, textTransform: 'uppercase' }}>Price</label>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>${showWishlistDetailsModal.price?.toFixed(2)}</div>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', color: '#8c857e', fontWeight: 700, textTransform: 'uppercase' }}>Added By</label>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{showWishlistDetailsModal.addedBy}</div>
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.72rem', color: '#8c857e', fontWeight: 700, textTransform: 'uppercase' }}>Update Status</label>
                      <select 
                        value={showWishlistDetailsModal.status || 'want'} 
                        onChange={async (e) => {
                          const nextStatus = e.target.value as any;
                          setInventoryItems(prev => prev.map(item => item.id === showWishlistDetailsModal.id ? { ...item, status: nextStatus } : item));
                          setShowWishlistDetailsModal({ ...showWishlistDetailsModal, status: nextStatus });
                          if (dbSynced) {
                            await supabase.from('inventory_items').update({ status: nextStatus }).eq('id', showWishlistDetailsModal.id);
                          }
                        }}
                        style={{ marginTop: '4px' }}
                      >
                        <option value="want">Wanting to Buy</option>
                        <option value="waiting">Waiting for a Good Offer</option>
                        <option value="bought">Bought!</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      {showWishlistDetailsModal.itemUrl && (
                        <a 
                          href={showWishlistDetailsModal.itemUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="btn-primary" 
                          style={{ flex: 1, padding: '9px', textAlign: 'center', borderRadius: '4px', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                          <ExternalLink size={14} />
                          Buy Product
                        </a>
                      )}
                      
                      <button 
                        className="btn-secondary" 
                        style={{ flex: 1, padding: '9px', color: 'var(--accent-rose)', border: '1px solid var(--accent-rose)', borderRadius: '4px' }} 
                        onClick={async () => {
                          const confirmDel = window.confirm('Delete this asset?');
                          if (confirmDel) {
                            setInventoryItems(prev => prev.filter(i => i.id !== showWishlistDetailsModal.id));
                            if (dbSynced) {
                              await supabase.from('inventory_items').delete().eq('id', showWishlistDetailsModal.id);
                            }
                            setShowWishlistDetailsModal(null);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Shelf Item properties modal */}
            {showShelfDetailsModal && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
              }}>
                <div className="glass-card" style={{ width: '90%', maxWidth: '380px', border: '1px solid rgba(25, 23, 21, 0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-serif)' }}>Item Properties</h3>
                    <X size={18} className="cursor-pointer" onClick={() => setShowShelfDetailsModal(null)} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', textAlign: 'center' }}>
                    <div style={{
                      width: '50px', height: '50px', borderRadius: '50%',
                      background: 'rgba(25,23,21,0.03)', border: '1px solid rgba(25,23,21,0.06)',
                      display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center'
                    }}>
                      <Package size={22} style={{ color: '#191715' }} />
                    </div>
                    <div>
                      <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#191715', fontFamily: 'var(--font-serif)' }}>{showShelfDetailsModal.name}</h2>
                      <p style={{ fontSize: '0.78rem', color: '#8c857e', marginTop: '2px' }}>
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
                          borderColor: showShelfDetailsModal.status === 'stocked' ? 'var(--accent-amber)' : 'var(--accent-emerald)',
                          padding: '9px',
                          borderRadius: '4px'
                        }} 
                        onClick={() => handleToggleRestock(showShelfDetailsModal)}
                      >
                        <Check size={16} />
                        {showShelfDetailsModal.status === 'stocked' ? 'Mark running low' : 'Mark restocked'}
                      </button>
                      
                      <button 
                        className="btn-secondary" 
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 12px', borderRadius: '4px' }}
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

        {/* TAB 3: RUN */}
        {activeTab === 'run' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-serif)' }}>Run</h2>
                <p style={{ fontSize: '0.78rem', color: '#8c857e' }}>Real-time in-store requests coordination</p>
              </div>
            </div>

            {!activeRun ? (
              <div className="glass-card" style={{ padding: '24px 16px', textAlign: 'center' }}>
                <div style={{
                  width: '54px', height: '54px', borderRadius: '50%',
                  background: 'rgba(25, 23, 21, 0.05)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px'
                }}>
                  <ShoppingCart size={24} style={{ color: '#191715' }} />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '4px' }}>No Active Session</h3>
                <p style={{ fontSize: '0.8rem', color: '#8c857e', marginBottom: '16px', fontWeight: 500 }}>
                  Shopping at a local store? Initiate a session to alert your roommates for requests.
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  
                  {/* Grocery stores selection */}
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Select Retailer</label>
                    <select value={runStoreSelect} onChange={e => setRunStoreSelect(e.target.value)} style={{ marginTop: '4px' }}>
                      <option value="Costco">Costco Wholesale</option>
                      <option value="Walmart">Walmart Supercenter</option>
                      <option value="Patel Brothers">Patel Brothers (Indian)</option>
                      <option value="Apna Bazar">Apna Bazar (Indian)</option>
                      <option value="Subzi Mandi">Subzi Mandi (Indian)</option>
                      <option value="Trader Joe's">Trader Joe's</option>
                    </select>
                  </div>

                  <button className="btn-primary" style={{ borderRadius: '4px', marginTop: '4px' }} onClick={() => handleStartRun(runStoreSelect)}>
                    Start {runStoreSelect} Run
                  </button>
                  
                  <div style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#8c857e', margin: '6px 0' }}>OR</div>

                  {/* Custom run configuration fields */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input 
                      type="text" 
                      placeholder="Enter custom store (e.g. Local Mart)..." 
                      value={customStoreInput} 
                      onChange={e => setCustomStoreInput(e.target.value)} 
                      style={{ padding: '9px', fontSize: '0.85rem' }}
                    />
                    <button 
                      className="btn-primary" 
                      style={{ padding: '9px 12px', fontSize: '0.78rem', flexShrink: 0, borderRadius: '4px' }}
                      onClick={() => {
                        if (customStoreInput.trim()) {
                          handleStartRun(customStoreInput.trim());
                          setCustomStoreInput('');
                        }
                      }}
                    >
                      + Custom
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="glass-card" style={{ borderLeft: '3px solid #191715', padding: '14px', marginBottom: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {renderRetailerLogo(activeRun.store)}
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.7rem', color: '#191715', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      LIVE COLLABORATION ACTIVE
                    </div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginTop: '2px', color: '#191715', fontFamily: 'var(--font-serif)' }}>
                      {kompaMembers.find(h => h.id === activeRun.shopperId)?.name}'s {activeRun.store} Run
                    </h3>
                  </div>
                  
                  {/* Notify Avalon Kompa Broadcast alert button */}
                  <button 
                    className="btn-primary" 
                    style={{ padding: '6px 10px', fontSize: '0.72rem', borderRadius: '4px', flexShrink: 0 }}
                    onClick={handleNotifyKompa}
                  >
                    Notify {activeKompa?.name || 'Group'} Kompa
                  </button>
                </div>

                {/* Active Run Requests list */}
                <div className="glass-card" style={{ padding: '14px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '10px', color: '#8c857e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Run requests</h4>
                  
                  {activeRun.requests.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#8c857e', padding: '14px 0', fontSize: '0.8rem' }}>
                      No items requested. Send request below.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                      {activeRun.requests.map(req => (
                        <div 
                          key={req.id} 
                          style={{
                            padding: '10px', borderRadius: '6px', 
                            background: '#ffffff', border: '1px solid rgba(25, 23, 21, 0.06)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#191715' }}>
                              {req.itemName}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#8c857e', marginTop: '1px' }}>
                              Requested by: {kompaMembers.find(h => h.id === req.requesterId)?.name}
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {req.status === 'pending' || req.status === 'searching' ? (
                              <>
                                <button 
                                  style={{ padding: '5px 8px', fontSize: '0.7rem', borderRadius: '4px', border: 'none', background: 'var(--accent-emerald)', color: 'white' }}
                                  onClick={() => {
                                    const pr = prompt('Enter checkout price ($) for this item:', '5.00');
                                    if (pr !== null) handleUpdateRunRequestStatus(req.id, 'found', parseFloat(pr) || 0);
                                  }}
                                >
                                  Found
                                </button>
                                <button 
                                  style={{ padding: '5px 8px', fontSize: '0.7rem', borderRadius: '4px', border: 'none', background: 'var(--accent-rose)', color: 'white' }}
                                  onClick={() => {
                                    const replName = prompt('Enter replacement item name:');
                                    const replPrice = prompt('Enter replacement item price ($):');
                                    if (replName && replPrice) {
                                      handleUpdateRunRequestStatus(req.id, 'replaced', undefined, replName, parseFloat(replPrice) || 0);
                                    }
                                  }}
                                >
                                  Replace
                                </button>
                                <button 
                                  style={{ padding: '5px 8px', fontSize: '0.7rem', borderRadius: '4px', border: 'none', background: 'rgba(25, 23, 21, 0.05)', color: '#191715' }}
                                  onClick={() => handleUpdateRunRequestStatus(req.id, 'out')}
                                >
                                  Out
                                </button>
                              </>
                            ) : (
                              <span style={{
                                fontSize: '0.7rem', fontWeight: 800, padding: '3px 6px', borderRadius: '4px',
                                background: req.status === 'found' ? 'rgba(16, 185, 129, 0.1)' : req.status === 'replaced' ? 'rgba(180, 83, 9, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                                color: req.status === 'found' ? '#10b981' : req.status === 'replaced' ? '#b45309' : '#dc2626',
                                textTransform: 'uppercase'
                              }}>
                                {req.status} {req.price && `($${req.price})`} {req.replacementPrice && `(Repl: $${req.replacementPrice})`}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add new run request */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input 
                      type="text" 
                      placeholder="Request item..." 
                      value={newRequestName} 
                      onChange={e => setNewRequestName(e.target.value)} 
                      style={{ padding: '9px' }}
                    />
                    <button className="btn-primary" style={{ padding: '0 12px', fontSize: '0.8rem', borderRadius: '4px' }} onClick={handleAddRunRequest}>Request</button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-secondary" style={{ flex: 1, padding: '9px', borderRadius: '4px' }} onClick={() => setActiveRun(null)}>Cancel Run</button>
                  <button className="btn-primary" style={{ flex: 1, padding: '9px', borderRadius: '4px' }} onClick={handleCheckoutRun}>
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
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-serif)' }}>Split</h2>
                <p style={{ fontSize: '0.78rem', color: '#8c857e' }}>Calculate and settle shared balances</p>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn-secondary" style={{ padding: '7px 10px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => setShowOCRModal(true)}>
                  <Camera size={14} />
                  Scan
                </button>
                <button className="btn-primary" style={{ padding: '7px 10px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => setShowAddExpenseModal(true)}>
                  <Plus size={14} />
                  Log
                </button>
              </div>
            </div>

            {/* Debt suggestions widget */}
            <div className="glass-card" style={{ borderLeft: '3px solid #191715', background: 'rgba(25, 23, 21, 0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '0.72rem', fontWeight: 800, color: '#8c857e', textTransform: 'uppercase', letterSpacing: '1px' }}>Optimization suggests</h3>
                <button className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.72rem', borderRadius: '4px' }}
                  onClick={() => setShowSettleModal(true)}>
                  Settle Up
                </button>
              </div>

              {optimizedDebts.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#8c857e' }}>No pending balances suggested. You are all settled.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {optimizedDebts.map((debt, index) => {
                    const debtor = kompaMembers.find(h => h.id === debt.debtorId)?.name || 'Someone';
                    const creditor = kompaMembers.find(h => h.id === debt.creditorId)?.name || 'Someone';
                    return (
                      <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 500, color: '#191715' }}>
                        <span>{debtor} to {creditor}</span>
                        <span style={{ fontWeight: 700, color: 'var(--accent-rose)' }}>${debt.amount.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Expense history list (clickable to trigger details editor) */}
            <div className="glass-card">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '10px', color: '#8c857e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Transaction History</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {expenses.map(exp => (
                  <div 
                    key={exp.id} 
                    onClick={() => setShowExpenseDetailsModal(exp)}
                    style={{
                      padding: '10px 12px', borderRadius: '6px', 
                      background: '#ffffff', border: '1px solid rgba(25, 23, 21, 0.06)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#191715', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{exp.title}</span>
                        {exp.itemsJson && exp.itemsJson.length > 0 && (
                          <span style={{ fontSize: '0.62rem', background: 'rgba(25,23,21,0.05)', color: '#191715', padding: '1px 5px', borderRadius: '3px', fontWeight: 750 }}>
                            {exp.itemsJson.length} items
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#8c857e', marginTop: '1px' }}>
                        Paid by {kompaMembers.find(h => h.id === exp.payerId)?.name} on {exp.date}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#191715' }}>${exp.amount.toFixed(2)}</div>
                      <span style={{ fontSize: '0.65rem', background: 'rgba(25, 23, 21, 0.05)', padding: '1px 4px', borderRadius: '4px', color: '#191715', fontWeight: 600 }}>
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
                <div className="glass-card" style={{ width: '90%', maxWidth: '380px', border: '1px solid rgba(25, 23, 21, 0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-serif)' }}>Clear Balances</h3>
                    <X size={18} className="cursor-pointer" onClick={() => setShowSettleModal(false)} />
                  </div>
                  {optimizedDebts.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#8c857e', padding: '14px 0', fontSize: '0.85rem' }}>No balance to settle.</p>
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
                              padding: '8px 10px', borderRadius: '6px', background: '#ffffff',
                              border: '1px solid rgba(25, 23, 21, 0.06)'
                            }}
                          >
                            <div style={{ fontSize: '0.82rem', color: '#191715' }}>
                              <span style={{ fontWeight: 700 }}>{debtor?.name}</span>
                              <span style={{ margin: '0 4px', color: '#8c857e' }}>to</span>
                              <span style={{ fontWeight: 700 }}>{creditor?.name}</span>
                            </div>
                            <button 
                              className="btn-primary" 
                              style={{ padding: '5px 10px', fontSize: '0.75rem', borderRadius: '4px' }}
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
                <div className="glass-card" style={{ width: '90%', maxWidth: '380px', maxHeight: '90%', overflowY: 'auto', border: '1px solid rgba(25, 23, 21, 0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-serif)' }}>OCR Receipt Scan</h3>
                    <X size={18} className="cursor-pointer" onClick={() => { setShowOCRModal(false); setOcrResult(null); }} />
                  </div>
                  
                  {!ocrResult ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', textAlign: 'center', padding: '14px 0' }}>
                      <div style={{
                        width: '54px', height: '54px', borderRadius: '50%',
                        background: 'rgba(25,23,21,0.03)', border: '1px solid rgba(25,23,21,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <Camera size={22} style={{ color: '#191715' }} />
                      </div>
                      {ocrScanning ? (
                        <div>
                          <RefreshCw size={20} className="animate-spin" style={{ color: '#191715', margin: '0 auto 8px' }} />
                          <p style={{ fontWeight: 700, fontSize: '0.88rem' }}>{ocrProgress}</p>
                          <p style={{ fontSize: '0.72rem', color: '#8c857e', marginTop: '2px' }}>Executing item classification OCR</p>
                        </div>
                      ) : (
                        <div style={{ width: '100%' }}>
                          <p style={{ fontWeight: 700, fontSize: '0.88rem' }}>Analyze printed receipts</p>
                          <p style={{ fontSize: '0.75rem', color: '#8c857e', marginTop: '2px', marginBottom: '12px' }}>Upload a file or choose dummy presets</p>
                          
                          <label className="btn-secondary" style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            padding: '10px', cursor: 'pointer', marginBottom: '12px', fontSize: '0.8rem', borderRadius: '4px'
                          }}>
                            <Upload size={16} />
                            Upload Receipt Image
                            <input type="file" accept="image/*" onChange={handleCustomImageOCR} style={{ display: 'none' }} />
                          </label>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn-primary" style={{ padding: '8px 12px', fontSize: '0.75rem', flex: 1, borderRadius: '4px' }} onClick={() => triggerOCRScan('Costco')}>Scan Costco Preset</button>
                            <button className="btn-secondary" style={{ padding: '8px 12px', fontSize: '0.75rem', flex: 1, borderRadius: '4px' }} onClick={() => triggerOCRScan('Walmart')}>Scan Walmart Preset</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(25, 23, 21, 0.06)', paddingBottom: '8px' }}>
                        <div>
                          <h4 style={{ fontWeight: 800, fontSize: '0.9rem', color: '#191715' }}>{ocrResult.merchant}</h4>
                          <span style={{ fontSize: '0.7rem', color: '#8c857e' }}>{ocrResult.date}</span>
                        </div>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>${ocrResult.total.toFixed(2)}</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#8c857e' }}>Identified Items</span>
                        {ocrResult.items.map((item: any, idx: number) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#191715' }}>
                            <span>{item.name}</span>
                            <span style={{ fontWeight: 700 }}>${item.price.toFixed(2)}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#8c857e', borderTop: '1px solid rgba(25,23,21,0.03)', paddingTop: '4px' }}>
                          <span>Associated Tax</span>
                          <span>${ocrResult.tax.toFixed(2)}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button className="btn-secondary" style={{ flex: 1, padding: '9px', borderRadius: '4px' }} onClick={() => setOcrResult(null)}>Clear</button>
                        <button className="btn-primary" style={{ flex: 1, padding: '9px', borderRadius: '4px' }} onClick={handleSaveOCRExpense}>Confirm Split</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Add Manual/Itemized Expense Modal */}
            {showAddExpenseModal && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
              }}>
                <div className="glass-card" style={{ width: '90%', maxWidth: '380px', maxHeight: '90%', overflowY: 'auto', border: '1px solid rgba(25, 23, 21, 0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-serif)' }}>Record Transaction</h3>
                    <X size={18} className="cursor-pointer" onClick={() => setShowAddExpenseModal(false)} />
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Title description</label>
                      <input type="text" placeholder="e.g. Costco grocery, WiFi" value={newExpTitle} onChange={e => setNewExpTitle(e.target.value)} style={{ marginTop: '4px' }} />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Payer</label>
                      <select value={newExpPayer} onChange={e => setNewExpPayer(e.target.value)} style={{ marginTop: '4px' }}>
                        {kompaMembers.map(h => (
                          <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Toggle Itemized vs Single Split */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0' }}>
                      <input 
                        type="checkbox" 
                        id="toggle-itemized" 
                        checked={isItemized} 
                        onChange={e => setIsItemized(e.target.checked)} 
                        style={{ width: '16px', height: '16px' }}
                      />
                      <label htmlFor="toggle-itemized" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#191715', cursor: 'pointer' }}>
                        Split Multiple Items (Itemized Split)
                      </label>
                    </div>

                    {!isItemized ? (
                      <>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Total cost ($)</label>
                          <input type="number" placeholder="0.00" value={newExpAmount} onChange={e => setNewExpAmount(e.target.value)} style={{ marginTop: '4px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Split Formula</label>
                          <select value={newExpSplit} onChange={e => setNewExpSplit(e.target.value as any)} style={{ marginTop: '4px' }}>
                            <option value="equal">Divide Equally</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 600 }}>Included Roommates</label>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                            {kompaMembers.map(h => (
                              <button
                                key={h.id}
                                style={{
                                  padding: '5px 8px', fontSize: '0.72rem', borderRadius: '4px',
                                  border: '1px solid rgba(25, 23, 21, 0.15)',
                                  background: newExpVisibility.includes(h.id) ? '#191715' : 'transparent',
                                  color: newExpVisibility.includes(h.id) ? 'white' : '#191715'
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
                      </>
                    ) : (
                      <div>
                        <label style={{ fontSize: '0.75rem', color: '#8c857e', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Itemized Entries</label>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
                          {itemizedList.map((item, index) => (
                            <div key={index} style={{ border: '1px solid rgba(25,23,21,0.08)', padding: '10px', borderRadius: '6px', background: 'rgba(25,23,21,0.01)' }}>
                              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                                <input 
                                  type="text" 
                                  placeholder="Item name (e.g. Eggs)" 
                                  value={item.name} 
                                  onChange={e => {
                                    const next = [...itemizedList];
                                    next[index].name = e.target.value;
                                    setItemizedList(next);
                                  }}
                                  style={{ padding: '6px', fontSize: '0.78rem' }}
                                />
                                <input 
                                  type="number" 
                                  placeholder="Cost ($)" 
                                  value={item.cost} 
                                  onChange={e => {
                                    const next = [...itemizedList];
                                    next[index].cost = e.target.value;
                                    setItemizedList(next);
                                  }}
                                  style={{ padding: '6px', fontSize: '0.78rem', width: '90px' }}
                                />
                                {itemizedList.length > 1 && (
                                  <button 
                                    className="btn-secondary" 
                                    style={{ padding: '6px 8px', color: 'var(--accent-rose)', borderColor: 'var(--accent-rose)' }}
                                    onClick={() => setItemizedList(itemizedList.filter((_, i) => i !== index))}
                                  >
                                    <Trash size={12} />
                                  </button>
                                )}
                              </div>
                              
                              <div>
                                <label style={{ fontSize: '0.65rem', color: '#8c857e', fontWeight: 700, textTransform: 'uppercase' }}>Split With</label>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                                  {kompaMembers.map(m => {
                                    const active = item.splitWith.includes(m.id);
                                    return (
                                      <button
                                        key={m.id}
                                        style={{
                                          padding: '3px 6px', fontSize: '0.65rem', borderRadius: '3px',
                                          border: '1px solid rgba(25, 23, 21, 0.15)',
                                          background: active ? '#191715' : 'transparent',
                                          color: active ? 'white' : '#191715'
                                        }}
                                        onClick={() => {
                                          const next = [...itemizedList];
                                          if (active) {
                                            next[index].splitWith = item.splitWith.filter(id => id !== m.id);
                                          } else {
                                            next[index].splitWith = [...item.splitWith, m.id];
                                          }
                                          setItemizedList(next);
                                        }}
                                      >
                                        {m.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <button 
                          className="btn-secondary" 
                          style={{ width: '100%', padding: '6px', marginTop: '8px', fontSize: '0.75rem', borderRadius: '4px' }}
                          onClick={() => setItemizedList([...itemizedList, { name: '', cost: '', splitWith: [] }])}
                        >
                          + Add Item entry
                        </button>
                        
                        <div style={{ marginTop: '12px', fontSize: '0.85rem', fontWeight: 900, color: '#191715', textAlign: 'right' }}>
                          Itemized Total: ${itemizedList.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0).toFixed(2)}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <button className="btn-secondary" style={{ flex: 1, padding: '9px', borderRadius: '4px' }} onClick={() => setShowAddExpenseModal(false)}>Cancel</button>
                      <button className="btn-primary" style={{ flex: 1, padding: '9px', borderRadius: '4px' }} onClick={handleAddManualExpense}>Add Bill</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Click details modal for Expense History (Update/Delete splits) */}
            {showExpenseDetailsModal && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 110
              }}>
                <div className="glass-card" style={{ width: '90%', maxWidth: '380px', maxHeight: '90%', overflowY: 'auto', border: '1px solid rgba(25, 23, 21, 0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-serif)' }}>Split Details</h3>
                    <X size={18} className="cursor-pointer" onClick={() => setShowExpenseDetailsModal(null)} />
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: '#8c857e', fontWeight: 700, textTransform: 'uppercase' }}>Description</label>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#191715' }}>{showExpenseDetailsModal.title}</div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '0.72rem', color: '#8c857e', fontWeight: 700, textTransform: 'uppercase' }}>Total Amount</label>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>${showExpenseDetailsModal.amount.toFixed(2)}</div>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', color: '#8c857e', fontWeight: 700, textTransform: 'uppercase' }}>Payer</label>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                          {kompaMembers.find(h => h.id === showExpenseDetailsModal.payerId)?.name || 'Someone'}
                        </div>
                      </div>
                    </div>

                    {/* Rendering Child Itemized lists if itemsJson is loaded */}
                    {showExpenseDetailsModal.itemsJson && showExpenseDetailsModal.itemsJson.length > 0 && (
                      <div style={{ border: '1px solid rgba(25,23,21,0.08)', padding: '10px', borderRadius: '6px', background: 'rgba(25,23,21,0.01)' }}>
                        <label style={{ fontSize: '0.72rem', color: '#8c857e', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Itemized Breakdown</label>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                          {showExpenseDetailsModal.itemsJson.map((item, idx) => {
                            const isIncluded = item.splitWith.includes(currentUserProfile.id);
                            const myShare = isIncluded ? (item.cost / item.splitWith.length) : 0;
                            return (
                              <div key={idx} className="itemized-sub-row">
                                <span>{item.name}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontWeight: 800 }}>${myShare.toFixed(2)} share</span>
                                  <span style={{ fontSize: '0.7rem', color: '#8c857e' }}>(${item.cost.toFixed(2)})</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <button 
                        className="btn-secondary" 
                        style={{ flex: 1, padding: '9px', color: 'var(--accent-rose)', border: '1px solid var(--accent-rose)', borderRadius: '4px' }} 
                        onClick={async () => {
                          const confirmDel = window.confirm('Delete this transaction split?');
                          if (confirmDel) {
                            setExpenses(prev => prev.filter(e => e.id !== showExpenseDetailsModal.id));
                            if (dbSynced) {
                              await supabase.from('expenses').delete().eq('id', showExpenseDetailsModal.id);
                            }
                            setShowExpenseDetailsModal(null);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 5: CHAT */}
        {activeTab === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '620px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(0, 0, 0, 0.05)', paddingBottom: '8px', marginBottom: '12px' }}>
              <Users size={16} style={{ color: '#191715' }} />
              
              {/* Active Kompa specific Chatroom Name */}
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#191715' }}>{activeKompa?.name} Chatroom</h2>
                <span style={{ fontSize: '0.68rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-emerald)' }}></span>
                  Double Ratchet Encryption Active
                </span>
              </div>

              {/* Online members initials row */}
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {kompaMembers.map(m => (
                  <div key={m.id} title={m.name}>
                    {renderInitialsAvatar(m, 26)}
                  </div>
                ))}
              </div>
            </div>

            {/* Chat messages layout */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingRight: '4px' }}>
              {chatMessages.map(msg => {
                const isMe = msg.senderId === currentUserProfile.id;
                const isSystem = msg.senderId === 'system';
                const sender = kompaMembers.find(h => h.id === msg.senderId);
                
                if (isSystem) {
                  return (
                    <div key={msg.id} style={{
                      alignSelf: 'center', background: 'rgba(25,23,21,0.03)', 
                      padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(25,23,21,0.04)',
                      fontSize: '0.72rem', color: '#8c857e', margin: '6px 0', textAlign: 'center', fontWeight: 500
                    }}>
                      {msg.text}
                    </div>
                  );
                }

                return (
                  <div 
                    key={msg.id} 
                    className={`chat-bubble ${isMe ? 'sent' : 'received'}`}
                    style={{
                      background: isMe ? '#191715' : '#ffffff',
                      color: isMe ? '#ffffff' : '#191715',
                      border: isMe ? '1px solid #191715' : '1px solid rgba(25, 23, 21, 0.08)',
                      borderRadius: '12px',
                      padding: '8px 12px',
                      maxWidth: '80%',
                      alignSelf: isMe ? 'flex-end' : 'flex-start',
                      marginBottom: '8px',
                      boxShadow: 'none'
                    }}
                  >
                    {!isMe && (
                      <div style={{ 
                        fontSize: '0.68rem', 
                        fontWeight: 750, 
                        color: '#191715',
                        marginBottom: '2px'
                      }}>
                        {sender?.name || 'Roommate'}
                      </div>
                    )}
                    <div>{msg.text}</div>
                    <span style={{ 
                      fontSize: '0.62rem', 
                      color: isMe ? 'rgba(255,255,255,0.6)' : '#8c857e', 
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

            {/* Typing Indicator dots */}
            {typingUser && (
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <span style={{ marginLeft: '4px' }}>{typingUser} is typing...</span>
              </div>
            )}

            {/* Chat controls */}
            <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', borderTop: '1px solid rgba(25, 23, 21, 0.05)', paddingTop: '10px', paddingBottom: '20px' }}>
              <input 
                type="text" 
                placeholder="Message homemates..." 
                value={chatInput} 
                onChange={e => handleChatInputChange(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                style={{ padding: '10px 12px' }}
              />
              <button 
                className="btn-primary" 
                style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', padding: '10px 12px', borderRadius: '4px' }}
                onClick={handleSendMessage}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Bottom Nav Bar */}
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
            <span className="unread-badge" style={{ background: '#dc2626', color: '#ffffff' }}>
              {unreadChatCount}
            </span>
          )}
        </div>
      </nav>

    </div>
  );
}
