import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

const neonAuthUrl =
  process.env.NEXT_PUBLIC_NEON_AUTH_URL ||
  "https://ep-nameless-pine-b4l3jt2f.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth";

export const neonAuthClient = createAuthClient(neonAuthUrl, {
  adapter: BetterAuthReactAdapter(),
}) as any;

export interface StoredAdminAuth {
  accessToken: string;
  email: string;
}

export const ADMIN_STORAGE_KEY = "robocraft_admin_auth";

export function getStoredAdminAuth(): { accessToken: string; email: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    return raw ? JSON.parse(raw) as { accessToken: string; email: string } : null;
  } catch {
    return null;
  }
}

export function setStoredAdminAuth(data: { accessToken: string; email: string }): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to store admin auth:", err);
  }
}

export function clearStoredAdminAuth(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
  } catch (err) {
    console.error("Failed to clear admin auth:", err);
  }
}

export async function syncAdminSession(): Promise<{ accessToken: string; email: string } | null> {
  try {
    const { data: sessionData } = await neonAuthClient.getSession();
    if (!sessionData?.user) {
      return null;
    }

    const { data: tokenData } = await neonAuthClient.token();
    const accessToken = tokenData?.token || "neon_auth_session";

    const authObj = {
      accessToken,
      email: sessionData.user.email,
    };

    setStoredAdminAuth(authObj);
    return authObj;
  } catch (err) {
    console.warn("Admin session sync warning:", err);
    return null;
  }
}

export async function fetchAdminRole(token?: string): Promise<"admin" | "superadmin" | "user"> {
  try {
    if (!token) {
      const { data } = await neonAuthClient.token();
      token = data?.token || undefined;
    }

    if (!token) {
      return "user";
    }

    if (typeof token === "string" && token.includes("session")) {
      return "user";
    }

    // Neon token role is authoritative. No backend /me round trip to the old
    // auth service, no email allow-list fallback, and no "user" default that
    // could let a non-admin session slip through.
    return (token as unknown as { role?: string }).role === "admin"
      ? "admin"
      : "user";
  } catch {
    return "user";
  }
}
