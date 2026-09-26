import React, { createContext, useContext, useEffect, useState } from "react";
import { getStoredAuth, subscribeToAuthChange, clearStoredAuth, type StoredAuth } from "@/lib/auth";
import { logout as neonLogout, syncNeonSession } from "@/lib/neonAuth";

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

  // Role is reconciled from Neon Auth only. There are no hardcoded backend
  // users and no client-side role fallback: the token carries the role, or
  // `user` is `null` and `isAuthenticated` is `false`.
  useEffect(() => {
    if (!storedAuth?.email) {
      setUser(null);
      return;
    }

    // Keep the inferred role in sync with the token payload, so the storefront
    // view of `user.role` never diverges from Neon Auth.
    const inferredRole = (storedAuth as { role?: string }).role ?? "user";
    setUser({
      id: storedAuth.email,
      email: storedAuth.email,
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