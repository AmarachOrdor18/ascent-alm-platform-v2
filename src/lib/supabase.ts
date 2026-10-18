/// <reference types="vite/client" />
// The Supabase client, created on first use so that importing this module never needs credentials
// (unit tests and the offline build never call it).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True when the app should read and write the shared Supabase database. Vitest always runs against the
 * local (IndexedDB) repository, whatever .env.local says.
 */
export const isSupabaseMode: boolean = Boolean(url && anonKey) && import.meta.env.MODE !== 'test';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    if (!url || !anonKey) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

/** Throws a readable error when the Supabase project cannot be reached (checked once on app start). */
export async function assertSupabaseReachable(): Promise<void> {
  if (!url || !anonKey) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, { headers: { apikey: anonKey } });
  } catch (err) {
    throw new Error(`Supabase is unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!response.ok) throw new Error(`Supabase is unavailable (HTTP ${response.status} from the auth service)`);
}
