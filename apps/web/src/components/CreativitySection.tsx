import robotCustom from "@/assets/robot-custom.jpg";
import ScrollReveal from "./ScrollReveal";
import { motion } from "framer-motion";

const CreativitySection = () => {
  return (
    <section className="relative overflow-hidden">
      <div className="bg-gradient-blue py-16 md:py-24">
        <ScrollReveal>
          <div className="container mx-auto px-4 text-center">
            <h2 className="font-display text-3xl md:text-6xl font-black text-primary-foreground italic">
              Unleash Your
            </h2>
            <motion.h2
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="font-display text-5xl md:text-8xl font-black text-primary-foreground mt-2 tracking-tighter"
            >
              CREATIVITY
            </motion.h2>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.3}>
          <div className="mt-12 flex justify-center">
            <img
              src={robotCustom}
              alt="Customized RoboCraft"
              loading="lazy"
              decoding="async"
              className="w-full max-w-4xl rounded-3xl shadow-hero mx-4"
            />
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.4}>
          <p className="text-center mt-8 text-primary-foreground/90 text-lg md:text-xl font-body px-4">
            RoboCraft comes in a white body so you can customise and give him any{" "}
            <span className="text-brand font-bold">MAKEOVER</span>
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
};

export default CreativitySection;
