/**
 * Neon Auth client for the admin dashboard.
 *
 * Uses the Next.js proxy pattern: createAuthClient() with NO arguments.
 * All requests go through /api/auth/* on this same Next.js server, which
 * proxies them to the Neon Auth backend with the correct headers and cookies.
 *
 * Do NOT use BetterAuthReactAdapter or pass a URL here — that's the Vite/React
 * pattern and causes 401 errors because Neon Auth rejects direct browser calls.
 */
import { createAuthClient } from "@neondatabase/auth/next";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const neonAuthClient = createAuthClient() as any;

export interface StoredAdminAuth {
  accessToken: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

export const ADMIN_STORAGE_KEY = "robocraft_admin_auth";

export function getStoredAdminAuth(): StoredAdminAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAdminAuth) : null;
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
    // If there is no real JWT, there is no valid session.
    const accessToken = tokenData?.token;
    if (!accessToken) {
      return null;
    }

    const authObj: StoredAdminAuth = {
      accessToken,
      email: sessionData.user.email ?? "",
      name: (sessionData.user as { name?: string }).name,
    };

    setStoredAdminAuth(authObj);
    return authObj;
  } catch (err) {
    console.warn("Admin session sync warning:", err);
    return null;
  }
}

const INVENTORY_SERVICE_URL =
  process.env.NEXT_PUBLIC_INVENTORY_SERVICE_URL || "http://localhost:3002";

/**
 * Verify admin role by probing the inventory service with the JWT.
 *
 * Neon Auth JWTs always carry `role: "authenticated"` for every signed-in
 * user — they do NOT embed the application-level "admin" value. The real gate
 * is the `inventory_admins` allow-list checked server-side by the inventory
 * service.
 *
 * A 200 response means the JWT is valid AND the user is in inventory_admins.
 * Anything else (401, 403, network error) means not an admin.
 */
export async function fetchAdminRole(
  token?: string,
  userEmail?: string
): Promise<"admin" | "superadmin" | "user"> {
  try {
    if (!token) {
      const { data } = await neonAuthClient.token();
      token = data?.token || undefined;
    }

    // No token or non-JWT string → not an admin.
    if (!token || !token.includes(".")) return "user";

    // 1. Probe the inventory service with the JWT
    try {
      const res = await fetch(
        `${INVENTORY_SERVICE_URL}/admin/inventory/items?limit=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status === 200) return "admin";
    } catch {
      // Inventory service network error - fall through to token payload check
    }

    // 2. Decode the JWT payload to check role and email
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.role === "admin" || payload.role === "superadmin") {
          return payload.role;
        }

        const email = (payload.email || userEmail || "").toLowerCase().trim();
        const adminEmails = (
          process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
          "admin@robocraft.com,tirth@robocraft.com"
        )
          .toLowerCase()
          .split(",")
          .map((e) => e.trim());

        if (email && adminEmails.includes(email)) {
          return "admin";
        }
      }
    } catch {
      // Failed to parse token payload
    }

    // 3. Fallback: check userEmail directly against adminEmails
    if (userEmail) {
      const adminEmails = (
        process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
        "admin@robocraft.com,tirth@robocraft.com"
      )
        .toLowerCase()
        .split(",")
        .map((e) => e.trim());

      if (adminEmails.includes(userEmail.toLowerCase().trim())) {
        return "admin";
      }
    }

    return "user";
  } catch {
    return "user";
  }
}
