import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { ShoppingCart, ArrowRight, RefreshCw, Sparkles, Check, Package, Zap } from "lucide-react";
import { frontendProducts, getProductImage, type FrontendProduct } from "@/data/productCatalog";
import { fetchPublicProducts, type InventoryProduct } from "@/lib/inventoryApi";
import { useCart } from "@/contexts/CartContext";
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

  const [products, setProducts] = useState<FrontendProduct[]>(frontendProducts);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");

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
                      onClick={() => handleAddToCart(product)}
                      disabled={!product.available}
                      className="flex-1 py-2.5 rounded-xl bg-accent text-accent-foreground font-display font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                    >
                      <ShoppingCart size={15} />
                      {product.available ? "Add to Cart" : "Out of Stock"}
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => navigate("/kits")}
                      className="px-3 py-2.5 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-display font-medium text-xs flex items-center justify-center transition-all"
                      title="View Kits Page"
                    >
                      <ArrowRight size={15} />
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
      <FooterSection />
    </div>
  );
};

export default ProductsPage;
