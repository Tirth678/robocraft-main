import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Admin session state.
 *
 * Deliberately independent of the storefront's Neon Auth: an admin signs in
 * with admin-service credentials and receives an httpOnly cookie. No token is
 * ever exposed to JavaScript here, which is why `token` is only a presence
 * marker used to gate rendering.
 */
export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

interface AdminAuthValue {
  admin: AdminUser | null;
  /** Presence marker only — the real credential is the httpOnly cookie. */
  token: string | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

const base = (
  (import.meta.env.VITE_ADMIN_SERVICE_URL as string | undefined) || ""
).trim().replace(/\/+$/, "");

const authUrl = (path: string) => (base ? `${base}${path}` : `/admin-api${path}`);

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ask admin-service who we are on boot; the cookie decides, not local state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(authUrl("/api/auth/me"), { credentials: "include" });
        if (!cancelled && res.ok) {
          const payload = await res.json();
          if (payload?.success) setAdmin(payload.data.admin);
        }
      } catch {
        /* not signed in */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const res = await fetch(authUrl("/api/auth/login"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.success) {
      const message = payload?.error || "Sign in failed";
      setError(message);
      throw new Error(message);
    }
    setAdmin(payload.data.admin);
  }, []);

  const signOut = useCallback(async () => {
    await fetch(authUrl("/api/auth/logout"), { method: "POST", credentials: "include" }).catch(
      () => undefined,
    );
    setAdmin(null);
  }, []);

  const value = useMemo<AdminAuthValue>(
    () => ({
      admin,
      token: admin ? "admin-session" : null,
      loading,
      error,
      signIn,
      signOut,
    }),
    [admin, loading, error, signIn, signOut],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
};

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used inside <AdminAuthProvider>");
  return ctx;
}

/**
 * Drop-in replacement for the storefront's `useAuth()` so the relocated admin
 * screens need no changes. Only the fields they actually read are provided,
 * mapped onto admin-service's session instead of Neon Auth.
 */
export function useAuth(): {
  token: string | null;
  user: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
} {
  const { admin, token, loading, signOut } = useAdminAuth();
  return {
    token,
    user: admin,
    isAuthenticated: Boolean(admin),
    isLoading: loading,
    logout: signOut,
  };
}