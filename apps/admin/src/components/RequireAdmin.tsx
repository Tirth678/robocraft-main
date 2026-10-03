import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

/**
 * Renders admin screens only for a live admin-service session.
 *
 * This is a UX gate, not the security boundary — every admin endpoint in
 * admin-service independently rejects requests without a valid admin session
 * cookie. Losing the cookie simply drops the UI back to the sign-in screen.
 */
const RequireAdmin = ({ children }: { children: ReactNode }) => {
  const { admin, loading } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

export default RequireAdmin;