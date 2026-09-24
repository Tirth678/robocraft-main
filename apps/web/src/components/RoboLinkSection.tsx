import robotLink from "@/assets/robot-link.jpg";
import { Link2 } from "lucide-react";
import ScrollReveal from "./ScrollReveal";

const RoboLinkSection = () => {
  return (
    <section className="py-16 md:py-24 bg-gradient-light-blue overflow-hidden">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <ScrollReveal direction="left" className="order-2 md:order-1">
          <img
            src={robotLink}
            alt="RoboLink messaging feature"
            loading="lazy"
            decoding="async"
            className="w-full rounded-3xl shadow-hero"
          />
        </ScrollReveal>

        <ScrollReveal direction="right" className="order-1 md:order-2 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-3 mb-6">
            <Link2 size={32} className="text-foreground" />
            <h2 className="font-display text-3xl md:text-5xl font-black uppercase tracking-tight">
              ROBO LINK
            </h2>
          </div>
          <p className="text-xl md:text-2xl font-display text-foreground leading-relaxed">
            Send <span className="text-brand">Personalized doodles</span> &amp;{" "}
            <strong>messages</strong> to your <strong>loved ones</strong>
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
};

export default RoboLinkSection;
