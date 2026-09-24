import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";
import { setStoredAuth, clearStoredAuth } from "./auth";

const neonAuthUrl =
  import.meta.env.VITE_NEON_AUTH_URL ||
  "https://ep-nameless-pine-b4l3jt2f.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth";

const authServiceUrl =
  import.meta.env.VITE_AUTH_SERVICE_URL || "http://localhost:3001";

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

/**
 * Verify session with the backend Auth Microservice (/me)
 */
export const fetchBackendUser = async (token?: string) => {
  try {
    let bearerToken = token;
    if (!bearerToken) {
      const { data } = await neonAuthClient.token();
      bearerToken = data?.token;
    }

    if (!bearerToken) {
      return null;
    }

    const res = await fetch(`${authServiceUrl}/me`, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    });

    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    return json.user || null;
  } catch {
    return null;
  }
};
