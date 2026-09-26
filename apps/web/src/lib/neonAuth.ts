import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";
import { setStoredAuth, clearStoredAuth, type StoredAuth } from "./auth";

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
  };
};

/**
 * Synchronize and restore active Neon Auth session with local state
 */
export const syncNeonSession = async (): Promise<StoredAuth | null> => {
  try {
    const { data: sessionData } = await neonAuthClient.getSession();
    if (!sessionData?.user) {
      return null;
    }

    const { data: tokenData } = await neonAuthClient.token();
    const accessToken = tokenData?.token || "neon_auth_session";

    const authObj: StoredAuth = {
      accessToken,
      refreshToken: "",
      email: sessionData.user.email,
    };

    setStoredAuth(authObj);
    return authObj;
  } catch (err) {
    console.warn("Neon session sync warning:", err);
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

    if (data?.token && data?.user) {
      setStoredAuth({
        accessToken: data.token,
        refreshToken: "",
        email: data.user.email || email,
      });
    } else {
      await syncNeonSession();
    }

    return {
      success: true,
      user: data?.user ? { id: data.user.id, email: data.user.email } : undefined,
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

    if (data?.token && data?.user) {
      setStoredAuth({
        accessToken: data.token,
        refreshToken: "",
        email: data.user.email || email,
      });
    } else {
      await syncNeonSession();
    }

    return {
      success: true,
      user: data?.user ? { id: data.user.id, email: data.user.email } : undefined,
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
    const accessToken = tokenData?.token || "neon_auth_oauth_session";

    setStoredAuth({
      accessToken,
      refreshToken: "",
      email: sessionData.user.email,
    });

    return {
      success: true,
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email,
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


