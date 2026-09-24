import React, { createContext, useContext, useEffect, useState } from "react";
import { getStoredAuth, subscribeToAuthChange, clearStoredAuth, type StoredAuth } from "@/lib/auth";
import { logout as neonLogout, fetchBackendUser } from "@/lib/neonAuth";

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
  const [backendUser, setBackendUser] = useState<Partial<User> | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChange(() => {
      setStoredAuth(getStoredAuth());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!storedAuth?.accessToken) {
      setBackendUser(null);
      return;
    }

    let active = true;
    setIsLoading(true);

    fetchBackendUser(storedAuth.accessToken)
      .then((userProfile) => {
        if (!active) return;
        if (userProfile) {
          setBackendUser({
            id: userProfile.sub || userProfile.id || storedAuth.email,
            email: userProfile.email || storedAuth.email,
            firstName: userProfile.firstName || userProfile.name?.split(" ")[0],
            lastName: userProfile.lastName || userProfile.name?.split(" ").slice(1).join(" "),
            role: userProfile.role || "user",
          });
        }
      })
      .catch(() => {
        if (active) setBackendUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [storedAuth]);

  const user: User | null = storedAuth
    ? {
        id: backendUser?.id || storedAuth.email,
        email: storedAuth.email,
        firstName: backendUser?.firstName,
        lastName: backendUser?.lastName,
        role: backendUser?.role || "user",
      }
    : null;

  const handleLogout = () => {
    void neonLogout();
    clearStoredAuth();
    setStoredAuth(null);
    setBackendUser(null);
  };

  const value: AuthContextType = {
    user,
    token: storedAuth?.accessToken || null,
    isAuthenticated: Boolean(storedAuth?.accessToken),
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
