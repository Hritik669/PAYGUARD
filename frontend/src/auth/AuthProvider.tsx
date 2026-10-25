import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setCsrfToken } from "../api/client";
import type { Envelope, User } from "../api/types";

type AuthState = {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({
  children,
  initialUser = null,
  skipBootstrap = false,
}: {
  children: ReactNode;
  initialUser?: User | null;
  skipBootstrap?: boolean;
}) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(!skipBootstrap);

  useEffect(() => {
    if (skipBootstrap) return;
    let active = true;
    void (async () => {
      try {
        const csrf = await api.get<Envelope<{ csrfToken: string }>>("/auth/csrf");
        setCsrfToken(csrf.data.data.csrfToken);
        const me = await api.get<Envelope<{ user: User }>>("/auth/me");
        if (active) setUser(me.data.data.user);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [skipBootstrap]);

  const value = useMemo(() => ({ user, loading, setUser }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
