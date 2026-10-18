// The one Repository the app uses: the shared Supabase database when it is configured (and we are not
// under vitest), otherwise the browser-local IndexedDB store. Pages and hooks import `repository` from
// here, never a concrete implementation.
import { isSupabaseMode } from '@/lib/supabase';
import { repository as localRepository } from './localRepository';
import { supabaseRepository } from './supabaseRepository';
import type { Repository } from './repository';

export { isSupabaseMode };

export const repository: Repository = isSupabaseMode ? supabaseRepository : localRepository;
