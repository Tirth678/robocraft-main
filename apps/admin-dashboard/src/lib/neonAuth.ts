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

export interface AdminRoleResult {
  role: "admin" | "superadmin" | "user";
  statusCode?: number;
  error?: string;
}

/**
 * Verify admin role by probing the inventory service with the JWT.
 *
 * Neon Auth JWTs always carry `role: "authenticated"` for every signed-in
 * user — they do NOT embed the application-level "admin" value. The real gate
 * is the `inventory_admins` allow-list checked server-side by the inventory
 * service.
 *
 * Status codes:
 * - 200: Valid admin access
 * - 401: Invalid or expired token
 * - 403: Valid token but not authorized as admin
 * - 500+: Server error
 * - Network error: Falls back to token payload check
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
    if (!token || !token.includes(".")) {
      console.warn("[AUTH] No valid JWT token available");
      return "user";
    }

    // 1. Probe the inventory service with the JWT
    try {
      const res = await fetch(
        `${INVENTORY_SERVICE_URL}/admin/inventory/items?limit=1`,
        { 
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000) // 5 second timeout
        }
      );
      
      console.log(`[AUTH] Inventory service probe status: ${res.status}`);
      
      if (res.status === 200) {
        console.log("[AUTH] Admin access verified via inventory service");
        return "admin";
      }
      
      if (res.status === 401) {
        console.warn("[AUTH] Token rejected by inventory service (401)");
        throw new Error("Authentication token is invalid or expired");
      }
      
      if (res.status === 403) {
        console.warn("[AUTH] Access forbidden by inventory service (403) - not in admin list");
        // Continue to fallback checks
      }
      
      if (res.status >= 500) {
        console.error(`[AUTH] Inventory service error (${res.status})`);
        // Continue to fallback checks
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("invalid or expired")) {
        throw err; // Re-throw auth errors
      }
      console.warn("[AUTH] Inventory service unreachable, using fallback validation:", err);
      // Network error or timeout - fall through to token payload check
    }

    // 2. Decode the JWT payload to check role and email
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        console.log("[AUTH] JWT payload decoded:", { 
          role: payload.role, 
          email: payload.email,
          sub: payload.sub 
        });
        
        if (payload.role === "admin" || payload.role === "superadmin") {
          console.log(`[AUTH] Admin access granted via JWT role: ${payload.role}`);
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
          console.log(`[AUTH] Admin access granted via email whitelist: ${email}`);
          return "admin";
        }
        
        console.warn(`[AUTH] Email ${email} not in whitelist:`, adminEmails);
      }
    } catch (err) {
      console.error("[AUTH] Failed to parse JWT payload:", err);
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
        console.log(`[AUTH] Admin access granted via direct email check: ${userEmail}`);
        return "admin";
      }
    }

    console.warn("[AUTH] No admin authorization found, returning 'user' role");
    return "user";
  } catch (err) {
    console.error("[AUTH] Error in fetchAdminRole:", err);
    if (err instanceof Error && err.message.includes("invalid or expired")) {
      throw err; // Re-throw auth errors to be caught by login handler
    }
    return "user";
  }
}
