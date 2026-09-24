import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SignIn, SignUp, UserProfile } from "@clerk/clerk-react";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Calendar, LogOut, Mail, User, ShieldCheck } from "lucide-react";

const SimpleAuthPage = () => {
  useEffect(() => {
    document.title = "Access RoboCraft Studio - Login or Sign Up | RoboCraft Studio";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "Log in or register for an account at RoboCraft Studio. Access your order history, manage tracking, or enter the administrative portal."
      );
    }
  }, []);

  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, logout, loginAsGuest, hasClerkKey } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showProfile, setShowProfile] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestName, setGuestName] = useState("");

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-12">
          {showProfile && hasClerkKey ? (
            <div className="w-full max-w-3xl">
              <button
                type="button"
                onClick={() => setShowProfile(false)}
                className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <UserProfile routing="virtual" />
            </div>
          ) : (
            <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-card">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-secondary">
                  <User className="h-7 w-7 text-foreground" />
                </div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-brand">
                  RoboCraft Studio
                </p>
                <h1 className="text-3xl font-black tracking-tight text-foreground">Welcome back</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  You are signed in and ready to continue.
                </p>
              </div>

              <div className="mb-8 space-y-4 rounded-lg border border-border bg-secondary/60 p-6">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-brand" />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Email</p>
                    <p className="font-semibold text-foreground">{user.email}</p>
                  </div>
                </div>

                {(user.firstName || user.lastName) && (
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-brand" />
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Name</p>
                      <p className="font-semibold text-foreground">
                        {user.firstName} {user.lastName}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-brand" />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Role</p>
                    <p className="font-semibold capitalize text-foreground">{user.role}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => navigate("/")}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Home
                </button>
                {hasClerkKey && (
                  <button
                    onClick={() => setShowProfile(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 font-bold text-foreground transition-colors hover:bg-secondary"
                  >
                    <User className="h-5 w-5" />
                    Manage Account
                  </button>
                )}
                <button
                  onClick={logout}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 font-bold text-foreground transition-colors hover:bg-secondary"
                >
                  <LogOut className="h-5 w-5" />
                  Sign Out
                </button>
              </div>

              <div className="mt-6 text-center text-sm text-muted-foreground">
                <p>RoboCraft Studio © 2026</p>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  const handleGuestSubmit = (e: React.FormEvent, role = "user") => {
    e.preventDefault();
    loginAsGuest(
      guestEmail || (role === "admin" ? "admin@robocraft.studio" : "user@robocraft.studio"),
      guestName || (role === "admin" ? "Admin User" : "Studio Explorer"),
      role
    );
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-6 py-12 lg:grid-cols-[1fr_440px]">
        <section className="hidden lg:block">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mb-12 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </button>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-brand">
            RoboCraft Studio
          </p>
          <h1 className="max-w-2xl font-display text-5xl font-black leading-none tracking-tight text-foreground">
            Continue your tiny desk companion journey.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            Sign in to manage orders, track RoboCraft kits, and keep your studio details in one place.
          </p>
        </section>

        <div className="w-full">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </button>

          {hasClerkKey ? (
            <>
              <div className="mb-6 grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary/60 p-1">
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className={`rounded-md px-4 py-2 text-sm font-bold transition-colors ${
                    mode === "login"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className={`rounded-md px-4 py-2 text-sm font-bold transition-colors ${
                    mode === "register"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Register
                </button>
              </div>

              <div className="flex justify-center">
                {mode === "login" ? (
                  <SignIn routing="virtual" signUpUrl="/auth" forceRedirectUrl="/" />
                ) : (
                  <SignUp routing="virtual" signInUrl="/auth" forceRedirectUrl="/" />
                )}
              </div>
            </>
          ) : (
            <div className="w-full rounded-lg border border-border bg-card p-8 shadow-card">
              <div className="mb-6 text-center">
                <h2 className="text-2xl font-black tracking-tight text-foreground">Frontend Guest Access</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sign in directly to explore frontend features and dashboard capabilities.
                </p>
              </div>

              <form onSubmit={(e) => handleGuestSubmit(e, "user")} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    placeholder="RoboCraft Explorer"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="user@robocraft.studio"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <User className="h-4 w-4" />
                  Continue as Guest User
                </button>
                <button
                  type="button"
                  onClick={(e) => handleGuestSubmit(e, "admin")}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-3 font-bold text-foreground transition-colors hover:bg-secondary/80"
                >
                  <ShieldCheck className="h-4 w-4 text-brand" />
                  Continue as Admin User
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SimpleAuthPage;
