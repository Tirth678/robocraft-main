import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ArrowLeft,
  Shield,
  LogOut,
  ShoppingBag,
  TrendingUp,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AdminAuthContext";
import { toast } from "sonner";

// Admin navigation matches the allowed admin links. Authentication is the
// admin-service cookie session; no hardcoded backend users.
const adminLinks = [
  // The dashboard route is `/` (see App.tsx); `/admin` only redirects here.
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Pre-Orders", href: "/admin/pre-orders", icon: ShoppingBag },
  { label: "Inventory", href: "/admin/inventory", icon: Warehouse },
  { label: "Sales", href: "/admin/sales", icon: TrendingUp },
];

interface AdminLayoutProps {
  children: ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  // The sidebar is a drawer below `md`; on wider screens it is always docked.
  const [navOpen, setNavOpen] = useState(false);

  // Close the drawer whenever the route changes, so a tap-through on mobile
  // does not leave the overlay covering the page it just opened.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    toast.success("Logged out");
    navigate("/");
  };

  return (
    // Padding (not margin) reserves the docked sidebar: `w-full` + `ml-64`
    // would be 100% *plus* 256px and force the whole page to scroll sideways.
    <div className="min-h-screen bg-background text-foreground md:pl-64">
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-white/10 bg-[#0a0a0a] px-4 md:hidden">
        <button
          type="button"
          onClick={() => setNavOpen((open) => !open)}
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={navOpen}
          className="rounded-lg p-2 text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        >
          {navOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <span className="font-black text-sm tracking-tight text-white">ROBOCRAFT</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-purple-400">
          Admin
        </span>
      </header>

      {/* Drawer backdrop (mobile only) */}
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-50 flex w-64 flex-col overflow-y-auto border-r border-white/5 bg-[#0a0a0a] transition-transform duration-200 ease-out md:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="flex items-start justify-between border-b border-white/5 p-6">
          <button onClick={() => navigate("/")} className="flex items-center gap-3 text-left">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-lg font-black text-white shadow-[0_0_20px_rgba(147,51,234,0.3)]">
              R
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight text-white">ROBOCRAFT</h2>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-purple-400">
                Admin Panel
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
            className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {adminLinks.map((link) => {
            const isActive = location.pathname === link.href;
            return (
              <button
                key={link.href}
                onClick={() => navigate(link.href)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                  isActive
                    ? "border border-purple-500/20 bg-purple-600/20 text-purple-400"
                    : "border border-transparent text-white/40 hover:bg-white/5 hover:text-white"
                }`}
              >
                <link.icon size={18} />
                <span className="truncate">{link.label.toUpperCase()}</span>
              </button>
            );
          })}
        </nav>

        {/* User Info & Actions */}
        <div className="space-y-2 border-t border-white/5 p-4">
          <div className="rounded-xl bg-white/5 px-4 py-3">
            <div className="mb-1 flex items-center gap-2">
              <Shield size={14} className="text-purple-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                Admin
              </span>
            </div>
            <p className="truncate text-xs font-bold text-white/60">{user?.email}</p>
          </div>

          <button
            onClick={() => navigate("/")}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-bold text-white/30 transition-all hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft size={16} />
            Back to Store
          </button>

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-bold text-red-400/60 transition-all hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="w-full min-w-0 pt-14 md:pt-0">{children}</main>
    </div>
  );
};

export default AdminLayout;
