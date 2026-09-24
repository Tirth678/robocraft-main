import { useState } from "react";
import { motion } from "framer-motion";
import { Check, ShoppingCart } from "lucide-react";
import ScrollReveal from "./ScrollReveal";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";
import {
  featuredProduct,
  featuredProductFeatures,
  featuredProductGallery,
} from "@/data/productCatalog";

const ProductSection = () => {
  const [selectedImg, setSelectedImg] = useState(0);
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
    <section id="kits" className="py-16 md:py-24 bg-background">
      <ScrollReveal>
        <h2 className="text-center font-display text-3xl md:text-5xl font-bold mb-12">
          Get <span className="text-brand italic">yours</span> today!
        </h2>
      </ScrollReveal>

      <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main image */}
        <ScrollReveal direction="left" className="lg:col-span-5">
          <motion.div
            key={selectedImg}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl overflow-hidden bg-secondary aspect-square flex items-center justify-center"
          >
            <img
              src={featuredProductGallery[selectedImg]}
              alt={featuredProduct.name}
              decoding="async"
              className="w-full h-full object-cover"
            />
          </motion.div>
        </ScrollReveal>

        {/* Thumbnails */}
        <div className="lg:col-span-2 flex lg:flex-col gap-3 overflow-x-auto no-scrollbar">
          {featuredProductGallery.map((thumb, i) => (
            <motion.button
              key={i}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedImg(i)}
              aria-label={`Show ${featuredProduct.name} view ${i + 1}`}
              aria-pressed={selectedImg === i}
              className={`flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition-all ${
                selectedImg === i ? "border-accent scale-105" : "border-border hover:border-muted-foreground"
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`}
            >
              <img
                src={thumb}
                alt=""
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                className="w-full h-full object-cover"
              />
            </motion.button>
          ))}
        </div>

        {/* Details */}
        <ScrollReveal direction="right" className="lg:col-span-5 flex flex-col justify-center">
          <h3 className="font-display text-3xl md:text-4xl font-black uppercase tracking-tight">
            ROBOCRAFT BOT
          </h3>

          <div className="mt-4">
            <span className="font-display text-4xl font-bold">₹{featuredProduct.price}</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-muted-foreground line-through">₹{featuredProduct.originalPrice}</span>
              <span className="text-brand font-semibold">
                {Math.round((1 - featuredProduct.price / featuredProduct.originalPrice) * 100)}% off
              </span>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <motion.button
              onClick={handleAddToCart}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full border-[4px] border-foreground bg-gradient-cta px-8 py-4 font-display text-lg font-bold text-primary-foreground shadow-hero transition-shadow hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 md:px-12 md:py-5 md:text-xl"
            >
              Add to Cart <ShoppingCart size={20} />
            </motion.button>
          </div>

          <div className="mt-8 p-6 rounded-2xl border border-border">
            <h4 className="font-display font-bold text-lg mb-4">Features:</h4>
            <ul className="space-y-2">
              {featuredProductFeatures.map((f, i) => (
                <ScrollReveal key={f} delay={i * 0.05}>
                  <li className="flex items-center gap-2">
                    <Check size={18} className="text-accent flex-shrink-0" />
                    <span className="font-body">{f}</span>
                  </li>
                </ScrollReveal>
              ))}
            </ul>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

export default ProductSection;
