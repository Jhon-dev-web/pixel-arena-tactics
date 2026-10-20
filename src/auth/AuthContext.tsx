import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { clearPendingInvite, pendingInvite } from '../lib/inviteMemory';
import { claimInvite } from '../lib/referral';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  configured: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isSupabaseConfigured ? 'loading' : 'unauthenticated');
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setStatus(data.session ? 'authenticated' : 'unauthenticated');
    });

    // Keeps the app in sync across tabs and after a token refresh, and is also how the app "restores
    // the session" on reload without ever asking for a login again while it's still valid.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setStatus(nextSession ? 'authenticated' : 'unauthenticated');
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp: AuthContextValue['signUp'] = async (email, password) => {
    if (!supabase) return { error: 'not_configured' };
    // The invite of the link the player came by rides along as user metadata; a server trigger records it on the new account (migration 0024). It is only a code, never an e-mail.
    const invite = pendingInvite();
    const { error } = await supabase.auth.signUp(invite ? { email, password, options: { data: { invite } } } : { email, password });
    return { error: error ? error.message : null };
  };

  // After a fresh sign-up + first login: if the trigger missed the code, claim it once while it is still in memory (the server accepts it only for an account under 24 h old with no progress).
  const signedInUserId = session?.user?.id ?? null;
  useEffect(() => {
    if (!signedInUserId) return;
    const code = pendingInvite();
    if (!code) return;
    clearPendingInvite();
    void claimInvite(code);
  }, [signedInUserId]);

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    if (!supabase) return { error: 'not_configured' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const value: AuthContextValue = {
    status,
    user: session?.user ?? null,
    session,
    configured: isSupabaseConfigured,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used within <AuthProvider>');
  return ctx;
}
