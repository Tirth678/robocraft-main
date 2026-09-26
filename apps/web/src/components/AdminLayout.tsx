import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ArrowLeft,
  Shield,
  LogOut,
  ShoppingBag,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Admin navigation matches the allowed admin links; the auth surface is
// Neon Auth only (no hardcoded backend users).
const adminLinks = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Pre-Orders", href: "/admin/pre-orders", icon: ShoppingBag },
  { label: "Inventory", href: "/admin/inventory", icon: Warehouse },
];

interface AdminLayoutProps {
  children: ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    toast.success("Logged out");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#0a0a0a] border-r border-white/5 flex flex-col z-50">
        {/* Logo */}
        <div className="p-6 border-b border-white/5">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 group"
          >
            <div className="h-10 w-10 rounded-xl bg-purple-600 flex items-center justify-center text-white font-black text-lg shadow-[0_0_20px_rgba(147,51,234,0.3)]">
              R
            </div>
            <div>
              <h2 className="font-black text-sm tracking-tight text-white">
                ROBOCRAFT
              </h2>
              <p className="text-[10px] font-bold text-purple-400 uppercase tracking-[0.2em]">
                Admin Panel
              </p>
            </div>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {adminLinks.map((link) => {
            const isActive = location.pathname === link.href;
            return (
              <button
                key={link.href}
                onClick={() => navigate(link.href)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                  isActive
                    ? "bg-purple-600/20 text-purple-400 border border-purple-500/20"
                    : "text-white/40 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                <link.icon size={18} />
                {link.label.toUpperCase()}
              </button>
            );
          })}
        </nav>

        {/* User Info & Actions */}
        <div className="p-4 border-t border-white/5 space-y-2">
          <div className="px-4 py-3 rounded-xl bg-white/5">
            <div className="flex items-center gap-2 mb-1">
              <Shield size={14} className="text-purple-400" />
              <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">
                Admin
              </span>
            </div>
            <p className="text-xs font-bold text-white/60 truncate">
              {user?.email}
            </p>
          </div>

          <button
            onClick={() => navigate("/")}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-white/30 hover:text-white hover:bg-white/5 transition-all"
          >
            <ArrowLeft size={16} />
            Back to Store
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64">
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;
