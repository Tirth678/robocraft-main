import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { ShoppingCart, ArrowRight, RefreshCw, Sparkles, Check, Package, Zap, Loader2, Truck } from "lucide-react";
import { frontendProducts, getProductImage, type FrontendProduct } from "@/data/productCatalog";
import { fetchPublicProducts, type InventoryProduct, createPreOrder } from "@/lib/inventoryApi";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import FooterSection from "@/components/FooterSection";

const localImageMap: Record<string, string> = {
  "robocraft bot": getProductImage("robocraft-bot"),
  "robocraft happy edition": getProductImage("robocraft-happy"),
  "robocraft fury edition": getProductImage("robocraft-angry"),
  "robocraft emo edition": getProductImage("robocraft-sad"),
  "robocraft time keeper": getProductImage("robocraft-clock"),
  "robocraft custom build": getProductImage("robocraft-custom"),
};

function getProductImageForBackend(product: InventoryProduct): string {
  if (product.imageUrl) return product.imageUrl;
  const local = localImageMap[product.name.toLowerCase()];
  if (local) return local;
  return getProductImage("robocraft-bot");
}

function mapInventoryToFrontend(item: InventoryProduct): FrontendProduct {
  const price = Number(item.price);
  const mrp = Number((item as any).mrp) || price;
  const hasStock = item.stock > 0;

  return {
    id: `inv-${item.id}`,
    name: item.name,
    subtitle: item.description || item.category || "RoboCraft Companion",
    description: item.description || undefined,
    price,
    originalPrice: mrp,
    image: getProductImageForBackend(item),
    rating: 4.8,
    reviews: 124,
    badge: hasStock ? (item.stock <= 5 ? "Low Stock" : "In Stock") : "Coming Soon",
    badgeColor: hasStock ? (item.stock <= 5 ? "bg-amber-500" : "bg-accent") : "bg-foreground",
    available: item.isListed && hasStock,
  };
}

