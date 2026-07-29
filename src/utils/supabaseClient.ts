import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://raxsxkuelqvyqafscafg.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_FQTGRsiK1MRk-DdBykpZCg_CAlXciCZ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
