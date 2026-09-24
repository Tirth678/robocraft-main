import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  IndianRupee,
  Image as ImageIcon,
  Layers,
  Package,
  RefreshCw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getSafeErrorMessage } from "@/lib/apiErrors";
import { useAuth } from "@/contexts/AuthContext";
import AdminLayout from "@/components/AdminLayout";
import RequireAdmin from "@/components/RequireAdmin";
import {
  fetchAdminProducts,
  fetchInventorySummary,
  fetchRecentMovements,
  type InventoryProduct,
  type InventorySummary,
  type StockMovement,
} from "@/lib/inventoryApi";

const LOW_STOCK_AT = 5;

const AdminDashboardContent = () => {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [lowStock, setLowStock] = useState<InventoryProduct[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [summaryData, lowStockPage, recent] = await Promise.all([
        fetchInventorySummary(token, LOW_STOCK_AT),
        fetchAdminProducts(token, { lowStockAt: LOW_STOCK_AT, sort: "stockAsc", limit: 8 }),
        fetchRecentMovements(token, 8),
      ]);
      setSummary(summaryData);
      setLowStock(lowStockPage.items);
      setMovements(recent);
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to load dashboard"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = [
    {
      label: "Products",
      value: summary?.products.total ?? 0,
      hint: `${summary?.products.listed ?? 0} listed · ${summary?.products.unlisted ?? 0} hidden`,
      icon: Package,
      tone: "text-purple-400",
    },
    {
      label: "Units on hand",
      value: summary?.stock.onHand ?? 0,
      hint: `${summary?.stock.outOfStock ?? 0} out of stock`,
      icon: Layers,
      tone: "text-blue-400",
    },
    {
      label: "Low stock",
      value: summary?.stock.lowStock ?? 0,
      hint: `at or below ${LOW_STOCK_AT} units`,
      icon: AlertTriangle,
      tone: "text-yellow-400",
    },
    {
      label: "Stock value",
      value: `₹${(summary?.stock.value ?? 0).toLocaleString("en-IN")}`,
      hint: "price × on hand",
      icon: IndianRupee,
      tone: "text-green-400",
    },
    {
      label: "Media assets",
      value: summary?.assets ?? 0,
      hint: "Cloudinary uploads",
      icon: ImageIcon,
      tone: "text-pink-400",
    },
  ];

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm font-medium uppercase tracking-wide text-white/40">
              Inventory overview · {user?.email}
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/70 hover:bg-white/10 hover:text-white transition-all"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  {stat.label}
                </p>
                <stat.icon size={16} className={stat.tone} />
              </div>
              <p className={`mt-3 text-2xl font-black ${stat.tone}`}>{stat.value}</p>
              <p className="mt-1 text-xs text-white/30">{stat.hint}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40">
                <AlertTriangle size={14} className="text-yellow-400" /> Needs restock
              </h2>
              <button
                onClick={() => navigate("/admin/inventory")}
                className="flex items-center gap-1 text-xs font-bold text-purple-400 hover:text-purple-300"
              >
                Manage <ArrowUpRight size={12} />
              </button>
            </div>
            {lowStock.length === 0 ? (
              <p className="text-sm text-white/30">Every product is above the threshold.</p>
            ) : (
              <div className="space-y-2">
                {lowStock.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-bold">{product.name}</p>
                      <p className="text-xs text-white/30">{product.sku}</p>
                    </div>
                    <span
                      className={`text-sm font-black ${
                        product.stock === 0 ? "text-red-400" : "text-yellow-400"
                      }`}
                    >
                      {product.stock}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40">
                <Activity size={14} className="text-blue-400" /> Recent movements
              </h2>
              <button
                onClick={() => navigate("/admin/products")}
                className="flex items-center gap-1 text-xs font-bold text-purple-400 hover:text-purple-300"
              >
                Products <ArrowUpRight size={12} />
              </button>
            </div>
            {movements.length === 0 ? (
              <p className="text-sm text-white/30">No stock movements recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {movements.map((movement) => (
                  <div
                    key={movement.id}
                    className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm"
                  >
                    <span
                      className={`w-12 font-black ${
                        movement.delta > 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                    </span>
                    <span className="flex-1 truncate font-bold">
                      {movement.product?.name ?? movement.productId}
                    </span>
                    <span className="text-xs text-white/30">{movement.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

const AdminPage = () => (
  <RequireAdmin>
    <AdminDashboardContent />
  </RequireAdmin>
);

export default AdminPage;
