import { motion } from "framer-motion";
import { ShoppingCart, Star, Clock, Zap, Bell, Sparkles, RefreshCw, Scale, Check } from "lucide-react";
import { useProductDescription } from "@/hooks/useProductDescription";
import { useCompare } from "@/contexts/CompareContext";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  originalPrice: number;
  image: string;
  rating: number;
  reviews: number;
  badge: string;
  badgeColor: string;
  available: boolean;
}

interface ProductCardProps {
  product: Product;
  index: number;
  notifiedIds: string[];
  onAddToCart: (product: Product) => void;
}

const ProductCard = ({ product, index, notifiedIds, onAddToCart }: ProductCardProps) => {
  const { description, loading, generateDescription, regenerate } = useProductDescription(product);
  const { addToCompare, removeFromCompare, isInCompare, compareList } = useCompare();
  const inCompare = isInCompare(product.id);

  const handleCompareToggle = () => {
    if (inCompare) {
      removeFromCompare(product.id);
      toast.info("Removed from compare");
    } else {
      const added = addToCompare(product);
      if (added) {
        toast.success("Added to compare", { description: `${compareList.length + 1}/3 products selected` });
      } else {
        toast.error("Compare limit reached", { description: "You can compare up to 3 products" });
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      whileHover={{ y: -4 }}
      className="group bg-card rounded-2xl border border-border overflow-hidden shadow-card hover:shadow-hero transition-all duration-300"
    >
      {/* Image */}
      <div className="relative aspect-square bg-secondary overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
            !product.available ? "opacity-80" : ""
          }`}
        />
        <span
          className={`absolute top-3 left-3 ${product.badgeColor} text-primary-foreground text-xs font-display font-bold px-3 py-1 rounded-full`}
        >
          {product.badge}
        </span>
        
        {/* Compare Button */}
        <button
          onClick={handleCompareToggle}
          className={`absolute top-3 right-3 p-2 rounded-full transition-all ${
            inCompare
              ? "bg-accent text-primary-foreground"
              : "bg-card/80 backdrop-blur-sm text-foreground hover:bg-card"
          }`}
        >
          {inCompare ? <Check size={16} /> : <Scale size={16} />}
        </button>
        {!product.available && (
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px] flex items-center justify-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3 + index * 0.08 }}
              className="bg-foreground/90 text-primary-foreground px-6 py-3 rounded-full font-display font-black text-lg flex items-center gap-2"
            >
              <Clock size={18} /> Coming Soon
            </motion.div>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="p-5">
        <h3 className="font-display font-bold text-lg leading-tight">{product.name}</h3>
        <p className="text-muted-foreground font-body text-sm mt-1">{product.subtitle}</p>

        {/* AI Description */}
        <div className="mt-2 min-h-[2.5rem]">
          {loading ? (
            <p className="text-sm font-body text-muted-foreground/70">
              Generating product summary...
            </p>
          ) : description ? (
            <div className="group/desc">
              <p className="text-sm font-body text-muted-foreground/80 italic leading-snug">
                <Sparkles size={12} className="text-accent inline mr-1 -mt-0.5" />
                {description}
              </p>
              <button
                onClick={regenerate}
                className="mt-1.5 flex items-center gap-1 text-xs font-body text-muted-foreground/60 hover:text-accent transition-colors opacity-0 group-hover/desc:opacity-100"
              >
                <RefreshCw size={10} /> Regenerate
              </button>
            </div>
          ) : (
            <button
              onClick={() => void generateDescription()}
              className="flex items-center gap-1 text-xs font-body text-muted-foreground/70 transition-colors hover:text-accent"
            >
              <Sparkles size={12} /> Generate product summary
            </button>
          )}
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1.5 mt-3">
          <div className="flex items-center gap-0.5">
            {[...Array(5)].map((_, j) => (
              <Star
                key={j}
                size={14}
                className={
                  j < Math.floor(product.rating)
                    ? "fill-accent text-accent"
                    : "text-border"
                }
              />
            ))}
          </div>
          <span className="font-body text-sm text-muted-foreground">
            {product.rating} ({product.reviews.toLocaleString()})
          </span>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2 mt-3">
          <span className="font-display text-2xl font-black">
            ₹{product.price.toLocaleString()}
          </span>
          <span className="text-muted-foreground line-through text-sm">
            ₹{product.originalPrice.toLocaleString()}
          </span>
          <span className="text-brand text-xs font-bold">
            {Math.round((1 - product.price / product.originalPrice) * 100)}% off
          </span>
        </div>

        {/* CTA */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onAddToCart(product)}
          className={`mt-4 w-full py-3 rounded-full font-display font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            product.available
              ? "bg-gradient-cta text-primary-foreground border-[3px] border-foreground shadow-hero"
              : "bg-secondary text-foreground border-2 border-border hover:border-muted-foreground"
          }`}
        >
          {product.available ? (
            <>
              Add to Cart <ShoppingCart size={16} />
            </>
          ) : notifiedIds.includes(product.id) ? (
            <>
              <Zap size={16} /> On Waitlist
            </>
          ) : (
            <>
              <Bell size={16} /> Notify Me
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
};

export default ProductCard;
