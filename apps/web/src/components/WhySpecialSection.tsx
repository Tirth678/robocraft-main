import robotSad from "@/assets/robot-sad.jpg";
import robotAngry from "@/assets/robot-angry.jpg";
import robotHappy from "@/assets/robot-happy.jpg";
import robotIrritated from "@/assets/robot-irritated.jpg";
import { ArrowRight } from "lucide-react";
import ScrollReveal from "./ScrollReveal";
import { motion } from "framer-motion";

const expressions = [
  { img: robotSad, action: "Ignore him", result: "he sulks" },
  { img: robotAngry, action: "avoids him", result: "get's angry" },
  { img: robotHappy, action: "pat him", result: "he's happy" },
  { img: robotIrritated, action: "Disturb him", result: "He's irritated" },
];

const WhySpecialSection = () => {
  return (
    <section className="py-16 md:py-24 bg-secondary">
      <ScrollReveal>
        <h2 className="text-center font-display text-3xl md:text-5xl font-bold mb-12">
          Why is <span className="text-brand">ROBOCRAFT</span> Special?
        </h2>
      </ScrollReveal>

      <div className="container mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6">
        {expressions.map((expr, i) => (
          <ScrollReveal key={i} delay={i * 0.1}>
            <motion.div className="group cursor-pointer" whileHover={{ y: -8 }}>
              <div className="rounded-2xl overflow-hidden shadow-card bg-card transition-transform">
                <img
                  src={expr.img}
                  alt={expr.result}
                  loading="lazy"
                  decoding="async"
                  className="w-full aspect-square object-cover"
                />
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-sm md:text-base font-body font-medium">
                <span>{expr.action}</span>
                <ArrowRight size={16} className="text-accent" />
                <span>{expr.result}</span>
              </div>
            </motion.div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
};

export default WhySpecialSection;
