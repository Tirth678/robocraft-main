import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";
import { setStoredAuth, clearStoredAuth, getStoredAuth, type StoredAuth } from "./auth";

const neonAuthUrl =
  import.meta.env.VITE_NEON_AUTH_URL ||
  "https://ep-nameless-pine-b4l3jt2f.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth";

export const neonAuthClient = createAuthClient(neonAuthUrl, {
  adapter: BetterAuthReactAdapter(),
});

export type AuthResponse = {
  success: boolean;
  error?: string;
  user?: {
    id: string;
    email: string;
    role?: string;
  };
};

/** Neon Auth exposes the identity role (`admin` | `user`) on the session user. */
const getRole = (user: unknown): string | undefined => {
  const role = (user as { role?: unknown } | null | undefined)?.role;
  return typeof role === "string" && role ? role : undefined;
};

/** Only a real JWT can authenticate against the services; reject anything else. */
const isJwt = (value: string | undefined | null): value is string =>
  typeof value === "string" && value.split(".").length === 3;

/** Neon Auth exposes a display name, not first/last-name fields. */
const getNameParts = (user: { name?: string | null }) => {
  const [firstName, ...rest] = (user.name || "").trim().split(/\s+/).filter(Boolean);
  return { firstName: firstName || undefined, lastName: rest.join(" ") || undefined };
};

/**
 * Synchronize and restore active Neon Auth session with local state
 */
export const syncNeonSession = async (): Promise<StoredAuth | null> => {
  try {
    const { data: sessionData, error } = await neonAuthClient.getSession();
    if (error) {
      // Transient failure — keep whatever local state we already have instead
      // of treating it as a logout.
      return null;
    }
    if (!sessionData?.user) {
      // The provider answered and there is no session: local state is stale.
      clearStoredAuth();
      return null;
    }

    // The session cookie is opaque; services only accept a short-lived JWT.
    // Preferred source is /token; the SDK also injects the JWT from the
    // `set-auth-jwt` header into session.token on /get-session, so that is a
    // valid fallback. Never fall back to the raw session token.
    const { data: tokenData } = await neonAuthClient.token();
    const previous = getStoredAuth();
    const sessionJwt = (sessionData as { session?: { token?: string } }).session?.token;
    const accessToken =
      tokenData?.token || sessionJwt || (isJwt(previous?.accessToken) ? previous.accessToken : "");

    const authObj: StoredAuth = {
      accessToken,
      refreshToken: "",
      email: sessionData.user.email,
      name: sessionData.user.name,
      firstName: getNameParts(sessionData.user).firstName,
      lastName: getNameParts(sessionData.user).lastName,
      role: getRole(sessionData.user) ?? previous?.role,
    };

    setStoredAuth(authObj);
    return authObj;
  } catch (err) {
    console.warn("Neon session sync warning:", err);
    return null;
  }
};

/**
 * Exchange the session for a fresh JWT. Called periodically by the app because
 * the JWT only lives ~15 minutes while the session cookie lives for days —
 * without this, every service starts rejecting requests mid-session.
 */
export const refreshAccessToken = async (): Promise<string | null> => {
  try {
    const { data: tokenData, error } = await neonAuthClient.token();
    if (error || !tokenData?.token) return null;
    const previous = getStoredAuth();
    if (previous) {
      setStoredAuth({ ...previous, accessToken: tokenData.token });
    }
    return tokenData.token;
  } catch (err) {
    console.warn("Neon token refresh warning:", err);
    return null;
  }
};

/**
 * Register a new user with Neon Auth (email and password)
 */
export const registerWithEmail = async (
  email: string,
  password: string,
  firstName?: string,
  lastName?: string
): Promise<AuthResponse> => {
  try {
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const { data, error } = await neonAuthClient.signUp.email({
      email: email.trim().toLowerCase(),
      password,
      name: fullName || email.split("@")[0],
    });

    if (error) {
      return {
        success: false,
        error: error.message || "Registration failed",
      };
    }

    // Never persist `data.token` from sign-up/sign-in: it is the opaque
    // session token, which every service rejects. Sync instead — that path
    // fetches the verifiable JWT from /token and mirrors the identity role.
    const synced = await syncNeonSession();

    return {
      success: true,
      user: data?.user
        ? { id: data.user.id, email: data.user.email, role: synced?.role ?? getRole(data.user) }
        : synced
          ? { id: synced.email, email: synced.email, role: synced.role }
          : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Registration failed",
    };
  }
};

/**
 * Login with Neon Auth (email and password)
 */
export const loginWithEmail = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  try {
    const { data, error } = await neonAuthClient.signIn.email({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      return {
        success: false,
        error: error.message || "Login failed",
      };
    }

    // Same as sign-up: exchange the session for the JWT + role via
    // syncNeonSession so admin gates and service auth see a real token.
    const synced = await syncNeonSession();

    return {
      success: true,
      user: data?.user
        ? { id: data.user.id, email: data.user.email, role: synced?.role ?? getRole(data.user) }
        : synced
          ? { id: synced.email, email: synced.email, role: synced.role }
          : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Login failed",
    };
  }
};

/**
 * Login with Google via Neon Auth
 */
export const loginWithGoogle = async (): Promise<AuthResponse> => {
  try {
    const { error } = await neonAuthClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/auth/callback`,
    });

    if (error) {
      return {
        success: false,
        error: error.message || "Google login failed",
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Google login failed",
    };
  }
};

/**
 * Handle post-OAuth redirect callback
 */
export const handleOAuthCallback = async (): Promise<AuthResponse> => {
  try {
    const synced = await syncNeonSession();
    if (synced?.email) {
      return {
        success: true,
        user: {
          id: synced.email,
          email: synced.email,
        },
      };
    }

    const { data: sessionData, error } = await neonAuthClient.getSession();

    if (error || !sessionData?.user) {
      return {
        success: false,
        error: error?.message || "No active session found after Google OAuth",
      };
    }

    const { data: tokenData } = await neonAuthClient.token();
    const accessToken = tokenData?.token || getStoredAuth()?.accessToken || "";
    const role = getRole(sessionData.user as { role?: string });

    setStoredAuth({
      accessToken,
      refreshToken: "",
      email: sessionData.user.email,
      name: sessionData.user.name,
      firstName: getNameParts(sessionData.user).firstName,
      lastName: getNameParts(sessionData.user).lastName,
      role,
    });

    return {
      success: true,
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email,
        role,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "OAuth callback error",
    };
  }
};

/**
 * Logout the current session
 */
export const logout = async (): Promise<AuthResponse> => {
  try {
    await neonAuthClient.signOut();
    clearStoredAuth();
    return {
      success: true,
    };
  } catch (error) {
    clearStoredAuth();
    return {
      success: false,
      error: error instanceof Error ? error.message : "Logout failed",
    };
  }
};

