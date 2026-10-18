// Sign-in against Supabase Auth, resolved to the app's own User record (app_users, linked by auth_user_id).
import { supabase } from '@/lib/supabase';
import { supabaseRepository } from '@/store/supabaseRepository';
import type { User } from '@/engine/types';

/** The active app_users record for the current Supabase session, or null (signing out if none is linked). */
export async function loadSignedInUser(authUserId: string): Promise<User | null> {
  const user = await supabaseRepository.getUserByAuthId(authUserId);
  if (!user || !user.isActive) {
    await supabase().auth.signOut();
    return null;
  }
  return user;
}

/** Password sign-in; records lastLoginAt on the user's own record. Throws a user-readable error on failure. */
export async function signInWithPassword(email: string, password: string): Promise<User> {
  const { data, error } = await supabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error || !data.user) {
    throw new Error(
      error?.message === 'Invalid login credentials' || !error ? 'Invalid email or password.' : error.message,
    );
  }
  const user = await loadSignedInUser(data.user.id);
  if (!user) throw new Error('This sign-in is not linked to an active Ascent account.');
  const signedIn = { ...user, lastLoginAt: new Date().toISOString() };
  await supabaseRepository.upsertUser(signedIn);
  return signedIn;
}

/** True when `password` is the signed-in user's current password (re-authenticates the same account). */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  return !error;
}

export async function changeOwnPassword(newPassword: string): Promise<void> {
  const { error } = await supabase().auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

/** Creates a Supabase sign-in plus the app_users row (public.create_login → app.create_login). */
export async function createLogin(user: User, password: string): Promise<void> {
  const { passwordHash: _discarded, ...record } = user;
  void _discarded;
  const { error } = await supabase().rpc('create_login', {
    p_email: user.email.trim().toLowerCase(),
    p_password: password,
    p_user: { ...record, email: user.email.trim().toLowerCase() },
  });
  if (error)
    throw new Error(
      error.code === '42501' && !/^not permitted/i.test(error.message)
        ? `Not permitted: ${error.message}`
        : error.message,
    );
}

/** An administrator's password reset for another user. */
export async function setLoginPassword(appUserId: string, password: string): Promise<void> {
  const { error } = await supabase().rpc('set_login_password', { p_app_user_id: appUserId, p_password: password });
  if (error) throw new Error(error.message);
}
