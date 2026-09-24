import productImg from "@/assets/product-robot.png";
import { ExternalLink } from "lucide-react";
import ScrollReveal from "./ScrollReveal";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const ExperienceSection = () => {
  const [showBetaMessage, setShowBetaMessage] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  const handleView3D = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setShowBetaMessage(true);
    timeoutRef.current = window.setTimeout(() => setShowBetaMessage(false), 3000);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <section className="py-16 md:py-24 bg-background">
      <ScrollReveal>
        <h2 className="text-center font-display text-3xl md:text-5xl font-bold mb-12">
          Experience <span className="text-brand">ROBOCRAFT</span> live
        </h2>
      </ScrollReveal>

      <ScrollReveal>
        <div className="bg-primary mx-4 md:mx-auto max-w-5xl rounded-3xl py-16 px-8 flex flex-col items-center relative">
          <div className="flex items-center justify-center gap-2 md:gap-4">
            <span className="font-display text-5xl md:text-9xl font-black text-primary-foreground tracking-tighter">
              CH
            </span>
            <motion.img
              src={productImg}
              alt="RoboCraft"
              loading="lazy"
              decoding="async"
              className="w-16 h-16 md:w-28 md:h-28 rounded-2xl"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="font-display text-5xl md:text-9xl font-black text-primary-foreground tracking-tighter">
              TU
            </span>
          </div>
          <span className="font-display text-lg md:text-2xl font-bold text-primary-foreground/60 tracking-widest mt-2">
            BOT
          </span>

          <motion.button
            onClick={handleView3D}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="mt-10 inline-flex min-h-14 items-center gap-2 bg-card text-foreground font-display font-bold text-lg py-4 px-8 rounded-full hover:shadow-lg transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-primary md:px-10"
            aria-describedby={showBetaMessage ? "experience-beta-message" : undefined}
          >
            Experience in 3D <ExternalLink size={18} />
          </motion.button>

          {/* Beta Message */}
          <AnimatePresence>
            {showBetaMessage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/40 backdrop-blur-sm"
              >
                <motion.div
                  className="text-center"
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/20 border border-accent/50 mb-4"
                  >
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    <span className="font-display font-bold text-accent text-sm">BETA 2.0.1</span>
                  </motion.div>
                  <h3 className="font-display text-2xl md:text-4xl font-black text-primary-foreground mb-2">
                    Coming Soon
                  </h3>
                  <p className="font-body text-primary-foreground/70 text-lg">
                    <span id="experience-beta-message" className="sr-only">The 3D experience is coming soon.</span>
                    Currently in Beta
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollReveal>
    </section>
  );
};

export default ExperienceSection;
