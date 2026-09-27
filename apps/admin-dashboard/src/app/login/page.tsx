'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ShieldAlert, Lock, Mail, ArrowRight, KeyRound, UserPlus } from 'lucide-react';
import { neonAuthClient, setStoredAdminAuth, fetchAdminRole } from '@/lib/neonAuth';
import { useAdminAuth } from '@/components/AuthProvider';

export default function AdminLoginPage() {
  const router = useRouter();
  const { refreshSession } = useAdminAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
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
      let userEmail = cleanEmail;

      if (mode === 'signup') {
        // Enforce authorized admin emails on registration
        const adminEmails = (
          process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
          'admin@robocraft.com,tirth@robocraft.com'
        )
          .toLowerCase()
          .split(',')
          .map((item) => item.trim());

        if (!adminEmails.includes(cleanEmail)) {
          setErrorMessage('Access Denied: This email address is not authorized for administrator access.');
          setSubmitting(false);
          return;
        }

        const signUpResult = await neonAuthClient.signUp.email({
          email: cleanEmail,
          password,
          name: 'RoboCraft Admin',
        });

        if (signUpResult.error) {
          setErrorMessage(signUpResult.error.message || 'Failed to create administrator account.');
          setSubmitting(false);
          return;
        }

        userEmail = signUpResult.data?.user?.email || cleanEmail;
      } else {
        const authResult = await neonAuthClient.signIn.email({
          email: cleanEmail,
          password,
        });

        if (authResult.error || !authResult.data) {
          setErrorMessage(
            authResult.error?.message || 'Invalid credentials. Please verify your email and password.'
          );
          setSubmitting(false);
          return;
        }

        userEmail = authResult.data?.user?.email || cleanEmail;
      }

      // Exchange session for JWT
      const { data: tokenData } = await neonAuthClient.token();
      const jwt = tokenData?.token;

      if (!jwt || !jwt.includes('.')) {
        setErrorMessage('Failed to obtain access token. Please try again.');
        setSubmitting(false);
        return;
      }

      // Verify the JWT role before granting access
      const userRole = await fetchAdminRole(jwt, userEmail);

      if (userRole !== 'admin' && userRole !== 'superadmin') {
        setErrorMessage('Access Denied: This account is not authorized for administrator access.');
        setSubmitting(false);
        return;
      }

      setStoredAdminAuth({
        accessToken: jwt,
        email: userEmail,
      });

      await refreshSession();
      router.push('/');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'An error occurred during authentication.');
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
            {mode === 'signin' ? 'Sign in with your administrator credentials' : 'Register your administrator credentials'}
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
              ) : mode === 'signin' ? (
                <>
                  <KeyRound className="w-4 h-4" />
                  Sign In to Control Panel
                  <ArrowRight className="w-4 h-4 ml-auto" />
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Register Administrator
                  <ArrowRight className="w-4 h-4 ml-auto" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setErrorMessage(null);
              }}
              className="text-indigo-400 hover:text-indigo-300 hover:underline font-semibold"
            >
              {mode === 'signin' ? 'Need to register an admin account?' : 'Already have an admin account? Sign In'}
            </button>
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
