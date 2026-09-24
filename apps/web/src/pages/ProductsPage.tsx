import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { frontendProducts } from "@/data/productCatalog";
import Navbar from "@/components/Navbar";
import FooterSection from "@/components/FooterSection";

const ProductsPage = () => {
  useEffect(() => {
    document.title = "All Products - RoboCraft Studio";
  }, []);

  const navigate = useNavigate();

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
            className="text-center"
          >
            <h1 className="font-display text-4xl md:text-5xl font-black mb-3">
              All Products
            </h1>
            <p className="text-muted-foreground font-body max-w-xl mx-auto">
              Browse the full RoboCraft lineup. Choose your perfect desk companion.
            </p>
          </motion.div>
        </div>

        {/* Products Grid */}
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {frontendProducts.map((product, i) => (
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
                      <div className="bg-foreground/90 text-primary-foreground px-6 py-3 rounded-full font-display font-black text-lg">
                        Coming Soon
                      </div>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="p-5">
                  <h3 className="font-display font-bold text-lg leading-tight">{product.name}</h3>
                  <p className="text-muted-foreground font-body text-sm mt-1">{product.subtitle}</p>

                  {/* Rating */}
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex">
                      {Array.from({ length: 5 }, (_, s) => (
                        <span key={s} className={s < Math.round(product.rating) ? "text-yellow-400" : "text-muted-foreground/30"}>
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
                      <span className="text-muted-foreground line-through text-sm">
                        ₹{product.originalPrice.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* CTA */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate("/")}
                    className="mt-4 w-full py-3 rounded-full bg-gradient-cta text-primary-foreground font-display font-bold text-sm flex items-center justify-center gap-2 border-[3px] border-foreground shadow-hero transition-all"
                  >
                    View on Site <ArrowRight size={16} />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom info */}
        <div className="container mx-auto px-4 pb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: ShoppingCart, title: "Free Shipping", desc: "On orders above ₹2999" },
              { icon: ArrowRight, title: "Fast Delivery", desc: "2-4 business days" },
              { icon: ArrowRight, title: "Premium Quality", desc: "1 year warranty included" },
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
      </div>
      <FooterSection />
    </div>
  );
};

export default ProductsPage;
