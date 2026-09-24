import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Gates admin screens on the role returned by the backend `/auth/me` sync,
 * not on client-side Clerk metadata. The API enforces the same role again.
 */
const RequireAdmin = ({ children }: { children: ReactNode }) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-8">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <ShieldAlert className="mx-auto mb-4 text-red-400" size={40} />
          <h1 className="text-xl font-black">Admin access required</h1>
          <p className="mt-2 text-sm text-white/50">
            {isAuthenticated
              ? "Your account doesn't have the admin role."
              : "Sign in with an admin account to manage inventory."}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              to={isAuthenticated ? "/" : "/auth"}
              className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold hover:bg-purple-500 transition-all"
            >
              {isAuthenticated ? "Back to store" : "Go to sign in"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireAdmin;