const ProductsPage = () => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { token, isAuthenticated } = useAuth();

  const [products, setProducts] = useState<FrontendProduct[]>(frontendProducts);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  
  // Pre-order modal state
  const [preOrderModalProduct, setPreOrderModalProduct] = useState<FrontendProduct | null>(null);
  const [preOrderForm, setPreOrderForm] = useState({
    name: "",
    email: "",
    phone: "",
    quantity: 1,
    notes: "",
  });
  const [preOrderSubmitting, setPreOrderSubmitting] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    document.title = "All Products - RoboCraft Studio";
  }, []);

  const loadLiveProducts = useCallback(async (showToast = false) => {
    try {
      setIsRefreshing(true);
      const res = await fetchPublicProducts({ limit: 100, sort: "newest" });
      if (res && res.items && res.items.length > 0) {
        const liveItems = res.items.map(mapInventoryToFrontend);
        setProducts(liveItems);
        if (showToast) {
          toast.success("Products synced with live inventory!");
        }
      } else {
        // Fallback to static catalog if backend has 0 items
        setProducts(frontendProducts);
      }
    } catch (err) {
      console.warn("Could not reach inventory service, using default catalog:", err);
      setProducts(frontendProducts);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadLiveProducts();
  }, [loadLiveProducts]);

  const handleAddToCart = (product: FrontendProduct) => {
    if (!product.available) {
      toast.info("Coming soon", { description: `${product.name} is currently out of stock.` });
      return;
    }
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      originalPrice: product.originalPrice,
      image: product.image,
    });
    toast.success("Added to cart!", { description: `${product.name} × 1` });
  };

  const handlePreOrder = (product: FrontendProduct) => {
    if (!isAuthenticated || !token) {
      toast.error("Please login to place a pre-order");
      return;
    }
    setPreOrderModalProduct(product);
    setPreOrderForm({
      name: "",
      email: "",
      phone: "",
      quantity: 1,
      notes: "",
    });
  };

  const handlePreOrderSubmit = async () => {
    if (!preOrderModalProduct || !token) return;
    
    if (!preOrderForm.name.trim() || !preOrderForm.email.trim()) {
      toast.error("Please fill in your name and email");
      return;
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(preOrderForm.email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    
    setPreOrderSubmitting(true);
    try {
      await createPreOrder({
        productId: preOrderModalProduct.id.replace("inv-", ""),
        quantity: preOrderForm.quantity,
        customerEmail: preOrderForm.email.trim(),
        customerName: preOrderForm.name.trim(),
        customerPhone: preOrderForm.phone.trim() || undefined,
        notes: preOrderForm.notes.trim() || undefined,
      });
      
      toast.success("Pre-order placed successfully!", { 
        description: `We've received your pre-order for ${preOrderModalProduct.name}. You'll receive a confirmation email shortly.` 
      });
      
      setPreOrderModalProduct(null);
      setPreOrderForm({ name: "", email: "", phone: "", quantity: 1, notes: "" });
    } catch (error) {
      console.error("Pre-order error:", error);
      toast.error("Failed to place pre-order", { 
        description: error instanceof Error ? error.message : "Please try again later." 
      });
    } finally {
      setPreOrderSubmitting(false);
    }
  };

  const categories = ["All", "In Stock", "Robotics", "Kits"];

  const filteredProducts = products.filter((p) => {
    if (activeCategory === "All") return true;
    if (activeCategory === "In Stock") return p.available;
    if (activeCategory === "Robotics") return p.subtitle.toLowerCase().includes("robot") || p.name.toLowerCase().includes("bot");
    if (activeCategory === "Kits") return p.name.toLowerCase().includes("kit") || p.subtitle.toLowerCase().includes("build");
    return true;
  });

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      <div>
        <Navbar />
        <div className="h-16 md:h-20" />

        {/* Header */}
        <div className="container mx-auto px-4 pt-8 pb-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center relative max-w-2xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Official RoboCraft Storefront</span>
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-black mb-3">
              All Products
            </h1>
            <p className="text-muted-foreground font-body max-w-xl mx-auto text-sm md:text-base">
              Browse the full RoboCraft lineup. Verified desk companions engineered for personality and precision.
            </p>

            {/* Sync / Refresh Button */}
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => void loadLiveProducts(true)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full border border-border bg-card/60 transition-colors"
                title="Refresh product catalogue"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>{isRefreshing ? "Syncing..." : "Sync live inventory"}</span>
              </button>
            </div>
          </motion.div>

          {/* Filter Pills */}
          <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  activeCategory === cat
                    ? "bg-foreground text-background shadow-md"
                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <div className="container mx-auto px-4 py-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((product, i) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                  className="group bg-card rounded-2xl border border-border overflow-hidden shadow-card hover:shadow-hero transition-all duration-300 flex flex-col justify-between"
                >
                  <div>
                    {/* Image */}
                    <div className="relative aspect-square bg-secondary overflow-hidden">
                      <img
                        src={product.image}
                        alt={product.name}
                        className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                          !product.available ? "opacity-80" : ""
                        }`}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = getProductImage("robocraft-bot");
                        }}
                      />
                      <span
                        className={`absolute top-3 left-3 ${product.badgeColor} text-primary-foreground text-xs font-display font-bold px-3 py-1 rounded-full shadow-sm`}
                      >
                        {product.badge}
                      </span>
                      {!product.available && (
                        <div className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px] flex items-center justify-center">
                          <div className="bg-foreground/90 text-primary-foreground px-6 py-2.5 rounded-full font-display font-black text-sm">
                            Coming Soon
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="p-5">
                      <h3 className="font-display font-bold text-lg leading-tight group-hover:text-accent transition-colors">
                        {product.name}
                      </h3>
                      <p className="text-muted-foreground font-body text-xs mt-1.5 line-clamp-2">
                        {product.subtitle}
                      </p>

                      {/* Rating */}
                      <div className="flex items-center gap-2 mt-3">
                        <div className="flex">
                          {Array.from({ length: 5 }, (_, s) => (
                            <span
                              key={s}
                              className={
                                s < Math.round(product.rating)
                                  ? "text-yellow-400"
                                  : "text-muted-foreground/30"
                              }
                            >
                              ★
                            </span>
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground font-body">
                          {product.rating} ({product.reviews.toLocaleString()})
                        </span>
                      </div>

                      {/* Price */}
                      <div className="flex items-baseline gap-2 mt-3">
                        <span className="font-display text-2xl font-black">
                          ₹{product.price.toLocaleString()}
                        </span>
                        {product.originalPrice > product.price && (
                          <>
                            <span className="text-muted-foreground line-through text-sm">
                              ₹{product.originalPrice.toLocaleString()}
                            </span>
                            <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              {Math.round((1 - product.price / product.originalPrice) * 100)}% off
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

{/* CTA Actions */}
                    <div className="p-5 pt-0 flex gap-2">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => product.available ? handleAddToCart(product) : handlePreOrder(product)}
                        disabled={!product.available && preOrderSubmitting}
                        className={`flex-1 py-2.5 rounded-xl font-display font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all ${
                          product.available
                            ? "bg-accent text-accent-foreground"
                            : "bg-gradient-cta text-primary-foreground border-[3px] border-foreground shadow-hero"
                        } ${preOrderSubmitting && !product.available ? "opacity-50" : ""}`}
                      >
                        {preOrderSubmitting && !product.available ? <Loader2 size={15} className="animate-spin" /> : product.available ? <ShoppingCart size={15} /> : <Truck size={15} />}
                        {product.available ? "Add to Cart" : "Pre Order"}
                      </motion.button>
                    </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom info */}
        <div className="container mx-auto px-4 pb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: ShoppingCart, title: "Free Shipping", desc: "On orders above ₹2999" },
              { icon: Zap, title: "Fast Delivery", desc: "2-4 business days" },
              { icon: Package, title: "Premium Quality", desc: "1 year warranty included" },
            ].map((info, i) => (
              <motion.div
                key={info.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-4 p-5 rounded-2xl bg-secondary border border-border"
              >
                <info.icon size={24} className="text-accent flex-shrink-0" />
                <div>
                  <h4 className="font-display font-bold text-sm">{info.title}</h4>
                  <p className="text-muted-foreground font-body text-xs">{info.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Pre-Order Modal */}
      <AnimatePresence>
        {preOrderModalProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm p-4"
            onClick={() => { setPreOrderModalProduct(null); setPreOrderForm({ name: "", email: "", phone: "", quantity: 1, notes: "" }); }}
          >
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 10 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="bg-card rounded-2xl border border-border shadow-hero p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden border border-border flex-shrink-0">
                  <img src={preOrderModalProduct.image} alt={preOrderModalProduct.name} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-lg truncate">{preOrderModalProduct.name}</h3>
                  <p className="text-muted-foreground text-sm font-body">Place your pre-order now</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Full Name *</label>
                  <input
                    type="text"
                    placeholder="John Doe"
                    value={preOrderForm.name}
                    onChange={(e) => setPreOrderForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-3 rounded-full border border-border bg-secondary font-body text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Email *</label>
                  <input
                    type="email"
                    placeholder="john@example.com"
                    value={preOrderForm.email}
                    onChange={(e) => setPreOrderForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-3 rounded-full border border-border bg-secondary font-body text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Phone (Optional)</label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={preOrderForm.phone}
                    onChange={(e) => setPreOrderForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-4 py-3 rounded-full border border-border bg-secondary font-body text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Quantity</label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setPreOrderForm(prev => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))}
                      className="w-10 h-10 rounded-full border border-border bg-secondary flex items-center justify-center text-lg font-bold hover:bg-secondary/80"
                    >
                      -
                    </button>
                    <span className="font-display font-bold text-xl w-12 text-center">{preOrderForm.quantity}</span>
                    <button
                      onClick={() => setPreOrderForm(prev => ({ ...prev, quantity: prev.quantity + 1 }))}
                      className="w-10 h-10 rounded-full border border-border bg-secondary flex items-center justify-center text-lg font-bold hover:bg-secondary/80"
                    >
                      +
                    </button>
                    <span className="text-sm text-muted-foreground ml-auto">
                      ₹{(preOrderModalProduct.price * preOrderForm.quantity).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes (Optional)</label>
                  <textarea
                    placeholder="Any special instructions or requests..."
                    value={preOrderForm.notes}
                    onChange={(e) => setPreOrderForm(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-secondary font-body text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                  />
                </div>
                
                <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{preOrderModalProduct.name} × {preOrderForm.quantity}</span>
                    <span className="font-bold">₹{(preOrderModalProduct.price * preOrderForm.quantity).toLocaleString('en-IN')}</span>
                  </div>
                  {preOrderModalProduct.originalPrice > preOrderModalProduct.price && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>MRP</span>
                      <span className="line-through">₹{(preOrderModalProduct.originalPrice * preOrderForm.quantity).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-emerald-500 font-bold border-t border-border pt-2">
                    <span>You Save</span>
                    <span>₹{((preOrderModalProduct.originalPrice - preOrderModalProduct.price) * preOrderForm.quantity).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between font-display font-bold text-lg pt-2 border-t border-border">
                    <span>Total</span>
                    <span className="text-accent">₹{(preOrderModalProduct.price * preOrderForm.quantity).toLocaleString('en-IN')}</span>
                  </div>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setPreOrderModalProduct(null); setPreOrderForm({ name: "", email: "", phone: "", quantity: 1, notes: "" }); }}
                    className="flex-1 py-3 rounded-full border-2 border-border font-display font-bold text-sm transition-colors hover:bg-secondary"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handlePreOrderSubmit}
                    disabled={preOrderSubmitting}
                    className="flex-1 py-3 rounded-full bg-gradient-cta text-primary-foreground font-display font-bold text-sm border-[3px] border-foreground disabled:opacity-50"
                  >
                    {preOrderSubmitting ? <Loader2 size={16} className="mx-auto animate-spin" /> : "Place Pre-Order"}
                  </motion.button>
                </div>
                
                <p className="text-muted-foreground text-xs font-body text-center">
                  We'll email you a confirmation and notify you when your order ships.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <FooterSection />
    </div>
  );
};

export default ProductsPage;
