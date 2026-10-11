import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, ApiError } from './api';
import type { User } from './types';
import { storageGet, storageSet } from './util';

const TOKEN_KEY = 'rallie.hostToken';

interface AuthValue {
  user: User | null;
  token: string | null;
  /** False until the saved token (if any) has been checked with the server. */
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => storageGet(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(() => storageGet(TOKEN_KEY) === null);

  // Validate a saved token once on load.
  useEffect(() => {
    const saved = storageGet(TOKEN_KEY);
    if (!saved) return;
    let cancelled = false;
    api
      .me(saved)
      .then(({ user }) => {
        if (!cancelled) setUser(user);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          storageSet(TOKEN_KEY, null);
          if (!cancelled) setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const accept = useCallback((nextToken: string, nextUser: User) => {
    storageSet(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setReady(true);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login({ email, password });
      accept(res.token, res.user);
    },
    [accept],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await api.register({ name, email, password });
      accept(res.token, res.user);
    },
    [accept],
  );

  const logout = useCallback(() => {
    storageSet(TOKEN_KEY, null);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, ready, login, register, logout }),
    [user, token, ready, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Redirects to the sign-in page when there is no signed-in host. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
