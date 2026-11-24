/**
 * The account last used on this device, for a one-tap "Continue as …" in the sign-in dialog.
 * Kept in localStorage only; it is a convenience hint, never a credential (the real session
 * lives in the HttpOnly cookie).
 */
import type { User } from './types';

export type SignInMethod = 'google' | 'email' | 'password';

export interface LastAccount {
  name: string;
  email: string;
  avatarUrl: string | null;
  method: SignInMethod;
  at: number;
}

const KEY = 'cinepulse_last_account';

export function readLastAccount(): LastAccount | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || 'null') as LastAccount | null;
    if (!parsed || typeof parsed.email !== 'string' || !parsed.email.includes('@')) return null;
    if (!['google', 'email', 'password'].includes(parsed.method)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLastAccount(user: Pick<User, 'name' | 'email' | 'avatarUrl' | 'displayName'>, method: SignInMethod) {
  if (typeof window === 'undefined' || !user?.email) return;
  const entry: LastAccount = {
    name: (user.displayName || user.name || user.email.split('@')[0]).slice(0, 80),
    email: user.email,
    avatarUrl: user.avatarUrl && user.avatarUrl.startsWith('https://') ? user.avatarUrl : null,
    method,
    at: Date.now(),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    /* storage blocked: the dialog simply shows the full form */
  }
}

export function forgetLastAccount() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
