import { verifyNeonAccessToken } from './auth';

export interface NeonAuthSession {
  user?: { id?: string; email?: string; name?: string };
}

export interface NeonAuthClient {
  getSession: () => Promise<{ data: NeonAuthSession | null; error?: { message?: string } }>;
  token: () => Promise<{ data: { token?: string } | null; error?: { message?: string } }>;
  signUp: {
    email: (input: { email: string; password: string; name?: string }) => Promise<{
      data?: { token?: string; user?: { id: string; email: string; name?: string } };
      error?: { message?: string };
    }>;
  };
  signIn: (
    input: { email: string; password: string } | { provider: string; callbackURL?: string }
  ) => Promise<{
    data?: { token?: string; user?: { id: string; email: string; name?: string } };
    error?: { message?: string };
  }>;
  signOut: () => Promise<void>;
}

// Minimal Neon Auth client for the auth-service. This service only needs the
// session/token sync and signOut operations, so we implement a slim subset
// rather than pulling in a mismatched version of @neondatabase/auth.
const neonAuthUrl =
  process.env.VITE_NEON_AUTH_URL ||
  'https://ep-nameless-pine-b4l3jt2f.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth';

export const neonAuthClient: NeonAuthClient = {
  async getSession() {
    try {
      const res = await fetch(`${neonAuthUrl}/session`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return { data: null, error: { message: `HTTP ${res.status}` } };
      return { data: (await res.json()) as NeonAuthSession };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  },

  async token() {
    try {
      const res = await fetch(`${neonAuthUrl}/token`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return { data: null, error: { message: `HTTP ${res.status}` } };
      return { data: (await res.json()) as { token?: string } };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  },

  async signUp({ email, password, name }: { email: string; password: string; name?: string }) {
    // Sign-up is not handled by the auth-service; delegate to Neon Auth directly.
    return {
      data: undefined,
      error: { message: 'Sign-up is handled by Neon Auth directly' },
    };
  },

  async signIn(input: { email: string; password: string } | { provider: string; callbackURL?: string }) {
    if ('email' in input) {
      try {
        const res = await fetch(`${neonAuthUrl}/signIn/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: input.email, password: input.password }),
        });
        if (!res.ok) {
          return { data: undefined, error: { message: `HTTP ${res.status}` } };
        }
        return {
          data: (await res.json()) as { token?: string; user?: { id: string; email: string; name?: string } },
        };
      } catch (err) {
        return { data: undefined, error: { message: err instanceof Error ? err.message : String(err) } };
      }
    }

    try {
      const res = await fetch(`${neonAuthUrl}/signIn/social`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: input.provider, callbackURL: input.callbackURL }),
      });
      if (!res.ok) {
        return { error: { message: `HTTP ${res.status}` } };
      }
      return { error: undefined };
    } catch (err) {
      return { error: { message: err instanceof Error ? err.message : String(err) } };
    }
  },

  async signOut() {
    try {
      const res = await fetch(`${neonAuthUrl}/signOut`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  },
};
