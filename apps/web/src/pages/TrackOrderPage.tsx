import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Package, Truck, CheckCircle2, Clock, XCircle, MapPin, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getProductImage } from "@/data/productCatalog";
import { getBackendUrl } from "@/lib/backend";
import { getApiErrorMessage, getSafeErrorMessage, parseJsonSafely } from "@/lib/apiErrors";
import Navbar from "@/components/Navbar";
import FooterSection from "@/components/FooterSection";

interface OrderResult {
  id: string;
  customer_name: string;
  customer_email: string;
  shipping_address: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  items: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    image?: string;
  }[];
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  created_at: string;
}

const STATUS_STEPS = [
  { key: "pending", label: "Order Placed", icon: Clock },
  { key: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: Package },
];

const ORDERS_PER_PAGE = 5;
const TRACK_ORDER_URL = getBackendUrl("/api/track-order");

const TrackOrderPage = () => {
  useEffect(() => {
    document.title = "Track Your Order | RoboCraft Studio";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "Track your RoboCraft order status, shipping timeline, and items list using your email address or order number."
      );
    }
  }, []);

  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderResult[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderResult | null>(null);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(orders.length / ORDERS_PER_PAGE);
  const paginatedOrders = useMemo(
    () => orders.slice((currentPage - 1) * ORDERS_PER_PAGE, currentPage * ORDERS_PER_PAGE),
    [orders, currentPage]
  );

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    setOrders([]);
    setSelectedOrder(null);
    setCurrentPage(1);

    try {
      const response = await fetch(TRACK_ORDER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: trimmed }),
      });

      const payload = await parseJsonSafely<{ error?: string; orders?: OrderResult[] }>(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "We couldn't look up that order. Please try again."));
      }

      const foundOrders = payload?.orders ?? [];

      if (foundOrders.length > 0) {
        setOrders(foundOrders);
        setSelectedOrder(foundOrders[0]);
      } else {
        setError("No order found. Please check your order ID or email address.");
      }
    } catch (lookupError) {
      console.error("Order lookup failed:", lookupError);
      setError(getSafeErrorMessage(lookupError, "We couldn't look up that order. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const getActiveStep = (status: string) => {
    if (status === "cancelled") return -1;
    return STATUS_STEPS.findIndex((s) => s.key === status);
  };

  const activeStep = selectedOrder ? getActiveStep(selectedOrder.status) : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      <div>
        <Navbar />
        {/* Spacer for fixed Navbar */}
        <div className="h-16 md:h-20" />

      <div className="container mx-auto px-4 py-12 max-w-2xl space-y-8">
        {/* Search Form */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSearch}
          className="space-y-4"
        >
          <p className="font-body text-muted-foreground text-sm text-center">
            Enter your order ID or the email address used during checkout.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Order ID or email address..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 px-5 py-3.5 rounded-full border border-border bg-secondary font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading || !query.trim()}
              className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-gradient-cta text-primary-foreground font-display font-bold text-sm border-[3px] border-foreground shadow-hero disabled:opacity-50"
            >
              <Search size={16} /> {loading ? "Searching..." : "Track"}
            </motion.button>
          </div>
        </motion.form>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center p-6 rounded-2xl bg-secondary"
          >
            <ShoppingBag size={32} className="mx-auto mb-3 text-muted-foreground" />
            <p className="font-body text-sm text-muted-foreground">{error}</p>
          </motion.div>
        )}

        {/* Order List */}
        {orders.length > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
              {orders.length} orders found
            </h2>
            <div className="flex flex-wrap gap-2">
              {paginatedOrders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelectedOrder(o)}
                  className={`px-4 py-2 rounded-full font-display text-xs font-bold transition-colors border ${
                    selectedOrder?.id === o.id
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-secondary text-foreground border-border hover:bg-secondary/80"
                  }`}
                >
                  #{o.id.slice(0, 8)} • ₹{o.total} • {new Date(o.created_at).toLocaleDateString()}
                </button>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => { setCurrentPage((p) => Math.max(1, p - 1)); }}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-full font-display text-xs font-bold bg-secondary border border-border hover:bg-secondary/80 transition-colors disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span className="font-body text-xs text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => { setCurrentPage((p) => Math.min(totalPages, p + 1)); }}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-full font-display text-xs font-bold bg-secondary border border-border hover:bg-secondary/80 transition-colors disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Order Detail */}
        {selectedOrder && (
          <motion.div
            key={selectedOrder.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Status Timeline */}
            <div className="p-6 rounded-2xl bg-card border border-border">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-lg font-bold">Order #{selectedOrder.id.slice(0, 8)}</h2>
                <span className="font-body text-xs text-muted-foreground">
                  {new Date(selectedOrder.created_at).toLocaleDateString()}
                </span>
              </div>

              {selectedOrder.status === "cancelled" ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10">
                  <XCircle size={24} className="text-destructive" />
                  <div>
                    <p className="font-display font-bold text-sm">Order Cancelled</p>
                    <p className="font-body text-xs text-muted-foreground">This order has been cancelled.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  {STATUS_STEPS.map((step, i) => {
                    const isActive = i <= activeStep;
                    const Icon = step.icon;
                    return (
                      <div key={step.key} className="flex flex-col items-center flex-1 relative">
                        {i > 0 && (
                          <div
                            className={`absolute top-4 -left-1/2 w-full h-0.5 ${
                              i <= activeStep ? "bg-accent" : "bg-border"
                            }`}
                          />
                        )}
                        <div
                          className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center ${
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          <Icon size={16} />
                        </div>
                        <span
                          className={`mt-2 font-display text-[10px] font-bold text-center ${
                            isActive ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Items */}
            <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">Items</h3>
              {selectedOrder.items.map((item) => (
                <div key={item.id} className="flex items-center gap-4">
                  <img
                    src={item.image || getProductImage(item.id)}
                    alt={item.name}
                    className="w-12 h-12 rounded-lg object-cover bg-secondary"
                  />
                  <div className="flex-1">
                    <p className="font-display text-sm font-bold">{item.name}</p>
                    <p className="font-body text-xs text-muted-foreground">Qty: {item.quantity}</p>
                  </div>
                  <p className="font-display text-sm font-bold">₹{item.price * item.quantity}</p>
                </div>
              ))}
              <div className="border-t border-border pt-3 space-y-1">
                <div className="flex justify-between font-body text-xs text-muted-foreground">
                  <span>Subtotal</span><span>₹{selectedOrder.subtotal}</span>
                </div>
                <div className="flex justify-between font-body text-xs text-muted-foreground">
                  <span>Tax (18%)</span><span>₹{selectedOrder.tax}</span>
                </div>
                <div className="flex justify-between font-display text-sm font-bold pt-1">
                  <span>Total</span><span>₹{selectedOrder.total}</span>
                </div>
              </div>
            </div>

            {/* Shipping */}
            <div className="p-6 rounded-2xl bg-card border border-border">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                <MapPin size={14} className="inline mr-1" /> Shipping Address
              </h3>
              <p className="font-body text-sm">{selectedOrder.customer_name}</p>
              <p className="font-body text-sm text-muted-foreground">
                {selectedOrder.shipping_address.address}, {selectedOrder.shipping_address.city},{" "}
                {selectedOrder.shipping_address.state} {selectedOrder.shipping_address.zipCode},{" "}
                {selectedOrder.shipping_address.country}
              </p>
            </div>
          </motion.div>
        )}
      </div>
      </div>
      <FooterSection />
    </div>
  );
};

export default TrackOrderPage;
