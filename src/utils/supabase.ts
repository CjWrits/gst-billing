import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Normalizes Supabase Project URL (strips trailing slashes, /rest/v1, etc.)
 */
export function sanitizeSupabaseUrl(rawUrl?: string | null): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  // Strip trailing /rest/v1 or /rest/v1/
  url = url.replace(/\/rest\/v1\/?$/i, '');
  // Strip trailing slashes
  url = url.replace(/\/+$/, '');
  return url;
}

export function getSupabaseUrl(): string {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const storedUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('gogst_supabase_url') : null;
  return sanitizeSupabaseUrl(storedUrl || envUrl);
}

export function getSupabaseAnonKey(): string {
  const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const storedKey = typeof localStorage !== 'undefined' ? localStorage.getItem('gogst_supabase_anon_key') : null;
  return (storedKey || envAnonKey || '').trim();
}

export const SUPABASE_URL = getSupabaseUrl();
export const SUPABASE_ANON_KEY = getSupabaseAnonKey();

export const isSupabaseConfigured = (): boolean => {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  return Boolean(
    url && 
    key && 
    url.startsWith('http') &&
    key.length > 15
  );
};

let clientInstance: SupabaseClient | null = null;
let lastUrl = '';
let lastKey = '';

export function getSupabase(): SupabaseClient | null {
  const currentUrl = getSupabaseUrl();
  const currentKey = getSupabaseAnonKey();

  if (!isSupabaseConfigured()) {
    return null;
  }

  // Re-instantiate if URL or Key changed dynamically in localStorage
  if (!clientInstance || lastUrl !== currentUrl || lastKey !== currentKey) {
    lastUrl = currentUrl;
    lastKey = currentKey;
    clientInstance = createClient(currentUrl, currentKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof localStorage !== 'undefined' ? localStorage : undefined
      }
    });
  }

  return clientInstance;
}

export const supabase = getSupabase();
