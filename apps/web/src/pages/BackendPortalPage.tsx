import { useMemo, useState } from "react";
import { ArrowLeft, LockKeyhole, LogOut, UserPlus, Mail, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { clearStoredAuth } from "@/lib/auth";
import { getSafeErrorMessage } from "@/lib/apiErrors";
import { useAuthState } from "@/hooks/useAuthState";
import { loginWithEmail, registerWithEmail, logout, loginWithGoogle } from "@/lib/neonAuth";

const BackendPortalPage = () => {
  const navigate = useNavigate();
  const auth = useAuthState();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const heading = useMemo(
    () => (mode === "login" ? "Welcome Back" : "Start Your Journey"),
    [mode],
  );

  const subHeading = useMemo(
    () => (mode === "login" ? "Access your RoboCraft Studio dashboard." : "Create an account to start building your robots."),
    [mode],
  );

  const handleAuthSubmit = async (event: React.FormEvent) => {
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
      const result = mode === "login" 
        ? await loginWithEmail(email, password)
        : await registerWithEmail(email, password);

      if (!result.success) {
        toast.error(getSafeErrorMessage(new Error(result.error || ""), `We couldn't ${mode === "login" ? "sign you in" : "create your account"}. Please try again.`));
        return;
      }

      setPassword("");
      toast.success(mode === "login" ? "Authentication successful." : "Account created successfully.");
      navigate("/");
    } catch (error) {
      console.error("Portal auth failed:", error);
      toast.error(getSafeErrorMessage(error, `We couldn't ${mode === "login" ? "sign you in" : "create your account"}. Please try again.`));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSubmitting(true);
    try {
      const result = await loginWithGoogle();
      if (!result.success) {
        toast.error(getSafeErrorMessage(new Error(result.error || ""), "We couldn't sign you in with Google. Please try again."));
      }
    } catch (error) {
      console.error("Google portal login failed:", error);
      toast.error(getSafeErrorMessage(error, "We couldn't sign you in with Google. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (!auth) {
      clearStoredAuth();
      return;
    }

    setSubmitting(true);

    try {
      const result = await logout();

      if (!result.success) {
        toast.error(getSafeErrorMessage(new Error(result.error || ""), "We couldn't log you out. Please try again."));
      } else {
        toast.success("Logged out successfully.");
      }
      
      navigate("/");
    } catch (error) {
      console.error("Portal logout failed:", error);
      toast.error(getSafeErrorMessage(error, "We couldn't log you out. Please try again."));
      clearStoredAuth();
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
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <button
              onClick={() => navigate("/")}
              className="group flex items-center gap-2 rounded-xl bg-secondary px-3.5 py-1.5 text-xs font-bold text-foreground transition-all hover:bg-secondary/80"
            >
              <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
              Back
            </button>
            
            <div className="flex rounded-xl bg-secondary p-1 border border-border">
              <button
                onClick={() => setMode("login")}
                className={`rounded-lg px-4 py-1 text-xs font-bold uppercase tracking-wider transition-all ${
                  mode === "login" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Login
              </button>
              <button
                onClick={() => setMode("register")}
                className={`rounded-lg px-4 py-1 text-xs font-bold uppercase tracking-wider transition-all ${
                  mode === "register" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Join
              </button>
            </div>
          </div>

          <div className="mb-6">
            <motion.h1 
              key={heading}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="font-display text-3xl font-black tracking-tight text-foreground mb-2"
            >
              {heading}
            </motion.h1>
            <motion.p 
              key={subHeading}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-muted-foreground text-sm font-medium"
            >
              {subHeading}
            </motion.p>
          </div>

          <AnimatePresence mode="wait">
            {auth ? (
              <motion.div
                key="signed-in"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-6"
              >
                <div className="relative overflow-hidden rounded-2xl border border-border bg-secondary/50 p-6 text-center">
                  <div className="absolute top-0 right-0 p-3 text-brand">
                    <ShieldCheck size={20} />
                  </div>
                  <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-foreground">
                    <Mail size={24} />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Authenticated as</p>
                  <p className="text-lg font-bold text-foreground tracking-tight">{auth.email}</p>
                </div>
                
                <button
                  onClick={handleLogout}
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 font-display text-sm font-bold text-foreground transition-all hover:bg-secondary disabled:opacity-50"
                >
                  <LogOut size={18} />
                  {submitting ? "Processing..." : "Sign Out From Session"}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="form-container"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Google Login Button */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={submitting}
                  type="button"
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background py-3 font-display text-sm font-bold text-foreground transition-all hover:bg-secondary active:scale-95 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" className="fill-current">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {submitting ? "Connecting..." : "Continue with Google"}
                </button>

                <div className="relative flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <motion.form
                  key={mode}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  onSubmit={handleAuthSubmit}
                  className="space-y-4"
                >
                <div className="space-y-1">
                  <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Email Address</label>
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
                      placeholder="name@company.com"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Security Password</label>
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

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-display text-sm font-bold text-primary-foreground shadow-card transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
                >
                  {submitting ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  ) : (
                    <>
                      {mode === "login" ? <LockKeyhole size={18} /> : <UserPlus size={18} />}
                      {mode === "login" ? "Access Studio" : "Create Account"}
                    </>
                  )}
                </button>
                </motion.form>
              </motion.div>
            )}
          </AnimatePresence>
          
          <div className="mt-8 text-center border-t border-border pt-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
              RoboCraft Studio Security System © 2026
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default BackendPortalPage;
