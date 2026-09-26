import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  User,
  Package,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Edit,
  Trash2,
  Download,
  RefreshCw,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getSafeErrorMessage } from "@/lib/apiErrors";
import { useAuth } from "@/contexts/AuthContext";
import AdminLayout from "@/components/AdminLayout";
import RequireAdmin from "@/components/RequireAdmin";
import { fetchAdminPreOrders, fetchAdminPreOrder, updateAdminPreOrder, cancelAdminPreOrder, type PreOrder, type PreOrderPage } from "@/lib/inventoryApi";
import { AnimatePresence, motion } from "framer-motion";

type PreOrderStatus = "pending" | "confirmed" | "cancelled" | "fulfilled";

const STATUS_CONFIG: Record<PreOrderStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pending", color: "text-yellow-400 bg-yellow-500/10", icon: Clock },
  confirmed: { label: "Confirmed", color: "text-blue-400 bg-blue-500/10", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "text-red-400 bg-red-500/10", icon: XCircle },
  fulfilled: { label: "Fulfilled", color: "text-green-400 bg-green-500/10", icon: CheckCircle },
};

const getStatusIcon = (status: string): JSX.Element => {
  switch (status) {
    case "pending": return <Clock size={10} />;
    case "confirmed": return <CheckCircle size={10} />;
    case "cancelled": return <XCircle size={10} />;
    case "fulfilled": return <CheckCircle size={10} />;
    default: return <Clock size={10} />;
  }
};

const ITEMS_PER_PAGE = 20;

