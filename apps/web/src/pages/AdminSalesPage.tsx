import { useCallback, useEffect, useState } from "react";
import { Calendar, TrendingUp, Package, RefreshCw, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { getBackendUrl } from "@/lib/backend";
import { parseJsonSafely } from "@/lib/apiErrors";
import { useAuth } from "@/contexts/AuthContext";
import AdminLayout from "@/components/AdminLayout";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

type Product = {
  id: number;
  name: string;
  price: number;
  imageUrl: string | null;
  category: string | null;
};

type ProductSalesData = {
  product: Product;
  year: number;
  yearly: {
    totalQuantity: number;
    totalRevenue: number;
    totalOrders: number;
  };
  monthlySales: Array<{
    month: number;
    quantitySold: number;
    revenue: number;
    orderCount: number;
  }>;
  dailySales: Array<{
    day: number;
    quantitySold: number;
    revenue: number;
    orderCount: number;
  }>;
};

type OverallSalesData = {
  year: number;
  monthlySales: Array<{
    month: number;
    orderCount: number;
    totalRevenue: number;
    totalItems: number;
  }>;
  dailySales: Array<{
    day: number;
    orderCount: number;
    totalRevenue: number;
  }>;
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const AdminSalesPage = () => {
  const { token, user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [productSales, setProductSales] = useState<ProductSalesData | null>(null);
  const [overallSales, setOverallSales] = useState<OverallSalesData | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"monthly" | "daily">("monthly");

  const fetchProducts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(getBackendUrl("/api/products"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await parseJsonSafely<{ success?: boolean; data?: Product[] }>(res);
      if (res.ok && payload?.success) {
        setProducts(payload.data || []);
      }
    } catch {
      toast.error("Failed to load products");
    }
  }, [token]);

  const fetchOverallSales = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(
        getBackendUrl(`/api/admin/analytics/sales?year=${year}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const payload = await parseJsonSafely<{ success?: boolean; data?: OverallSalesData }>(res);
      if (res.ok && payload?.success) {
        setOverallSales(payload.data || null);
      }
    } catch {
      toast.error("Failed to load sales data");
    } finally {
      setLoading(false);
    }
  }, [token, year]);

  const fetchProductSales = useCallback(
    async (productId: number) => {
      if (!token) return;
      setLoading(true);
      try {
        const res = await fetch(
          getBackendUrl(`/api/admin/analytics/sales/product/${productId}?year=${year}`),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const payload = await parseJsonSafely<{ success?: boolean; data?: ProductSalesData }>(res);
        if (res.ok && payload?.success) {
          setProductSales(payload.data || null);
        }
      } catch {
        toast.error("Failed to load product sales data");
      } finally {
        setLoading(false);
      }
    },
    [token, year]
  );

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated || !token) {
        toast.error("Authentication required");
        window.location.href = "/auth";
        return;
      }
      if (user?.role !== "admin") {
        toast.error("Access denied");
        window.location.href = "/";
        return;
      }
      fetchProducts();
    }
  }, [authLoading, fetchProducts, isAuthenticated, token, user]);

  useEffect(() => {
    if (selectedProductId) {
      fetchProductSales(selectedProductId);
    } else {
      fetchOverallSales();
    }
  }, [selectedProductId, year, fetchOverallSales, fetchProductSales]);

  const chartData = selectedProductId && productSales
    ? view === "monthly"
      ? productSales.monthlySales.map((m) => ({
          name: MONTHS[m.month - 1],
          revenue: m.revenue,
          quantity: m.quantitySold,
          orders: m.orderCount,
        }))
      : productSales.dailySales.map((d) => ({
          name: `Day ${d.day}`,
          revenue: d.revenue,
          quantity: d.quantitySold,
          orders: d.orderCount,
        }))
    : overallSales
    ? view === "monthly"
      ? overallSales.monthlySales.map((m) => ({
          name: MONTHS[m.month - 1],
          revenue: m.totalRevenue,
          quantity: m.totalItems,
          orders: m.orderCount,
        }))
      : overallSales.dailySales.map((d) => ({
          name: `Day ${d.day}`,
          revenue: d.totalRevenue,
          quantity: 0,
          orders: d.orderCount,
        }))
    : [];

  const yearlyStats = selectedProductId && productSales
    ? productSales.yearly
    : { totalQuantity: 0, totalRevenue: 0, totalOrders: 0 };

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">
              Sales Analytics
            </h1>
            <p className="text-white/40 text-sm font-medium tracking-wide uppercase mt-1">
              Revenue and sales data by product, month, and day
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-purple-500/50 appearance-none cursor-pointer"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y} className="bg-[#0a0a0a]">
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Product Selector */}
        <div className="mb-8">
          <label className="block text-xs font-black text-white/40 uppercase tracking-widest mb-3">
            Select Product (or view overall)
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setSelectedProductId(null)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                !selectedProductId
                  ? "bg-purple-600/20 text-purple-400 border-purple-500/30"
                  : "bg-white/5 text-white/40 border-white/10 hover:text-white"
              }`}
            >
              <Package size={16} />
              Overall Sales
            </button>
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProductId(p.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                  selectedProductId === p.id
                    ? "bg-purple-600/20 text-purple-400 border-purple-500/30"
                    : "bg-white/5 text-white/40 border-white/10 hover:text-white"
                }`}
              >
                {p.imageUrl && (
                  <div className="h-5 w-5 rounded overflow-hidden">
                    <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Cards */}
        {selectedProductId && productSales && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                  <TrendingUp size={20} />
                </div>
                <p className="text-white/40 font-bold text-xs uppercase tracking-widest">
                  Total Revenue ({year})
                </p>
              </div>
              <p className="text-3xl font-black text-white">
                ₹{productSales.yearly.totalRevenue.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                  <Package size={20} />
                </div>
                <p className="text-white/40 font-bold text-xs uppercase tracking-widest">
                  Units Sold ({year})
                </p>
              </div>
              <p className="text-3xl font-black text-white">
                {productSales.yearly.totalQuantity.toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400">
                  <Calendar size={20} />
                </div>
                <p className="text-white/40 font-bold text-xs uppercase tracking-widest">
                  Total Orders ({year})
                </p>
              </div>
              <p className="text-3xl font-black text-white">
                {productSales.yearly.totalOrders.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* View Toggle */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
            <button
              onClick={() => setView("monthly")}
              className={`px-5 py-2 rounded-lg text-xs font-black transition-all ${
                view === "monthly"
                  ? "bg-white text-black"
                  : "text-white/40 hover:text-white"
              }`}
            >
              MONTHLY
            </button>
            <button
              onClick={() => setView("daily")}
              className={`px-5 py-2 rounded-lg text-xs font-black transition-all ${
                view === "daily"
                  ? "bg-white text-black"
                  : "text-white/40 hover:text-white"
              }`}
            >
              DAILY
            </button>
          </div>
          <span className="text-xs text-white/20 font-medium">
            {view === "monthly"
              ? `Showing monthly breakdown for ${year}`
              : `Showing daily breakdown for current month in ${year}`}
          </span>
        </div>

        {/* Chart */}
        <div className="rounded-2xl border border-white/5 bg-white/5 p-6">
          {loading ? (
            <div className="h-[400px] flex items-center justify-center">
              <div className="h-10 w-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              {view === "monthly" ? (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 12 }}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 12 }}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#111",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                      color: "#fff",
                    }}
                    formatter={(value: number, name: string) => [
                      name === "revenue" ? `₹${value.toLocaleString("en-IN")}` : value,
                      name === "revenue" ? "Revenue" : name === "quantity" ? "Units Sold" : "Orders",
                    ]}
                  />
                  <Bar dataKey="revenue" fill="#a855f7" radius={[6, 6, 0, 0]} name="revenue" />
                  <Bar dataKey="quantity" fill="#3b82f6" radius={[6, 6, 0, 0]} name="quantity" />
                </BarChart>
              ) : (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 12 }}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 12 }}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#111",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                      color: "#fff",
                    }}
                    formatter={(value: number, name: string) => [
                      name === "revenue" ? `₹${value.toLocaleString("en-IN")}` : value,
                      name === "revenue" ? "Revenue" : "Orders",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={{ fill: "#a855f7", r: 4 }}
                    name="revenue"
                  />
                  <Line
                    type="monotone"
                    dataKey="orders"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: "#3b82f6", r: 4 }}
                    name="orders"
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="h-[400px] flex flex-col items-center justify-center text-white/20">
              <Package size={48} className="mb-4 opacity-30" />
              <p className="font-bold text-sm">No sales data for this period</p>
              <p className="text-xs mt-1">Sales will appear here once orders are placed</p>
            </div>
          )}
        </div>

        {/* Monthly Breakdown Table */}
        {selectedProductId && productSales && productSales.monthlySales.length > 0 && (
          <div className="mt-8 rounded-2xl border border-white/5 bg-white/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5">
              <h3 className="text-sm font-black text-white/60 uppercase tracking-widest">
                Monthly Breakdown — {productSales.product.name} ({year})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
                      Month
                    </th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 text-center">
                      Orders
                    </th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 text-center">
                      Units Sold
                    </th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 text-right">
                      Revenue
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {productSales.monthlySales.map((m) => (
                    <tr key={m.month} className="hover:bg-white/[0.02]">
                      <td className="px-6 py-4 text-sm font-bold text-white">
                        {MONTHS[m.month - 1]}
                      </td>
                      <td className="px-6 py-4 text-sm text-white/50 text-center">
                        {m.orderCount}
                      </td>
                      <td className="px-6 py-4 text-sm text-white/50 text-center">
                        {m.quantitySold}
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-white text-right">
                        ₹{m.revenue.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminSalesPage;
