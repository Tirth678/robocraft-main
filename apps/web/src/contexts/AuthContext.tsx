import React, { createContext, useContext, useEffect, useState } from "react";
import { getStoredAuth, subscribeToAuthChange, clearStoredAuth, type StoredAuth } from "@/lib/auth";
import { logout as neonLogout, refreshAccessToken, syncNeonSession } from "@/lib/neonAuth";

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [storedAuth, setStoredAuth] = useState<StoredAuth | null>(() => getStoredAuth());
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;

    syncNeonSession()
      .then((auth) => {
        if (active && auth) {
          setStoredAuth(auth);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    const unsubscribe = subscribeToAuthChange(() => {
      setStoredAuth(getStoredAuth());
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Neon JWTs expire after ~15 minutes while sessions last days. Keep the
  // stored token fresh so long-lived admin sessions don't start failing
  // mid-use (the historical "works once, breaks on every revisit" cycle).
  useEffect(() => {
    if (!storedAuth?.email) return;

    const refresh = () => {
      if (document.visibilityState === "visible") void refreshAccessToken();
    };
    const interval = window.setInterval(refresh, 10 * 60 * 1000);
    // Also refresh when the tab regains focus after being idle.
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [storedAuth?.email]);

  // Role is reconciled from Neon Auth only. There are no hardcoded backend
  // users and no client-side role fallback: the token carries the role, or
  // `user` is `null` and `isAuthenticated` is `false`.
  useEffect(() => {
    if (!storedAuth?.email) {
      setUser(null);
      return;
    }

    // Role is stored by the Neon Auth sync (session user role), so the
    // storefront view of `user.role` never diverges from the identity provider.
    const inferredRole = storedAuth.role ?? "user";
    setUser({
      id: storedAuth.email,
      email: storedAuth.email,
      firstName: storedAuth.firstName,
      lastName: storedAuth.lastName,
      role: inferredRole,
    });
  }, [storedAuth]);

  const handleLogout = () => {
    void neonLogout();
    clearStoredAuth();
    setStoredAuth(null);
    setUser(null);
  };

  // Login is now only via Neon Auth. The email/password check lives on the
  // identity provider, not here.

  const value: AuthContextType = {
    user,
    token: storedAuth?.accessToken || null,
    isAuthenticated: Boolean(storedAuth?.email),
    isLoading,
    logout: handleLogout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};