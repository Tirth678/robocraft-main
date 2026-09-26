'use client';

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  getStoredAdminAuth,
  syncAdminSession,
  clearStoredAdminAuth,
  fetchAdminRole,
  neonAuthClient,
} from "@/lib/neonAuth";

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  isAdmin: boolean;
}

interface AuthContextType {
  user: AdminUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [storedAuth, setStoredAuth] = useState<{ accessToken: string; email: string } | null>(null);
  const [role, setRole] = useState<"admin" | "superadmin" | "user">("user");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkAuth = async () => {
    setIsLoading(true);
    try {
      const activeSession = await syncAdminSession() || getStoredAdminAuth();
      if (activeSession?.email) {
        setStoredAuth(activeSession);
        const userRole = await fetchAdminRole(activeSession.accessToken);
        setRole(userRole);
      } else {
        setStoredAuth(null);
        setRole("user");
      }
    } catch {
      setStoredAuth(null);
      setRole("user");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await neonAuthClient.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      clearStoredAdminAuth();
      setStoredAuth(null);
      setRole("user");
    }
  };

  const isAdmin = role === "admin" || role === "superadmin";

  const user: AdminUser | null = storedAuth
    ? {
        id: storedAuth.email,
        email: storedAuth.email,
        role,
        isAdmin,
      }
    : null;

  const value: AuthContextType = {
    user,
    token: storedAuth?.accessToken || null,
    isAuthenticated: Boolean(storedAuth?.email),
    isAdmin,
    isLoading,
    logout: handleLogout,
    refreshSession: checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAdminAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAdminAuth must be used within an AuthProvider");
  }
  return context;
};
