import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Zap, Heart, Gamepad2, Clock, Focus, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";
import {
  featuredProduct,
  getProductImage,
} from "@/data/productCatalog";
import { motionEase } from "@/lib/motion";

const features = [
  { icon: Heart, label: "5 Moods", desc: "Happy, Sad, Angry, Custom & more" },
  { icon: Zap, label: "40+ Expressions", desc: "Dynamic animated faces" },
  { icon: Gamepad2, label: "Mini Games", desc: "Hyper casual fun on desk" },
  { icon: Clock, label: "Clock Mode", desc: "Stylish time display" },
  { icon: Focus, label: "Focus Mode", desc: "Pomodoro & productivity" },
];

const moods = [
  { img: getProductImage("robocraft-happy"), label: "Happy", color: "from-green-400 to-emerald-500" },
  { img: getProductImage("robocraft-angry"), label: "Angry", color: "from-red-400 to-rose-500" },
  { img: getProductImage("robocraft-sad"), label: "Sad", color: "from-blue-400 to-indigo-500" },
  { img: getProductImage("robocraft-clock"), label: "Clock", color: "from-amber-400 to-orange-500" },
  { img: getProductImage("robocraft-custom"), label: "Custom", color: "from-purple-400 to-violet-500" },
];

const Experience3D = () => {
  useEffect(() => {
    document.title = "RoboCraft 3D Showcase - Interact with Your Bot | RoboCraft Studio";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "Experience RoboCraft Bot in an interactive showcase. Explore its expressions, Pomodoro clock features, moods, and custom desk companion modes."
      );
    }
  }, []);

  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
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
    <div className="min-h-screen bg-foreground text-primary-foreground overflow-hidden">
      {/* Back button */}
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
        onClick={() => navigate("/")}
        className="fixed top-6 left-6 z-20 flex items-center gap-2 px-4 py-2 rounded-full bg-primary-foreground/10 backdrop-blur-md font-display font-bold hover:bg-primary-foreground/20 transition-colors"
      >
        <ArrowLeft size={18} /> Back
      </motion.button>

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6">
        {/* Animated background circles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full opacity-10"
              style={{
                background: `radial-gradient(circle, hsl(${i * 60}, 80%, 60%), transparent)`,
                width: `${200 + i * 100}px`,
                height: `${200 + i * 100}px`,
                left: `${20 + i * 15}%`,
                top: `${10 + i * 15}%`,
              }}
              animate={{
                scale: reduceMotion ? 1 : [1, 1.24, 1],
                x: reduceMotion ? 0 : [0, 42, 0],
                y: reduceMotion ? 0 : [0, -28, 0],
              }}
              transition={{
                duration: 6 + i,
                repeat: reduceMotion ? 0 : Infinity,
                ease: motionEase,
                delay: i * 0.5,
              }}
            />
          ))}
        </div>

        {/* Main robot showcase */}
        <motion.div
          initial={{ scale: 0, rotate: -10, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 80, damping: 15, delay: 0.2 }}
          className="relative z-10"
        >
          <motion.div
            animate={{
              y: reduceMotion ? 0 : [0, -18, 0],
              rotateY: reduceMotion ? 0 : [0, 8, -8, 0],
              rotateZ: reduceMotion ? 0 : [0, 2, -2, 0],
            }}
            transition={{ duration: 5, repeat: reduceMotion ? 0 : Infinity, ease: motionEase }}
            className="relative"
            style={{ perspective: "1200px" }}
          >
            <img
              src={featuredProduct.image}
              alt={featuredProduct.name}
              className="w-48 h-48 md:w-72 md:h-72 rounded-3xl shadow-2xl"
              style={{ transform: "rotateY(5deg)" }}
            />
            {/* Enhanced glow effect */}
            <motion.div
              className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-accent/40 to-transparent opacity-60"
              animate={{ opacity: reduceMotion ? 0.6 : [0.4, 0.8, 0.4] }}
              transition={{ duration: 3, repeat: reduceMotion ? 0 : Infinity }}
            />
          </motion.div>

          {/* Enhanced floating particles */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-3 h-3 rounded-full bg-gradient-to-r from-accent to-accent/50"
              style={{
                left: `${-30 + i * 25}%`,
                top: `${5 + (i % 4) * 25}%`,
                boxShadow: "0 0 12px hsla(var(--accent), 0.45)",
              }}
              animate={{
                y: reduceMotion ? 0 : [0, -36, 0],
                opacity: reduceMotion ? 0.5 : [0.2, 1, 0.2],
                scale: reduceMotion ? 0.8 : [0.3, 1.2, 0.3],
                x: reduceMotion ? 0 : [0, Math.sin(i) * 20, 0],
              }}
              transition={{
                duration: 3 + i * 0.4,
                repeat: reduceMotion ? 0 : Infinity,
                delay: i * 0.3,
                ease: motionEase,
              }}
            />
          ))}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, type: "spring", stiffness: 100 }}
          className="font-display text-4xl md:text-7xl font-black mt-8 tracking-tight text-center"
        >
          ROBOCRAFT <motion.span
            className="text-accent inline-block"
            animate={{ scale: reduceMotion ? 1 : [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: reduceMotion ? 0 : Infinity, delay: 0.8 }}
          >
            BOT
          </motion.span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, type: "spring" }}
          className="text-primary-foreground/60 font-body text-lg mt-3 text-center max-w-md"
        >
          Your tiny desk companion with 40+ expressions, moods, games, and more.
        </motion.p>

        {/* Enhanced scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 flex flex-col items-center gap-2 text-primary-foreground/40"
        >
          <motion.span
            className="font-body text-sm"
            animate={{ opacity: reduceMotion ? 0.8 : [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: reduceMotion ? 0 : Infinity }}
          >
            Scroll to explore
          </motion.span>
          <motion.div
            animate={{ y: reduceMotion ? 0 : [0, 12, 0] }}
            transition={{ duration: 1.5, repeat: reduceMotion ? 0 : Infinity }}
            className="w-5 h-8 rounded-full border-2 border-primary-foreground/30 flex justify-center pt-1.5"
          >
            <motion.div
              className="w-1 h-1.5 bg-primary-foreground/50 rounded-full"
              animate={{ y: reduceMotion ? 0 : [0, 4, 0] }}
              transition={{ duration: 1.5, repeat: reduceMotion ? 0 : Infinity }}
            />
          </motion.div>
        </motion.div>
      </section>

      {/* Moods Gallery */}
      <section className="py-20 px-6">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="font-display text-3xl md:text-5xl font-black text-center mb-16"
        >
          Meet every <motion.span
            className="text-accent inline-block"
            animate={{ scale: reduceMotion ? 1 : [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: reduceMotion ? 0 : Infinity }}
          >
            mood
          </motion.span>
        </motion.h2>

        <div className="flex flex-wrap justify-center gap-6 max-w-5xl mx-auto">
          {moods.map((mood, i) => (
            <motion.div
              key={mood.label}
              initial={{ opacity: 0, y: 50, scale: 0.8 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12, type: "spring", stiffness: 100 }}
              whileHover={{ scale: 1.12, y: -15, rotateZ: 2 }}
              className="relative group cursor-pointer"
            >
              <motion.div
                className="w-36 h-36 md:w-44 md:h-44 rounded-2xl overflow-hidden shadow-lg"
                animate={reduceMotion
                  ? { boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }
                  : { boxShadow: ["0 10px 30px rgba(0,0,0,0.2)", "0 20px 50px rgba(0,0,0,0.4)", "0 10px 30px rgba(0,0,0,0.2)"] }}
                transition={{ duration: 3, repeat: reduceMotion ? 0 : Infinity }}
              >
                <img src={mood.img} alt={mood.label} className="w-full h-full object-cover" />
                <motion.div
                  className={`absolute inset-0 bg-gradient-to-t ${mood.color} opacity-0 group-hover:opacity-50 transition-opacity duration-300 rounded-2xl`}
                  animate={{ opacity: reduceMotion ? 0 : [0, 0.3, 0] }}
                  transition={{ duration: 4, repeat: reduceMotion ? 0 : Infinity, delay: i * 0.5 }}
                />
              </motion.div>
              <motion.p
                className="text-center font-display font-bold mt-3 text-primary-foreground/80"
                animate={{ y: reduceMotion ? 0 : [0, -2, 0] }}
                transition={{ duration: 2, repeat: reduceMotion ? 0 : Infinity }}
              >
                {mood.label}
              </motion.p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="font-display text-3xl md:text-5xl font-black text-center mb-16"
        >
          Packed with <motion.span
            className="text-accent inline-block"
            animate={{ scale: reduceMotion ? 1 : [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: reduceMotion ? 0 : Infinity, delay: 0.3 }}
          >
            features
          </motion.span>
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {features.map((feat, i) => (
            <motion.div
              key={feat.label}
              initial={{ opacity: 0, scale: 0.8, y: 30 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15, type: "spring", stiffness: 100 }}
              whileHover={{ scale: 1.08, y: -8 }}
              className="p-6 rounded-2xl bg-primary-foreground/5 backdrop-blur-sm border border-primary-foreground/10 text-center group cursor-pointer"
            >
              <motion.div
                animate={{
                  y: reduceMotion ? 0 : [0, -8, 0],
                  rotate: reduceMotion ? 0 : [0, 5, -5, 0],
                }}
                transition={{ duration: 3, repeat: reduceMotion ? 0 : Infinity, delay: i * 0.4 }}
              >
                <feat.icon size={32} className="mx-auto mb-3 text-accent group-hover:text-accent/80 transition-colors" />
              </motion.div>
              <h3 className="font-display font-bold text-lg">{feat.label}</h3>
              <p className="text-primary-foreground/50 font-body text-sm mt-1">{feat.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 100 }}
        >
          <motion.h2
            className="font-display text-3xl md:text-5xl font-black mb-4"
            animate={{ scale: reduceMotion ? 1 : [1, 1.02, 1] }}
            transition={{ duration: 2, repeat: reduceMotion ? 0 : Infinity }}
          >
            Ready to get <motion.span
              className="text-accent inline-block"
              animate={{ rotate: reduceMotion ? 0 : [0, 2, -2, 0] }}
              transition={{ duration: 3, repeat: reduceMotion ? 0 : Infinity }}
            >
              yours
            </motion.span>?
          </motion.h2>
          <motion.p
            className="text-primary-foreground/60 font-body mb-8"
            animate={{ opacity: reduceMotion ? 0.8 : [0.6, 1, 0.6] }}
            transition={{ duration: 2, repeat: reduceMotion ? 0 : Infinity }}
          >
            Limited stock available
          </motion.p>

          <div className="flex items-center justify-center gap-3 mb-8">
            <motion.span
              className="font-display text-5xl font-black text-accent"
              animate={{ scale: reduceMotion ? 1 : [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: reduceMotion ? 0 : Infinity, delay: 0.2 }}
            >
              ₹3999
            </motion.span>
            <motion.span
              className="text-primary-foreground/40 line-through text-xl"
              animate={{ opacity: reduceMotion ? 0.5 : [0.4, 0.6, 0.4] }}
              transition={{ duration: 2, repeat: reduceMotion ? 0 : Infinity }}
            >
              ₹4999
            </motion.span>
          </div>

          <motion.button
            onClick={handleAddToCart}
            whileHover={{ scale: 1.08, boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center justify-center gap-3 rounded-full border-[4px] border-primary-foreground/30 bg-gradient-cta px-14 py-5 font-display text-xl font-bold shadow-hero transition-all"
          >
            <motion.span
              animate={{ x: reduceMotion ? 0 : [0, 5, 0] }}
              transition={{ duration: 1.5, repeat: reduceMotion ? 0 : Infinity }}
            >
              Add to Cart
            </motion.span>
            <motion.div
              animate={{ x: reduceMotion ? 0 : [0, 3, 0] }}
              transition={{ duration: 1.5, repeat: reduceMotion ? 0 : Infinity, delay: 0.1 }}
            >
              <ShoppingCart size={22} />
            </motion.div>
          </motion.button>
        </motion.div>
      </section>
    </div>
  );
};

export default Experience3D;
