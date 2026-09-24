import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft,
  LogOut,
  Mail,
  User,
  LockKeyhole,
  UserPlus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { registerWithEmail, loginWithEmail, loginWithGoogle, handleOAuthCallback } from "@/lib/neonAuth";
import { getSafeErrorMessage } from "@/lib/apiErrors";

interface SimpleAuthPageProps {
  initialMode?: "signup" | "login";
}

const SimpleAuthPage = ({ initialMode = "signup" }: SimpleAuthPageProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [mode, setMode] = useState<"signup" | "login">(initialMode);

  // Form states
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (location.pathname === "/auth/callback") {
      setSubmitting(true);
      handleOAuthCallback()
        .then((res) => {
          if (res.success) {
            toast.success("Signed in with Google successfully!");
            navigate("/");
          } else {
            toast.error(res.error || "Google authentication failed.");
            navigate("/login");
          }
        })
        .catch((err) => {
          toast.error("Google authentication failed.");
          navigate("/login");
        })
        .finally(() => {
          setSubmitting(false);
        });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    document.title =
      mode === "signup"
        ? "Create Your Account - RoboCraft Studio"
        : "Log In - RoboCraft Studio";
  }, [mode]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Signed-in state
  if (isAuthenticated && user) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-card"
        >
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-foreground">
              <User size={32} />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
              RoboCraft Studio
            </p>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Welcome, {user.firstName || user.email.split("@")[0]}!
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              You are signed in and ready to build.
            </p>
          </div>

          <div className="mb-6 space-y-3 rounded-xl border border-border bg-secondary/50 p-5">
            <div className="flex items-center gap-3">
              <Mail size={18} className="text-brand" />
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Email</p>
                <p className="text-sm font-semibold text-foreground">{user.email}</p>
              </div>
            </div>

            {(user.firstName || user.lastName) && (
              <div className="flex items-center gap-3">
                <User size={18} className="text-brand" />
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Full Name</p>
                  <p className="text-sm font-semibold text-foreground">
                    {user.firstName} {user.lastName}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <ShieldCheck size={18} className="text-brand" />
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Account Role</p>
                <p className="text-sm font-semibold capitalize text-foreground">{user.role}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigate("/")}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90"
            >
              <ArrowLeft size={16} />
              Continue to Studio Home
            </button>
            <button
              onClick={logout}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold text-foreground transition-all hover:bg-secondary"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Handle Form Submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      toast.error("Email and password are required.");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "signup") {
        const result = await registerWithEmail(email, password, firstName, lastName);
        if (!result.success) {
          toast.error(
            getSafeErrorMessage(
              new Error(result.error || ""),
              "We couldn't create your account. Please try again."
            )
          );
          return;
        }
        toast.success("Account created successfully!");
      } else {
        const result = await loginWithEmail(email, password);
        if (!result.success) {
          toast.error(
            getSafeErrorMessage(
              new Error(result.error || ""),
              "We couldn't sign you in. Please check your credentials."
            )
          );
          return;
        }
        toast.success("Welcome back! Authentication successful.");
      }

      navigate("/");
    } catch (error) {
      console.error("Auth submit error:", error);
      toast.error(
        getSafeErrorMessage(error, "Authentication request failed. Please try again.")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setSubmitting(true);
    try {
      const result = await loginWithGoogle();
      if (!result.success) {
        toast.error(
          getSafeErrorMessage(
            new Error(result.error || ""),
            "We couldn't sign you in with Google. Please try again."
          )
        );
      }
    } catch (error) {
      console.error("Google login failed:", error);
      toast.error(
        getSafeErrorMessage(error, "We couldn't sign you in with Google. Please try again.")
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-[480px]"
      >
        <div className="rounded-3xl border border-border bg-card p-8 shadow-card">
          {/* Header Navigation */}
          <div className="mb-8 flex items-center justify-between">
            <button
              onClick={() => navigate("/")}
              className="group flex items-center gap-2 rounded-xl bg-secondary px-3.5 py-1.5 text-xs font-bold text-foreground transition-all hover:bg-secondary/80"
            >
              <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
              Home
            </button>

            {/* Mode Switch Tabs */}
            <div className="flex rounded-xl bg-secondary p-1 border border-border">
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`rounded-lg px-4 py-1 text-xs font-bold transition-all ${
                  mode === "signup"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`rounded-lg px-4 py-1 text-xs font-bold transition-all ${
                  mode === "login"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Log In
              </button>
            </div>
          </div>

          {/* Title Section */}
          <div className="mb-6">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-[11px] font-bold text-muted-foreground mb-3 border border-border">
              <Sparkles size={12} className="text-brand" />
              RoboCraft Studio Access
            </div>
            <motion.h1
              key={mode}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="font-display text-3xl font-black tracking-tight text-foreground mb-2"
            >
              {mode === "signup" ? "Create an Account" : "Welcome Back"}
            </motion.h1>
            <p className="text-muted-foreground text-sm font-medium">
              {mode === "signup"
                ? "Sign up to build your custom desk companion and track orders."
                : "Sign in with your email or Google account to access your studio."}
            </p>
          </div>

          <div className="space-y-4">
            {/* Option 1: Google OAuth */}
            <button
              onClick={handleGoogleAuth}
              disabled={submitting}
              type="button"
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background py-3 font-display text-sm font-bold text-foreground transition-all hover:bg-secondary active:scale-95 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" className="fill-current">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {mode === "signup" ? "Sign up with Google" : "Log in with Google"}
            </button>

            {/* Divider */}
            <div className="relative flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Or with Email</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Option 2: Email & Password Form */}
            <AnimatePresence mode="wait">
              <motion.form
                key={mode}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                {/* First Name & Last Name (on Sign Up mode) */}
                {mode === "signup" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        First Name
                      </label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full rounded-xl border border-border bg-background py-2.5 px-3.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="Alex"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Last Name
                      </label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full rounded-xl border border-border bg-background py-2.5 px-3.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="Rider"
                      />
                    </div>
                  </div>
                )}

                {/* Email Address */}
                <div className="space-y-1">
                  <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Email Address
                  </label>
                  <div className="group relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground transition-colors group-focus-within:text-foreground">
                      <Mail size={16} />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="alex@example.com"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Password
                  </label>
                  <div className="group relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground transition-colors group-focus-within:text-foreground">
                      <LockKeyhole size={16} />
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-display text-sm font-bold text-primary-foreground shadow-card transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
                >
                  {submitting ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  ) : (
                    <>
                      {mode === "signup" ? <UserPlus size={18} /> : <LockKeyhole size={18} />}
                      {mode === "signup" ? "Create Studio Account" : "Sign In to Account"}
                    </>
                  )}
                </button>
              </motion.form>
            </AnimatePresence>

            {/* Mode Toggle Link */}
            <div className="mt-6 text-center">
              <p className="text-xs text-muted-foreground">
                {mode === "signup" ? (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      className="font-bold text-foreground hover:underline"
                    >
                      Log In here
                    </button>
                  </>
                ) : (
                  <>
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("signup")}
                      className="font-bold text-foreground hover:underline"
                    >
                      Sign Up here
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="mt-8 text-center border-t border-border pt-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
              RoboCraft Studio © 2026
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SimpleAuthPage;
