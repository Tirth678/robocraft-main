import { motion, AnimatePresence } from "framer-motion";
import { Scale, X } from "lucide-react";
import { useCompare } from "@/contexts/CompareContext";

const CompareBar = () => {
  const { compareList, removeFromCompare, setIsCompareOpen } = useCompare();

  if (compareList.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-card border border-border rounded-2xl shadow-hero p-3 flex items-center gap-3"
      >
        <div className="flex items-center gap-2 pr-3 border-r border-border">
          <Scale size={18} className="text-accent" />
          <span className="font-display font-bold text-sm">{compareList.length}/3</span>
        </div>

        <div className="flex items-center gap-2">
          {compareList.map((product) => (
            <motion.div
              key={product.id}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="relative"
            >
              <div className="w-12 h-12 rounded-lg overflow-hidden border border-border">
                <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
              </div>
              <button
                onClick={() => removeFromCompare(product.id)}
                className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-foreground text-background hover:opacity-80 transition-opacity"
              >
                <X size={12} />
              </button>
            </motion.div>
          ))}
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsCompareOpen(true)}
          disabled={compareList.length < 2}
          className="ml-2 px-5 py-2.5 rounded-full bg-gradient-cta text-primary-foreground font-display font-bold text-sm border-2 border-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Compare
        </motion.button>
      </motion.div>
    </AnimatePresence>
  );
};

export default CompareBar;
