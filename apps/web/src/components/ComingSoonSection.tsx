import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

const ComingSoonSection = () => {
  return (
    <section className="py-24 px-6 bg-gradient-to-b from-background to-primary/5 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full opacity-5"
            style={{
              background: `radial-gradient(circle, hsl(${i * 90}, 80%, 60%), transparent)`,
              width: `${250 + i * 100}px`,
              height: `${250 + i * 100}px`,
              left: `${15 + i * 20}%`,
              top: `${-10 + i * 25}%`,
            }}
            animate={{
              scale: [1, 1.15, 1],
              x: [0, 30, 0],
              y: [0, -25, 0],
            }}
            transition={{
              duration: 7 + i * 1.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.4,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        {/* Beta Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/20 border border-accent/50 mb-6"
        >
          <motion.span
            className="w-2 h-2 rounded-full bg-accent"
            animate={{ scale: [1, 1.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className="font-display font-bold text-accent text-sm">BETA 2.0.1</span>
        </motion.div>

        {/* Main Title */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
          className="font-display text-5xl md:text-7xl font-black mb-6 tracking-tight"
        >
          <motion.span
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="inline-block"
          >
            Coming
          </motion.span>
          {" "}
          <motion.span
            className="text-accent inline-block"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: 0.3 }}
          >
            Soon
          </motion.span>
        </motion.h2>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="font-body text-lg md:text-xl text-foreground/70 mb-8 max-w-2xl mx-auto"
        >
          We're working on exciting new features and editions to make your RoboCraft experience even better. Stay tuned for updates!
        </motion.p>

        {/* Feature Cards */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12"
        >
          {[
            { title: "Happy Edition", desc: "Always smiling companion" },
            { title: "Fury Edition", desc: "The fierce desk guardian" },
            { title: "Emo Edition", desc: "Sensitive & expressive" },
          ].map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.7 + i * 0.1 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="p-6 rounded-2xl bg-card/50 backdrop-blur-sm border border-border hover:border-accent/50 transition-colors"
            >
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }}
              >
                <Sparkles className="w-8 h-8 text-accent mx-auto mb-3" />
              </motion.div>
              <h3 className="font-display font-bold text-foreground mb-2">{item.title}</h3>
              <p className="font-body text-sm text-foreground/60">{item.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA Text */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 1 }}
          className="mt-12"
        >
          <p className="font-body text-foreground/50 text-sm">
            Join our waitlist to be notified when new editions launch
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default ComingSoonSection;