const AdminPreOrdersPage = () => {
  const navigate = useNavigate();
  const { token, user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [preOrders, setPreOrders] = useState<PreOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPreOrder, setSelectedPreOrder] = useState<PreOrder | null>(null);
  const [editingPreOrder, setEditingPreOrder] = useState<PreOrder | null>(null);
  const [editForm, setEditForm] = useState({ status: "", customerName: "", customerPhone: "", notes: "" });

  const fetchPreOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const query: any = {
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
      };
      if (statusFilter !== "all") query.status = statusFilter;
      if (searchQuery) query.search = searchQuery;

      const result = await fetchAdminPreOrders(token, query);
      setPreOrders(result.items || []);
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to load pre-orders"));
    } finally {
      setLoading(false);
    }
  }, [token, currentPage, statusFilter, searchQuery]);

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
      fetchPreOrders();
    }
  }, [authLoading, fetchPreOrders, isAuthenticated, token, user]);

  useEffect(() => {
    fetchPreOrders();
  }, [currentPage, statusFilter, searchQuery]);

  const VALID_STATUSES: PreOrderStatus[] = ['pending', 'confirmed', 'cancelled', 'fulfilled'];

  const normalizeStatus = (value: string): PreOrderStatus | null => {
    if (VALID_STATUSES.some((status) => status === value)) {
      return value as PreOrderStatus;
    }
    return null;
  };

  const handleStatusChange = async (preOrder: PreOrder, newStatus: string) => {
    const normalized = normalizeStatus(newStatus);
    if (!normalized) {
      toast.error('Invalid status selection.');
      return;
    }

    if (!token) return;
    try {
      await updateAdminPreOrder(token, preOrder.id, { status: normalized });
      toast.success(`Pre-order marked as ${STATUS_CONFIG[normalized].label}`);
      fetchPreOrders();
      if (selectedPreOrder?.id === preOrder.id) {
        const updated = await fetchAdminPreOrder(token, preOrder.id);
        setSelectedPreOrder(updated);
      }
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to update status"));
    }
  };

  const handleCancelPreOrder = async (preOrder: PreOrder) => {
    if (!token) return;
    if (!confirm(`Are you sure you want to cancel pre-order #${preOrder.id.slice(0, 8).toUpperCase()}?`)) return;
    try {
      await cancelAdminPreOrder(token, preOrder.id);
      toast.success("Pre-order cancelled");
      fetchPreOrders();
      setSelectedPreOrder(null);
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to cancel pre-order"));
    }
  };

  const handleEditSave = async () => {
    if (!token || !editingPreOrder) return;
    const normalized = normalizeStatus(editForm.status);
    if (!normalized) {
      toast.error('Invalid status selection.');
      return;
    }
    try {
      await updateAdminPreOrder(token, editingPreOrder.id, {
        status: normalized,
        customerName: editForm.customerName || undefined,
        customerPhone: editForm.customerPhone || undefined,
        notes: editForm.notes || undefined,
      });
      toast.success("Pre-order updated");
      fetchPreOrders();
      setEditingPreOrder(null);
      const updated = await fetchAdminPreOrder(token, editingPreOrder.id);
      setSelectedPreOrder(updated);
    } catch (error) {
      toast.error(getSafeErrorMessage(error, "Failed to update pre-order"));
    }
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    confirmed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
    fulfilled: "bg-green-500/20 text-green-400 border-green-500/30",
  };

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
            <h1 className="text-3xl font-black tracking-tight">Pre-Orders</h1>
            <p className="mt-1 text-sm font-medium uppercase tracking-wide text-white/40">
              Manage customer pre-orders · {user?.email}
            </p>
          </div>
          <button
            onClick={fetchPreOrders}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[250px] max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search by email, name, order ID..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:bg-white/10"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500/50 appearance-none cursor-pointer min-w-[150px]"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="fulfilled">Fulfilled</option>
          </select>
        </div>

        {/* Pre-Orders Table */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Order ID</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Customer</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Product</th>
                  <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Qty</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Total</th>
                  <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Status</th>
                  <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Date</th>
                  <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {preOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-white/30">
                      <Package size={48} className="mx-auto mb-4 opacity-30" />
                      <p className="font-bold text-sm">No pre-orders found</p>
                      <p className="text-xs mt-1">Pre-orders will appear here once customers place them</p>
                    </td>
                  </tr>
                ) : (
                  preOrders.map((preOrder) => (
                    <tr key={preOrder.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => setSelectedPreOrder(preOrder)}>
                      <td className="px-6 py-4">
                        <code className="text-sm font-mono font-bold text-white">#{preOrder.id.slice(0, 8).toUpperCase()}</code>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-bold text-white truncate max-w-xs">{preOrder.customerName || "Guest"}</p>
                          <p className="text-xs text-white/50 truncate max-w-xs">{preOrder.customerEmail}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {preOrder.product.imageUrl && (
                            <img src={preOrder.product.imageUrl} alt={preOrder.product.name} className="w-10 h-10 rounded-lg object-cover" />
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate">{preOrder.product.name}</p>
                            <p className="text-xs text-white/40 truncate">{preOrder.product.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-bold text-white">{preOrder.quantity}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-display font-bold text-white">{formatCurrency(preOrder.totalAmount)}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusColors[preOrder.status]}`}>
                          {getStatusIcon(preOrder.status)}
                          {STATUS_CONFIG[preOrder.status].label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-white/50">{formatDate(preOrder.createdAt)}</td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingPreOrder(preOrder); setEditForm({ status: preOrder.status, customerName: preOrder.customerName || "", customerPhone: preOrder.customerPhone || "", notes: preOrder.notes || "" }); }}
                            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                            title="Edit"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCancelPreOrder(preOrder); }}
                            disabled={preOrder.status === "cancelled" || preOrder.status === "fulfilled"}
                            className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Cancel"
                          >
                            <XCircle size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
              <p className="text-sm text-white/50">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, total)} of {total} pre-orders
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-4 text-sm font-bold text-white">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Detail Modal */}
        <AnimatePresence>
          {selectedPreOrder && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm p-4"
              onClick={() => setSelectedPreOrder(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 10 }}
                transition={{ duration: 0.25 }}
                className="bg-card rounded-2xl border border-border shadow-hero w-full max-w-4xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {selectedPreOrder.product.imageUrl && (
                      <img src={selectedPreOrder.product.imageUrl} alt={selectedPreOrder.product.name} className="w-16 h-16 rounded-lg object-cover" />
                    )}
                    <div>
                      <h2 className="font-display font-bold text-lg">{selectedPreOrder.product.name}</h2>
                      <p className="text-sm text-white/50">#{selectedPreOrder.id.slice(0, 8).toUpperCase()} • {formatDate(selectedPreOrder.createdAt)}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedPreOrder(null)} className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Status Badge */}
                  <div className="flex items-center gap-4">
                    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border ${statusColors[selectedPreOrder.status]}`}>
                      {getStatusIcon(selectedPreOrder.status)}
                      {STATUS_CONFIG[selectedPreOrder.status].label}
                    </span>
                    {selectedPreOrder.status !== "cancelled" && selectedPreOrder.status !== "fulfilled" && (
                      <select
                        value={selectedPreOrder.status}                         onChange={(e) => handleStatusChange(selectedPreOrder, e.target.value)}
                        className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                      >
                        <option value="pending">Mark Pending</option>
                        <option value="confirmed">Mark Confirmed</option>
                        <option value="fulfilled">Mark Fulfilled</option>
                      </select>
                    )}
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Customer Info */}
                    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/40 mb-4">
                        <User size={14} /> Customer Details
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Mail size={16} className="text-white/40 w-5" />
                          <div>
                            <p className="text-xs text-white/40">Email</p>
                            <p className="font-bold text-white">{selectedPreOrder.customerEmail}</p>
                          </div>
                        </div>
                        {selectedPreOrder.customerName && (
                          <div className="flex items-center gap-3">
                            <User size={16} className="text-white/40 w-5" />
                            <div>
                              <p className="text-xs text-white/40">Name</p>
                              <p className="font-bold text-white">{selectedPreOrder.customerName}</p>
                            </div>
                          </div>
                        )}
                        {selectedPreOrder.customerPhone && (
                          <div className="flex items-center gap-3">
                            <Phone size={16} className="text-white/40 w-5" />
                            <div>
                              <p className="text-xs text-white/40">Phone</p>
                              <p className="font-bold text-white">{selectedPreOrder.customerPhone}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Product Info */}
                    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/40 mb-4">
                        <Package size={14} /> Product Details
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          {selectedPreOrder.product.imageUrl && (
                            <img src={selectedPreOrder.product.imageUrl} alt={selectedPreOrder.product.name} className="w-12 h-12 rounded-lg object-cover" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-white truncate">{selectedPreOrder.product.name}</p>
                            <p className="text-xs text-white/40 truncate">{selectedPreOrder.product.sku}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-white/40">Unit Price</p>
                            <p className="font-bold text-white">{formatCurrency(selectedPreOrder.product.price)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-white/40">MRP</p>
                            <p className="font-bold text-white">{formatCurrency(selectedPreOrder.product.mrp || selectedPreOrder.product.price)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-white/40">Quantity</p>
                            <p className="font-bold text-white">{selectedPreOrder.quantity}</p>
                          </div>
                          <div>
                            <p className="text-xs text-white/40">Total</p>
                            <p className="font-bold text-accent">{formatCurrency(selectedPreOrder.totalAmount)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  {selectedPreOrder.notes && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/40 mb-3">
                        <AlertCircle size={14} /> Customer Notes
                      </h3>
                      <p className="text-white/80 whitespace-pre-wrap">{selectedPreOrder.notes}</p>
                    </div>
                  )}

                  {/* Order Timeline */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/40 mb-4">
                      <Clock size={14} /> Timeline
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-400 mt-2 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-white/40">Order Placed</p>
                          <p className="font-bold text-white">{formatDate(selectedPreOrder.createdAt)}</p>
                        </div>
                      </div>
                      {selectedPreOrder.updatedAt !== selectedPreOrder.createdAt && (
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 rounded-full bg-yellow-400 mt-2 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-white/40">Last Updated</p>
                            <p className="font-bold text-white">{formatDate(selectedPreOrder.updatedAt)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit Modal */}
        <AnimatePresence>
          {editingPreOrder && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm p-4"
              onClick={() => setEditingPreOrder(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 10 }}
                transition={{ duration: 0.25 }}
                className="bg-card rounded-2xl border border-border shadow-hero p-6 w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="font-display font-bold text-lg mb-6">Edit Pre-Order</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full px-4 py-3 rounded-full border border-border bg-secondary font-body text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="fulfilled">Fulfilled</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Customer Name</label>
                    <input
                      type="text"
                      value={editForm.customerName}
                      onChange={(e) => setEditForm(prev => ({ ...prev, customerName: e.target.value }))}
                      className="w-full px-4 py-3 rounded-full border border-border bg-secondary font-body text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Customer Phone</label>
                    <input
                      type="tel"
                      value={editForm.customerPhone}
                      onChange={(e) => setEditForm(prev => ({ ...prev, customerPhone: e.target.value }))}
                      className="w-full px-4 py-3 rounded-full border border-border bg-secondary font-body text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</label>
                    <textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-secondary font-body text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setEditingPreOrder(null)}
                      className="flex-1 py-3 rounded-full border-2 border-border font-display font-bold text-sm transition-colors hover:bg-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleEditSave}
                      className="flex-1 py-3 rounded-full bg-gradient-cta text-primary-foreground font-display font-bold text-sm border-[3px] border-foreground"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AdminLayout>
  );
};

export default AdminPreOrdersPage;