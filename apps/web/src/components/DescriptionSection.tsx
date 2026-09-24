import robotClock from "@/assets/robot-clock.jpg";
import ScrollReveal from "./ScrollReveal";
import { motion } from "framer-motion";

const modes = [
  { name: "Clock Mode", desc: "When resting, RoboCraft becomes a clean, calm desk clock" },
  { name: "Focus Mode", desc: "Stay productive with timed focus sessions and gentle reminders" },
  { name: "Gaming Mode", desc: "Play fun hyper-casual games when you need a break" },
];

const DescriptionSection = () => {
  return (
    <section id="about" className="py-16 md:py-24 bg-background overflow-hidden">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <p className="max-w-3xl mx-auto text-center text-muted-foreground text-lg leading-relaxed mb-16">
            He lives on your <strong className="text-foreground">desk</strong>, reacts to your{" "}
            <strong className="text-foreground">touch</strong>, and slowly builds his own{" "}
            <strong className="text-foreground">personality</strong> based on how much you interact with him.
            From focus mode and a clock to fun little games and gentle reminders, RoboCraft brings calm
            and character to your workspace.
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <ScrollReveal direction="left">
            <div className="rounded-3xl overflow-hidden shadow-hero">
              <img
                src={robotClock}
                alt="Clock Mode"
                loading="lazy"
                decoding="async"
                className="w-full aspect-square object-cover"
              />
            </div>
          </ScrollReveal>

          <div className="space-y-6">
            {modes.map((mode, i) => (
              <ScrollReveal key={mode.name} delay={i * 0.15} direction="right">
                <motion.div
                  whileHover={{ x: 8 }}
                  className="p-6 rounded-xl bg-card shadow-card border-l-4 border-l-accent"
                >
                  <h3 className="font-display text-xl font-bold text-accent">{mode.name}</h3>
                  <p className="mt-1 text-muted-foreground font-body">{mode.desc}</p>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>

        <ScrollReveal delay={0.2}>
          <h2 className="text-center font-display text-3xl md:text-5xl font-bold mt-16">
            Modes of <span className="text-brand">ROBOCRAFT</span>
          </h2>
        </ScrollReveal>
      </div>
    </section>
  );
};

export default DescriptionSection;
