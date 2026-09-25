import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

const neonAuthUrl =
  process.env.NEXT_PUBLIC_NEON_AUTH_URL ||
  "https://ep-nameless-pine-b4l3jt2f.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth";

const authServiceUrl =
  process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || "http://localhost:3001";

export const neonAuthClient = createAuthClient(neonAuthUrl, {
  adapter: BetterAuthReactAdapter(),
}) as any;

export interface StoredAdminAuth {
  accessToken: string;
  email: string;
}

const ADMIN_STORAGE_KEY = "robocraft_admin_auth";

export function getStoredAdminAuth(): StoredAdminAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredAdminAuth(data: StoredAdminAuth): void {
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

export async function syncAdminSession(): Promise<StoredAdminAuth | null> {
  try {
    const { data: sessionData } = await neonAuthClient.getSession();
    if (!sessionData?.user) {
      return null;
    }

    const { data: tokenData } = await neonAuthClient.token();
    const accessToken = tokenData?.token || "neon_auth_session";

    const authObj: StoredAdminAuth = {
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

export async function fetchAdminRole(token?: string, userEmail?: string) {
  try {
    let bearerToken = token;

    if (!bearerToken || bearerToken.includes("session")) {
      const { data } = await neonAuthClient.token();
      if (data?.token) {
        bearerToken = data.token;
      }
    }

    if (bearerToken && !bearerToken.includes("session")) {
      const res = await fetch(`${authServiceUrl}/me`, {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      });

      if (res.ok) {
        const json = await res.json();
        if (json?.user?.role) {
          return json.user.role;
        }
      }
    }

    // Default admin check fallback if role isn't explicitly set in token payload
    const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "admin@robocraft.com,tirth@robocraft.com")
      .toLowerCase()
      .split(",")
      .map((e) => e.trim());

    if (userEmail && adminEmails.includes(userEmail.toLowerCase())) {
      return "admin";
    }

    return "user";
  } catch {
    return "user";
  }
}
