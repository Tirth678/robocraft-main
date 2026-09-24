import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles, Package, Zap, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";
import { useState, useRef, useEffect, useCallback } from "react";
import CompareBar from "@/components/CompareBar";
import CompareDrawer from "@/components/CompareDrawer";
import { getProductImage } from "@/data/productCatalog";
import { motionEase } from "@/lib/motion";
import { getBackendUrl } from "@/lib/backend";
import { getApiErrorMessage, getSafeErrorMessage, parseJsonSafely } from "@/lib/apiErrors";
import { fetchPublicProducts, type InventoryProduct } from "@/lib/inventoryApi";
import Navbar from "@/components/Navbar";
import FooterSection from "@/components/FooterSection";
import { ShoppingCart, Clock, Bell, Check, Scale, RefreshCw, ChevronRight } from "lucide-react";

const WAITLIST_SUBSCRIBE_URL = getBackendUrl("/api/waitlist-subscribe");


// Map known product names to local images
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

type FrontendProduct = {
  id: string;
  name: string;
  subtitle: string;
  description?: string;
  price: number;
  originalPrice: number;
  salePrice: number | null;
  image: string;
  rating: number;
  reviews: number;
  badge: string;
  badgeColor: string;
  available: boolean;
  backendId: string;
  promoCode: string | null;
  promoDiscount: number | null;
  promoActive: boolean | null;
  stockQuantity: number | null;
};

function mapBackendToFrontend(bp: InventoryProduct): FrontendProduct {
  const price = Number(bp.price);
  const hasStock = bp.stock > 0;
  return {
    id: `product-${bp.id}`,
    name: bp.name,
    subtitle: bp.description || bp.category || "RoboCraft Product",
    description: bp.description || undefined,
    price,
    originalPrice: price,
    salePrice: null,
    image: getProductImageForBackend(bp),
    rating: 0,
    reviews: 0,
    badge: hasStock ? "In Stock" : "Coming Soon",
    badgeColor: hasStock ? "bg-accent" : "bg-foreground",
    available: bp.isListed && hasStock,
    backendId: bp.id,
    promoCode: null,
    promoDiscount: null,
    promoActive: false,
    stockQuantity: bp.stock,
  };
}

const categories = ["All Kits", "In Stock", "On Sale", "All Products"];

