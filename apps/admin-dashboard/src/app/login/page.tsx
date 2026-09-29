'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ShieldAlert, Lock, Mail, ArrowRight, KeyRound } from 'lucide-react';
import { neonAuthClient, setStoredAdminAuth, fetchAdminRole } from '@/lib/neonAuth';
import { useAdminAuth } from '@/components/AuthProvider';

export default function AdminLoginPage() {
  const router = useRouter();
  const { refreshSession } = useAdminAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setErrorMessage('Please provide both email and password.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      console.log('[LOGIN] Attempting sign in for:', cleanEmail);
      
      // Sign in only - no registration allowed
      const authResult = await neonAuthClient.signIn.email({
        email: cleanEmail,
        password,
      });

      if (authResult.error || !authResult.data) {
        const errorMsg = authResult.error?.message || 'Invalid credentials';
        console.error('[LOGIN] Sign in failed:', errorMsg);
        
        // Provide user-friendly error messages based on common auth errors
        if (errorMsg.includes('Invalid password') || errorMsg.includes('credentials')) {
          setErrorMessage('Invalid email or password. Please check your credentials and try again.');
        } else if (errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
          setErrorMessage('No account found with this email address. Contact your administrator.');
        } else if (errorMsg.includes('locked') || errorMsg.includes('suspended')) {
          setErrorMessage('This account has been locked. Contact your administrator.');
        } else {
          setErrorMessage(errorMsg);
        }
        setSubmitting(false);
        return;
      }

      console.log('[LOGIN] Sign in successful');
      const userEmail = authResult.data?.user?.email || cleanEmail;

      // Exchange session for JWT
      console.log('[LOGIN] Fetching access token...');
      const { data: tokenData, error: tokenError } = await neonAuthClient.token();
      
      if (tokenError) {
        console.error('[LOGIN] Token fetch error:', tokenError);
        setErrorMessage('Failed to obtain access token: ' + (tokenError.message || 'Unknown error'));
        setSubmitting(false);
        return;
      }
      
      const jwt = tokenData?.token;

      if (!jwt || !jwt.includes('.')) {
        console.error('[LOGIN] Invalid token format received');
        setErrorMessage('Failed to obtain valid access token. Please try signing in again.');
        setSubmitting(false);
        return;
      }

      console.log('[LOGIN] Access token obtained, verifying admin role...');
      
      // Verify the JWT role before granting access
      let userRole: string;
      try {
        userRole = await fetchAdminRole(jwt, userEmail);
        console.log('[LOGIN] Role verification result:', userRole);
      } catch (err) {
        console.error('[LOGIN] Role verification error:', err);
        if (err instanceof Error && err.message.includes('invalid or expired')) {
          setErrorMessage('Your authentication token is invalid or has expired. Please try again.');
        } else {
          setErrorMessage('Failed to verify admin access: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
        setSubmitting(false);
        return;
      }

      if (userRole !== 'admin' && userRole !== 'superadmin') {
        console.warn('[LOGIN] Access denied - user role:', userRole);
        setErrorMessage(
          'Access Denied: Your account is not authorized for administrator access. ' +
          'Please contact your system administrator if you believe this is an error.'
        );
        setSubmitting(false);
        return;
      }

      console.log('[LOGIN] Admin access granted, storing credentials...');
      setStoredAdminAuth({
        accessToken: jwt,
        email: userEmail,
      });

      console.log('[LOGIN] Refreshing session...');
      await refreshSession();
      
      console.log('[LOGIN] Login complete, redirecting to dashboard...');
      router.push('/');
    } catch (err: unknown) {
      console.error('[LOGIN] Unexpected error during login:', err);
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
      
      // Provide context-aware error messages
      if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
        setErrorMessage('Network error: Unable to connect to authentication service. Please check your connection.');
      } else if (errorMsg.includes('timeout')) {
        setErrorMessage('Request timeout: The authentication service is not responding. Please try again.');
      } else {
        setErrorMessage('Authentication error: ' + errorMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08080c] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 mb-4">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">RoboCraft Admin Portal</h1>
          <p className="text-sm text-slate-400 mt-1">
            Sign in with your administrator credentials
          </p>
        </div>

        {/* Card Container */}
        <div className="bg-[#12121a] border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-500/30 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-200 leading-relaxed">{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Admin Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.currentTarget.value)}
                  placeholder="admin@robocraft.com"
                  className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.currentTarget.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#1a1a24] border border-slate-700/60 focus:border-indigo-500 text-white pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.99]"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  Sign In to Control Panel
                  <ArrowRight className="w-4 h-4 ml-auto" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-end text-xs">
            <span className="text-[10px] text-slate-500 font-mono">
              Neon Auth
            </span>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Contact the system administrator if you need to be added to the allow-list.
        </p>
      </div>
    </div>
  );
}
