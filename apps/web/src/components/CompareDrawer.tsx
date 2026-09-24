import { motion, AnimatePresence } from "framer-motion";
import { X, Scale, Star, Sparkles, Check, Clock, Trash2 } from "lucide-react";
import { useCompare } from "@/contexts/CompareContext";
import { ROBOCRAFT_PRODUCT_BY_ID } from "../../shared/robocraftCatalog";

const CompareDrawer = () => {
  const { compareList, removeFromCompare, clearCompare, isCompareOpen, setIsCompareOpen } = useCompare();

  if (!isCompareOpen || compareList.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-foreground/60 backdrop-blur-sm"
        onClick={() => setIsCompareOpen(false)}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 max-h-[90vh] bg-card rounded-t-3xl border-t border-border overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <Scale className="text-accent" size={24} />
              <h2 className="font-display font-black text-xl">Compare Products</h2>
              <span className="text-muted-foreground font-body text-sm">({compareList.length}/3)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearCompare}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-secondary text-sm font-display font-bold hover:bg-secondary/80 transition-colors"
              >
                <Trash2 size={14} /> Clear All
              </button>
              <button
                onClick={() => setIsCompareOpen(false)}
                className="p-2 rounded-full bg-secondary hover:bg-secondary/80 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="overflow-x-auto p-4 md:p-6">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr>
                  <th className="text-left p-3 font-display font-bold text-muted-foreground text-sm w-32">Feature</th>
                  {compareList.map((product) => (
                    <th key={product.id} className="p-3 text-center">
                      <div className="relative">
                        <button
                          onClick={() => removeFromCompare(product.id)}
                          className="absolute -top-1 -right-1 p-1 rounded-full bg-destructive text-destructive-foreground hover:opacity-80 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                        <div className="w-20 h-20 mx-auto rounded-xl overflow-hidden border-2 border-border mb-2">
                          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                        </div>
                        <p className="font-display font-bold text-sm">{product.name}</p>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {/* Price */}
                <tr className="bg-secondary/30">
                  <td className="p-3 font-display font-bold text-sm">Price</td>
                  {compareList.map((product) => (
                    <td key={product.id} className="p-3 text-center">
                      <span className="font-display font-black text-lg">₹{product.price.toLocaleString()}</span>
                      <span className="block text-muted-foreground line-through text-xs">
                        ₹{product.originalPrice.toLocaleString()}
                      </span>
                      <span className="text-brand text-xs font-bold">
                        {Math.round((1 - product.price / product.originalPrice) * 100)}% off
                      </span>
                    </td>
                  ))}
                </tr>

                {/* Availability */}
                <tr>
                  <td className="p-3 font-display font-bold text-sm">Availability</td>
                  {compareList.map((product) => (
                    <td key={product.id} className="p-3 text-center">
                      {product.available ? (
                        <span className="inline-flex items-center gap-1 text-brand font-body text-sm font-semibold">
                          <Check size={14} /> In Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground font-body text-sm">
                          <Clock size={14} /> Coming Soon
                        </span>
                      )}
                    </td>
                  ))}
                </tr>

                {/* Rating */}
                <tr className="bg-secondary/30">
                  <td className="p-3 font-display font-bold text-sm">Rating</td>
                  {compareList.map((product) => (
                    <td key={product.id} className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Star size={14} className="fill-accent text-accent" />
                        <span className="font-body text-sm font-semibold">{product.rating}</span>
                        <span className="text-muted-foreground text-xs">({product.reviews.toLocaleString()})</span>
                      </div>
                    </td>
                  ))}
                </tr>

                {/* Mood */}
                <tr>
                  <td className="p-3 font-display font-bold text-sm">Mood</td>
                  {compareList.map((product) => (
                    <td key={product.id} className="p-3 text-center">
                        <span className="inline-flex items-center gap-1 font-body text-sm">
                          <Sparkles size={12} className="text-accent" />
                        {ROBOCRAFT_PRODUCT_BY_ID[product.id]?.mood || "Standard"}
                      </span>
                    </td>
                  ))}
                </tr>

                {/* Battery Life */}
                <tr className="bg-secondary/30">
                  <td className="p-3 font-display font-bold text-sm">Battery Life</td>
                  {compareList.map((product) => (
                    <td key={product.id} className="p-3 text-center font-body text-sm">
                      {ROBOCRAFT_PRODUCT_BY_ID[product.id]?.batteryLife || "8 hours"}
                    </td>
                  ))}
                </tr>

                {/* Connectivity */}
                <tr>
                  <td className="p-3 font-display font-bold text-sm">Connectivity</td>
                  {compareList.map((product) => (
                    <td key={product.id} className="p-3 text-center font-body text-sm">
                      {ROBOCRAFT_PRODUCT_BY_ID[product.id]?.connectivity || "Bluetooth 5.0"}
                    </td>
                  ))}
                </tr>

                {/* Features */}
                <tr className="bg-secondary/30">
                  <td className="p-3 font-display font-bold text-sm align-top">Features</td>
                  {compareList.map((product) => (
                    <td key={product.id} className="p-3">
                      <ul className="space-y-1">
                        {(ROBOCRAFT_PRODUCT_BY_ID[product.id]?.compareFeatures || ["LED Eyes", "Voice Response"]).map((feature, i) => (
                          <li key={i} className="flex items-center gap-1.5 text-sm font-body">
                            <Check size={12} className="text-brand flex-shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CompareDrawer;