const KitsPage = () => {
  useEffect(() => {
    document.title = "RoboCraft Kits - Choose Your Desk Sidekick | RoboCraft Studio";
  }, []);

  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [activeCategory, setActiveCategory] = useState("All Kits");
  const [notifiedIds, setNotifiedIds] = useState<string[]>([]);
  const [emailModalProduct, setEmailModalProduct] = useState<FrontendProduct | null>(null);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [backendProducts, setBackendProducts] = useState<FrontendProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    setProductsError(null);
    try {
      const page = await fetchPublicProducts({ limit: 100, sort: "newest" });
      setBackendProducts(page.items.map(mapBackendToFrontend));
    } catch (error) {
      // An unreachable catalogue is not the same as an empty one.
      setProductsError(getSafeErrorMessage(error, "Couldn't load the catalogue"));
      setBackendProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const productsToShow = backendProducts.length > 0 ? backendProducts : [];

  const filteredProducts = productsToShow.filter((product) => {
    if (activeCategory === "All Kits") return true;
    if (activeCategory === "In Stock") return product.available;
    if (activeCategory === "On Sale") return product.salePrice !== null || (product.promoActive && product.promoDiscount !== null);
    if (activeCategory === "All Products") return true;
    return true;
  });

  const handleNotifyMe = async () => {
    if (!emailModalProduct) return;
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(WAITLIST_SUBSCRIBE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: trimmed, productId: emailModalProduct.id }),
      });
      const payload = await parseJsonSafely<{ error?: string; alreadySubscribed?: boolean }>(response);
      if (!response.ok) throw new Error(getApiErrorMessage(payload));
      if (payload?.alreadySubscribed) {
        toast.info("Already subscribed!", { description: `You're on the waitlist for ${emailModalProduct.name}.` });
      } else {
        toast.success("You're on the list!", { description: `We'll notify you when ${emailModalProduct.name} launches.` });
      }
      setNotifiedIds((prev) => prev.includes(emailModalProduct.id) ? prev : [...prev, emailModalProduct.id]);
    } catch (error) {
      toast.error("Something went wrong", { description: getSafeErrorMessage(error, "Please try again later.") });
    } finally {
      setSubmitting(false);
    }
    setEmailModalProduct(null);
    setEmail("");
  };

  const handleAddToCart = (product: FrontendProduct) => {
    if (!product.available) {
      if (notifiedIds.includes(product.id)) {
        toast.info("Already subscribed", { description: `You're on the waitlist for ${product.name}.` });
      } else {
        setEmailModalProduct(product);
        setTimeout(() => emailInputRef.current?.focus(), 100);
      }
      return;
    }
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      originalPrice: product.originalPrice,
      image: product.image,
    });
    toast.success("Added to cart!", { description: `${product.name} x 1` });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      <div>
        <Navbar />
        <div className="h-16 md:h-20" />

        {/* Category tabs */}
        <div className="sticky top-16 md:top-20 z-30 bg-background/90 backdrop-blur-lg border-b border-border py-4">
          <div className="container mx-auto px-4 flex gap-2 overflow-x-auto no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex-shrink-0 px-5 py-2 rounded-full font-body text-sm font-semibold transition-all ${
                  activeCategory === cat
                    ? "bg-foreground text-background"
                    : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Coming Soon Banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="container mx-auto px-4 mt-6"
        >
          <div className="relative overflow-hidden rounded-2xl bg-foreground text-primary-foreground p-8 md:p-12">
            <div className="absolute inset-0 bg-gradient-cta opacity-20" />
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-accent/20 blur-3xl" />
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={20} className="text-accent" />
                  <span className="font-display font-bold text-accent text-sm uppercase tracking-wider">New Collection</span>
                </div>
                <h2 className="font-display text-3xl md:text-4xl font-black mb-2">More Kits Coming Soon</h2>
                <p className="text-primary-foreground/60 font-body max-w-md">
                  We're crafting new editions of RoboCraft bots with unique personalities. Stay tuned!
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Products Grid */}
        <div className="container mx-auto px-4 py-8">
          {loadingProducts ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((product, i) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  whileHover={{ y: -4 }}
                  className="group bg-card rounded-2xl border border-border overflow-hidden shadow-card hover:shadow-hero transition-all duration-300"
                >
                  {/* Image */}
                  <div className="relative aspect-square bg-secondary overflow-hidden">
                    <img
                      src={product.image}
                      alt={product.name}
                      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${!product.available ? "opacity-80" : ""}`}
                    />
                    <span className={`absolute top-3 left-3 ${product.badgeColor} text-primary-foreground text-xs font-display font-bold px-3 py-1 rounded-full`}>
                      {product.badge}
                    </span>
                    {!product.available && (
                      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px] flex items-center justify-center">
                        <div className="bg-foreground/90 text-primary-foreground px-6 py-3 rounded-full font-display font-black text-lg flex items-center gap-2">
                          <Clock size={18} /> Coming Soon
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="p-5">
                    <h3 className="font-display font-bold text-lg leading-tight">{product.name}</h3>
                    <p className="text-muted-foreground font-body text-sm mt-1">{product.subtitle}</p>

                    {/* Price */}
                    <div className="flex items-baseline gap-2 mt-3">
                      <span className="font-display text-2xl font-black">
                        ₹{product.price.toLocaleString()}
                      </span>
                      {product.salePrice && (
                        <span className="text-muted-foreground line-through text-sm">
                          ₹{product.originalPrice.toLocaleString()}
                        </span>
                      )}
                      {product.salePrice && (
                        <span className="text-brand text-xs font-bold">
                          {Math.round((1 - product.price / product.originalPrice) * 100)}% off
                        </span>
                      )}
                      {product.promoActive && product.promoDiscount && !product.salePrice && (
                        <span className="text-brand text-xs font-bold">
                          Use {product.promoCode} for {product.promoDiscount}% off
                        </span>
                      )}
                    </div>

                    {/* CTA */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleAddToCart(product)}
                      className={`mt-4 w-full py-3 rounded-full font-display font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                        product.available
                          ? "bg-gradient-cta text-primary-foreground border-[3px] border-foreground shadow-hero"
                          : "bg-secondary text-foreground border-2 border-border hover:border-muted-foreground"
                      }`}
                    >
                      {product.available ? (
                        <>Add to Cart <ShoppingCart size={16} /></>
                      ) : notifiedIds.includes(product.id) ? (
                        <><Zap size={16} /> On Waitlist</>
                      ) : (
                        <><Bell size={16} /> Notify Me</>
                      )}
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
          {!loadingProducts && productsError && (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
              <p className="font-body text-sm text-muted-foreground">{productsError}</p>
              <button
                onClick={fetchProducts}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-display font-bold"
              >
                <RefreshCw size={14} /> Try again
              </button>
            </div>
          )}
          {!loadingProducts && !productsError && filteredProducts.length === 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-secondary p-6 text-center">
              <p className="font-body text-sm text-muted-foreground">No products found in this category.</p>
            </div>
          )}
        </div>

        {/* Bottom info */}
        <div className="container mx-auto px-4 pb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Package, title: "Free Shipping", desc: "On orders above ₹2999" },
              { icon: Zap, title: "Fast Delivery", desc: "2-4 business days" },
              { icon: Star, title: "Premium Quality", desc: "1 year warranty included" },
            ].map((info, i) => (
              <motion.div
                key={info.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="flex items-center gap-4 p-5 rounded-2xl bg-secondary"
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

        <CompareBar />
        <CompareDrawer />

        {/* Email Subscription Modal */}
        <AnimatePresence>
          {emailModalProduct && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm p-4"
              onClick={() => { setEmailModalProduct(null); setEmail(""); }}
            >
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 10 }}
                transition={{ duration: 0.25, ease: motionEase }}
                className="bg-card rounded-2xl border border-border shadow-hero p-6 w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-border">
                    <img src={emailModalProduct.image} alt={emailModalProduct.name} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg">{emailModalProduct.name}</h3>
                    <p className="text-muted-foreground text-sm font-body">Get notified when it launches</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    ref={emailInputRef}
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleNotifyMe()}
                    className="flex-1 px-4 py-3 rounded-full border border-border bg-secondary font-body text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleNotifyMe}
                    disabled={submitting}
                    className="px-6 py-3 rounded-full bg-gradient-cta text-primary-foreground font-display font-bold text-sm border-[3px] border-foreground disabled:opacity-50"
                  >
                    {submitting ? "..." : "Notify Me"}
                  </motion.button>
                </div>
                <p className="text-muted-foreground text-xs font-body mt-3 text-center">
                  We'll only email you once when this product launches. No spam.
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <FooterSection />
    </div>
  );
};

export default KitsPage;
