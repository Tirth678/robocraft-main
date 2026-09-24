import { motion, useReducedMotion } from "framer-motion";
import heroImg from "@/assets/hero-robot.png";
import { motionEase } from "@/lib/motion";

const HeroSection = () => {
  const reduceMotion = useReducedMotion();

  return (
    <section id="home" className="relative min-h-screen overflow-hidden">
      <img
        src={heroImg}
        alt="RoboCraft desk companion robot"
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-hero-overlay" />

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {[...Array(2)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full opacity-5"
            style={{
              background: `radial-gradient(circle, hsl(${i * 120}, 80%, 60%), transparent)`,
              width: `${300 + i * 150}px`,
              height: `${300 + i * 150}px`,
              left: `${10 + i * 20}%`,
              top: `${-20 + i * 30}%`,
            }}
            animate={{
              scale: reduceMotion ? 1 : [1, 1.15, 1],
              x: reduceMotion ? 0 : [0, 36, 0],
              y: reduceMotion ? 0 : [0, -24, 0],
            }}
            transition={{
              duration: 9 + i * 2,
              repeat: reduceMotion ? 0 : Infinity,
              ease: motionEase,
              delay: i * 0.5,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-end min-h-screen px-6 md:px-16 pb-20 pt-24">
        <motion.h1
          initial={{ opacity: 0, y: 60, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, ease: motionEase, type: "spring", stiffness: 80 }}
          className="font-display text-5xl md:text-8xl font-black tracking-tight text-primary-foreground uppercase"
        >
          <motion.span
            animate={{ y: reduceMotion ? 0 : [0, -4, 0] }}
            transition={{ duration: 3, repeat: reduceMotion ? 0 : Infinity, ease: motionEase }}
            className="inline-block"
          >
            ROBOCRAFT
          </motion.span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease: "easeOut" }}
          className="mt-4 text-lg md:text-2xl text-primary-foreground/80 font-body"
        >
          <motion.span
            animate={{ opacity: reduceMotion ? 1 : [0.8, 1, 0.8] }}
            transition={{ duration: 2.2, repeat: reduceMotion ? 0 : Infinity }}
          >
            Your Tiny Desk Companion
          </motion.span>
        </motion.p>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: reduceMotion ? 0 : [0, 10, 0] }}
            transition={{ duration: 1.6, repeat: reduceMotion ? 0 : Infinity }}
            className="w-6 h-10 rounded-full border-2 border-primary-foreground/40 flex justify-center pt-2"
          >
            <motion.div
              className="w-1 h-2 bg-primary-foreground/60 rounded-full"
              animate={{
                y: reduceMotion ? 0 : [0, 6, 0],
                opacity: reduceMotion ? 0.8 : [0.6, 1, 0.6],
              }}
              transition={{ duration: 1.6, repeat: reduceMotion ? 0 : Infinity }}
            />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
