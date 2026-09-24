import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  History,
  IndianRupee,
  Layers,
  Package,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { getSafeErrorMessage } from "@/lib/apiErrors";
import { useAuth } from "@/contexts/AuthContext";
import AdminLayout from "@/components/AdminLayout";
import RequireAdmin from "@/components/RequireAdmin";
import {
  adjustStock,
  fetchAdminProducts,
  fetchInventorySummary,
  fetchProductMovements,
  fetchRecentMovements,
  setStock,
  type InventoryProduct,
  type InventorySummary,
  type StockMovement,
} from "@/lib/inventoryApi";

const LOW_STOCK_AT = 5;

const inputClass =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50 transition-all";

type StockDraft = { quantity: string; reason: string };

const InventoryAdminContent = () => {
  const { token } = useAuth();
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [recent, setRecent] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, StockDraft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<InventoryProduct | null>(null);
  const [history, setHistory] = useState<StockMovement[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [page, summaryData, movements] = await Promise.all([
        fetchAdminProducts(token, {
          search,
          sort: "stockAsc",
          limit: 100,
          ...(showLowStockOnly ? { lowStockAt: LOW_STOCK_AT } : {}),
        }),
        fetchInventorySummary(token, LOW_STOCK_AT),
        fetchRecentMovements(token, 25),
      ]);
      setProducts(page.items);
      setSummary(summaryData);
      setRecent(movements);
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to load inventory"));
    } finally {
      setLoading(false);
    }
  }, [search, showLowStockOnly, token]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const draftFor = (productId: string) =>
    drafts[productId] ?? { quantity: "", reason: "" };

  const updateDraft = (productId: string, patch: Partial<StockDraft>) =>
    setDrafts((prev) => ({
      ...prev,
      [productId]: { ...draftFor(productId), ...patch },
    }));

  const handleMove = async (
    product: InventoryProduct,
    direction: "in" | "out" | "set"
  ) => {
    if (!token) return;
    const draft = draftFor(product.id);
    const quantity = Number.parseInt(draft.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    if (direction !== "set" && quantity === 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }

    const reason =
      draft.reason.trim() ||
      (direction === "in" ? "restock" : direction === "out" ? "shrinkage" : "stocktake");

    setBusyId(product.id);
    try {
      if (direction === "set") {
        await setStock(token, product.id, { stock: quantity, reason });
        toast.success(`${product.name} set to ${quantity}`);
      } else {
        const delta = direction === "in" ? quantity : -quantity;
        await adjustStock(token, product.id, { delta, reason });
        toast.success(
          `${direction === "in" ? "Added" : "Removed"} ${quantity} × ${product.name}`
        );
      }
      updateDraft(product.id, { quantity: "" });
      load();
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to update stock"));
    } finally {
      setBusyId(null);
    }
  };

  const openHistory = async (product: InventoryProduct) => {
    if (!token) return;
    setHistoryFor(product);
    setHistory([]);
    try {
      setHistory(await fetchProductMovements(token, product.id, 50));
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to load movement history"));
    }
  };

  const cards = [
    {
      label: "Products",
      value: summary ? `${summary.products.total}` : "—",
      hint: summary ? `${summary.products.listed} listed` : "",
      icon: Package,
      tone: "text-white",
    },
    {
      label: "Units on hand",
      value: summary ? `${summary.stock.onHand}` : "—",
      hint: summary ? `${summary.assets} asset(s)` : "",
      icon: Layers,
      tone: "text-white",
    },
    {
      label: "Low stock",
      value: summary ? `${summary.stock.lowStock}` : "—",
      hint: `at or below ${LOW_STOCK_AT}`,
      icon: AlertTriangle,
      tone: "text-yellow-400",
    },
    {
      label: "Out of stock",
      value: summary ? `${summary.stock.outOfStock}` : "—",
      hint: "needs restock",
      icon: Activity,
      tone: "text-red-400",
    },
    {
      label: "Stock value",
      value: summary ? `₹${summary.stock.value.toLocaleString("en-IN")}` : "—",
      hint: "price × on hand",
      icon: IndianRupee,
      tone: "text-green-400",
    },
  ];

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">INVENTORY</h1>
            <p className="mt-1 text-sm text-white/40">
              Stock in, stock out and the full movement audit trail.
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-white/50 hover:bg-white/5 hover:text-white transition-all"
          >
            <RefreshCw size={14} />
            REFRESH
          </button>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  {card.label}
                </p>
                <card.icon size={16} className={card.tone} />
              </div>
              <p className={`mt-3 text-2xl font-black ${card.tone}`}>{card.value}</p>
              <p className="mt-1 text-xs text-white/30">{card.hint}</p>
            </div>
          ))}
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or SKU"
              className={`${inputClass} pl-11`}
            />
          </div>
          <button
            onClick={() => setShowLowStockOnly((prev) => !prev)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold transition-all ${
              showLowStockOnly
                ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                : "border-white/10 text-white/40 hover:text-white"
            }`}
          >
            <AlertTriangle size={14} />
            LOW STOCK ONLY
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
            <Package className="mx-auto mb-4 text-white/20" size={40} />
            <p className="font-bold">Nothing to show</p>
            <p className="mt-1 text-sm text-white/40">
              {showLowStockOnly
                ? "No product is low on stock."
                : "Create products first, then manage their stock here."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {products.map((product) => {
              const draft = draftFor(product.id);
              const busy = busyId === product.id;
              return (
                <motion.div
                  key={product.id}
                  layout
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="min-w-[200px] flex-1">
                      <p className="font-bold">{product.name}</p>
                      <p className="mt-0.5 text-xs text-white/40">
                        {product.sku}
                        {product.category ? ` · ${product.category}` : ""}
                      </p>
                    </div>

                    <div className="text-right">
                      <p
                        className={`text-xl font-black ${
                          product.stock === 0
                            ? "text-red-400"
                            : product.stock <= LOW_STOCK_AT
                              ? "text-yellow-400"
                              : "text-white"
                        }`}
                      >
                        {product.stock}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                        on hand
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={draft.quantity}
                        onChange={(event) =>
                          updateDraft(product.id, { quantity: event.target.value })
                        }
                        placeholder="Qty"
                        className="w-20 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50"
                      />
                      <input
                        value={draft.reason}
                        onChange={(event) =>
                          updateDraft(product.id, { reason: event.target.value })
                        }
                        placeholder="Reason"
                        className="w-32 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50"
                      />
                      <button
                        disabled={busy}
                        onClick={() => handleMove(product, "in")}
                        title="Stock in"
                        className="flex items-center gap-1 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2.5 text-xs font-bold text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-40"
                      >
                        <ArrowUpCircle size={14} />
                        IN
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleMove(product, "out")}
                        title="Stock out"
                        className="flex items-center gap-1 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-40"
                      >
                        <ArrowDownCircle size={14} />
                        OUT
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleMove(product, "set")}
                        title="Set exact stock (stocktake)"
                        className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-white/50 hover:bg-white/5 hover:text-white transition-all disabled:opacity-40"
                      >
                        SET
                      </button>
                      <button
                        onClick={() => openHistory(product)}
                        title="Movement history"
                        className="rounded-xl p-2.5 text-white/40 hover:bg-white/5 hover:text-white transition-all"
                      >
                        <History size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        <div className="mt-10">
          <h2 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40">
            <Activity size={14} /> Recent movements
          </h2>
          {recent.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/30">
              No stock movements recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {recent.map((movement) => (
                <div
                  key={movement.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"
                >
                  <span
                    className={`w-16 font-black ${
                      movement.delta > 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                  </span>
                  <span className="flex-1 font-bold">
                    {movement.product?.name ?? movement.productId}
                  </span>
                  <span className="text-white/40">{movement.reason}</span>
                  <span className="text-xs text-white/25">
                    {new Date(movement.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {historyFor && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setHistoryFor(null)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0a]"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <div>
                <h2 className="font-black">{historyFor.name.toUpperCase()}</h2>
                <p className="text-xs text-white/40">{historyFor.sku}</p>
              </div>
              <button
                onClick={() => setHistoryFor(null)}
                className="text-white/40 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              {history.length === 0 ? (
                <p className="text-sm text-white/30">No movements for this product.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((movement) => (
                    <div
                      key={movement.id}
                      className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-sm"
                    >
                      <span
                        className={`w-14 font-black ${
                          movement.delta > 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                      </span>
                      <span className="flex-1">{movement.reason}</span>
                      {movement.reference && (
                        <span className="text-xs text-white/30">
                          {movement.reference}
                        </span>
                      )}
                      <span className="text-xs text-white/25">
                        {new Date(movement.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

const InventoryAdminPage = () => (
  <RequireAdmin>
    <InventoryAdminContent />
  </RequireAdmin>
);

export default InventoryAdminPage;
