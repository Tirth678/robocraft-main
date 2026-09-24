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
    <div className="relative min-h-screen w-full overflow-hidden bg-black flex items-center justify-center p-6">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-black to-blue-900/40 z-10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.15),transparent_70%)] z-10" />
        <div 
          className="h-full w-full bg-cover bg-center opacity-60 scale-105 animate-pulse-slow"
          style={{ backgroundImage: `url('/auth_bg.jpg')` }} // Assuming user places the image
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-20 w-full max-w-[480px]"
      >
        <div className="overflow-hidden rounded-[40px] border border-white/10 bg-white/5 p-1 backdrop-blur-2xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)]">
          <div className="rounded-[36px] bg-gradient-to-b from-white/10 to-transparent p-8 md:p-10">
            {/* Header */}
            <div className="mb-10 flex items-center justify-between">
              <button
                onClick={() => navigate("/")}
                className="group flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
                Back
              </button>
              
              <div className="flex rounded-2xl bg-black/40 p-1 backdrop-blur-md">
                <button
                  onClick={() => setMode("login")}
                  className={`relative rounded-xl px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                    mode === "login" ? "bg-white text-black shadow-lg" : "text-white/50 hover:text-white"
                  }`}
                >
                  Login
                </button>
                <button
                  onClick={() => setMode("register")}
                  className={`relative rounded-xl px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                    mode === "register" ? "bg-purple-600 text-white shadow-lg" : "text-white/50 hover:text-white"
                  }`}
                >
                  Join
                </button>
              </div>
            </div>

            <div className="mb-8">
              <motion.h1 
                key={heading}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="font-display text-4xl font-black tracking-tight text-white mb-2"
              >
                {heading}
              </motion.h1>
              <motion.p 
                key={subHeading}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-white/50 text-sm font-medium"
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
                  <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
                    <div className="absolute top-0 right-0 p-3 text-purple-400">
                      <ShieldCheck size={24} />
                    </div>
                    <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-purple-500/20 text-purple-400">
                      <Mail size={32} />
                    </div>
                    <p className="text-sm font-medium text-white/40 mb-1">Authenticated as</p>
                    <p className="text-xl font-bold text-white tracking-tight">{auth.email}</p>
                  </div>
                  
                  <button
                    onClick={handleLogout}
                    disabled={submitting}
                    className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-red-500/10 py-4 font-display text-sm font-black text-red-400 transition-all hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                  >
                    <LogOut size={20} className="transition-transform group-hover:rotate-12" />
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
                    className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/5 py-4 font-display text-sm font-black text-white transition-all hover:bg-white/10 hover:border-white/20 active:scale-95 disabled:opacity-50"
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
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Or</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  <motion.form
                    key={mode}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    onSubmit={handleAuthSubmit}
                    className="space-y-5"
                  >
                  <div className="space-y-2">
                    <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-white/40">Email Address</label>
                    <div className="group relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-4 text-white/30 transition-colors group-focus-within:text-purple-400">
                        <Mail size={18} />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-2xl border border-white/5 bg-white/5 py-4 pl-12 pr-4 text-sm text-white outline-none transition-all placeholder:text-white/20 focus:border-purple-500/50 focus:bg-white/10 focus:ring-4 focus:ring-purple-500/10"
                        placeholder="name@company.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Security Password</label>
                      {mode === "login" && (
                        <button type="button" className="text-[10px] font-bold uppercase tracking-widest text-purple-400 hover:text-purple-300">
                          Reset?
                        </button>
                      )}
                    </div>
                    <div className="group relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-4 text-white/30 transition-colors group-focus-within:text-purple-400">
                        <LockKeyhole size={18} />
                      </div>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-2xl border border-white/5 bg-white/5 py-4 pl-12 pr-4 text-sm text-white outline-none transition-all placeholder:text-white/20 focus:border-purple-500/50 focus:bg-white/10 focus:ring-4 focus:ring-purple-500/10"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="group relative mt-4 flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-white py-4 font-display text-sm font-black text-black shadow-[0_10px_30px_-5px_rgba(255,255,255,0.3)] transition-all hover:scale-[1.02] hover:shadow-[0_15px_40px_-10px_rgba(255,255,255,0.5)] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {submitting ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
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
            
            <div className="mt-10 text-center">
              <p className="text-[10px] font-medium text-white/30 uppercase tracking-[0.2em]">
                RoboCraft Studio Security System © 2026
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default BackendPortalPage;
