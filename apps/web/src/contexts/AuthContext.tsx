import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";
import { apiCall } from "@/config/api";

interface User {
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
  loginAsGuest: (email?: string, name?: string, role?: string) => void;
  hasClerkKey: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const hasClerkKey = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

const ClerkAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoaded: clerkLoaded, isSignedIn, getToken, signOut } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [token, setToken] = useState<string | null>(null);
  const [backendRole, setBackendRole] = useState<string | null>(null);

  useEffect(() => {
    if (!clerkLoaded) return;

    if (!isSignedIn) {
      setToken(null);
      localStorage.removeItem("authToken");
      return;
    }

    let active = true;

    const refresh = async () => {
      try {
        const next = await getToken();
        if (!active) return;
        setToken(next);
        if (next) localStorage.setItem("authToken", next);
      } catch (err) {
        console.warn("Clerk token refresh error:", err);
      }
    };

    void refresh();
    const interval = setInterval(refresh, 45_000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [clerkLoaded, isSignedIn, getToken]);

  useEffect(() => {
    if (!token) {
      setBackendRole(null);
      return;
    }

    let active = true;
    apiCall<{ success?: boolean; data?: { role?: string } }>("/auth/me")
      .then((res) => {
        if (active) setBackendRole(res.data?.role ?? null);
      })
      .catch((err) => console.warn("Backend auth profile check bypassed:", err));

    return () => {
      active = false;
    };
  }, [token]);

  const user: User | null = clerkUser
    ? {
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
        firstName: clerkUser.firstName ?? undefined,
        lastName: clerkUser.lastName ?? undefined,
        role:
          backendRole ??
          (clerkUser.publicMetadata?.role as string | undefined) ??
          "user",
      }
    : null;

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: Boolean(isSignedIn && token),
    isLoading: !clerkLoaded,
    logout: () => {
      localStorage.removeItem("authToken");
      void signOut();
    },
    loginAsGuest: () => {},
    hasClerkKey: true,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const LocalAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("authToken"));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("localUser");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return null;
  });

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("authToken");
    localStorage.removeItem("localUser");
  };

  const loginAsGuest = (email = "user@robocraft.studio", name = "RoboCraft Explorer", role = "user") => {
    const mockToken = "mock_frontend_token_" + Date.now();
    const parts = name.split(" ");
    const mockUser: User = {
      id: "usr_guest_" + Date.now(),
      email,
      firstName: parts[0] || "RoboCraft",
      lastName: parts.slice(1).join(" ") || "Explorer",
      role,
    };
    setToken(mockToken);
    setUser(mockUser);
    localStorage.setItem("authToken", mockToken);
    localStorage.setItem("localUser", JSON.stringify(mockUser));
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: Boolean(token && user),
    isLoading: false,
    logout,
    loginAsGuest,
    hasClerkKey: false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (hasClerkKey) {
    return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
  }
  return <LocalAuthProvider>{children}</LocalAuthProvider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
