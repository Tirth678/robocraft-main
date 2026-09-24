import { ShoppingCart } from "lucide-react";
import ScrollReveal from "./ScrollReveal";
import { motion } from "framer-motion";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";
import { featuredProduct, getProductImage } from "@/data/productCatalog";

const BottomCTASection = () => {
  const { addToCart } = useCart();

  const handleAddToCart = () => {
    addToCart({
      id: featuredProduct.id,
      name: featuredProduct.name,
      price: featuredProduct.price,
      originalPrice: featuredProduct.originalPrice,
      image: featuredProduct.image,
    });
    toast.success("Added to cart!", { description: `${featuredProduct.name} × 1` });
  };

  return (
    <section className="py-16 md:py-24 bg-secondary">
      <div className="container mx-auto px-4 max-w-2xl text-center">
        <ScrollReveal>
          <h2 className="font-display text-2xl md:text-3xl font-bold">
            <span className="text-brand">RoboCraft</span> in different <span className="text-brand">Moods</span>
          </h2>
          <p className="text-muted-foreground mt-2 font-body">Are you ready to welcome him into your life?</p>

          <div className="mt-6">
            <span className="font-display text-3xl font-bold text-accent">₹{featuredProduct.price}</span>
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className="text-muted-foreground line-through text-sm">₹{featuredProduct.originalPrice}</span>
              <span className="text-brand text-sm font-semibold">
                {Math.round((1 - featuredProduct.price / featuredProduct.originalPrice) * 100)}% OFF
              </span>
            </div>
          </div>
        </ScrollReveal>

        <div className="flex justify-center gap-4 mt-8">
          {["robocraft-bot", "robocraft-happy", "robocraft-angry"].map((productId, i) => (
            <ScrollReveal key={i} delay={i * 0.1}>
              <motion.div
                whileHover={{ y: -6, rotate: i === 1 ? 3 : i === 2 ? -3 : 0 }}
                className="w-28 h-28 md:w-36 md:h-36 rounded-2xl overflow-hidden shadow-card"
              >
                <img
                  src={getProductImage(productId)}
                  alt={`Mood ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </motion.div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={0.3}>
          <motion.button
            onClick={handleAddToCart}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="mt-8 inline-flex min-h-14 items-center justify-center gap-3 rounded-full border-[4px] border-foreground bg-gradient-cta px-8 py-4 font-display text-lg font-bold text-primary-foreground shadow-hero transition-shadow hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 md:px-12 md:py-5 md:text-xl"
          >
            Add to Cart <ShoppingCart size={20} />
          </motion.button>
        </ScrollReveal>
      </div>
    </section>
  );
};

export default BottomCTASection;
