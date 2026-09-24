import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Instagram, Twitter, Mail, Heart, Sparkles, Rocket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import productImg from "@/assets/product-robot.png";
import Navbar from "@/components/Navbar";
import FooterSection from "@/components/FooterSection";

const milestones = [
  { year: "2024", title: "The Idea", desc: "RoboCraft was born from a passion for making tech personal and fun." },
  { year: "2025", title: "First Prototype", desc: "Our first desk companion robot came to life with 10 expressions." },
  { year: "2026", title: "Launch", desc: "RoboCraft Bot launched with 40+ expressions, games, and more." },
  { year: "Soon", title: "What's Next?", desc: "New editions, custom builds, and a growing community of bot lovers." },
];

const AboutPage = () => {
  useEffect(() => {
    document.title = "About RoboCraft - Our Story and Mission | RoboCraft Studio";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "Learn about RoboCraft Studio, our journey, milestones, and our mission to create the best desk companion robots that keep you company and boost your productivity."
      );
    }
  }, []);

  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      <div>
        <Navbar />
        {/* Spacer for fixed Navbar */}
        <div className="h-16 md:h-20" />

      {/* Hero */}
      <section className="container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-3xl bg-foreground text-primary-foreground p-8 md:p-16"
          >
            <div className="absolute inset-0 bg-gradient-cta opacity-10" />
            <div className="absolute -right-20 -bottom-20 w-60 h-60 rounded-full bg-accent/10 blur-3xl" />

            <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
              <motion.img
                src={productImg}
                alt="RoboCraft"
                className="w-32 h-32 md:w-44 md:h-44 rounded-2xl"
                animate={{ rotate: reduceMotion ? 0 : [0, 3, -3, 0] }}
                transition={{ duration: 5, repeat: reduceMotion ? 0 : Infinity }}
              />
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Heart size={18} className="text-accent" />
                  <span className="font-display font-bold text-accent text-sm uppercase tracking-wider">Our Story</span>
                </div>
                <h2 className="font-display text-3xl md:text-4xl font-black mb-3">
                  We Make Robots <br /> You'll Actually Love
                </h2>
                <p className="text-primary-foreground/60 font-body leading-relaxed">
                  RoboCraft started with a simple question: What if your desk had a tiny companion that could express emotions, 
                  play games, and keep you company? That question became our mission.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Timeline */}
      <section className="container mx-auto px-4 py-12">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="font-display text-2xl md:text-3xl font-black text-center mb-12"
        >
          Our <span className="text-brand">Journey</span>
        </motion.h2>

        <div className="max-w-2xl mx-auto space-y-0">
          {milestones.map((m, i) => (
            <motion.div
              key={m.year}
              initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="flex gap-6 relative"
            >
              {/* Line */}
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-display font-bold text-xs flex-shrink-0">
                  {m.year === "Soon" ? <Sparkles size={16} /> : m.year.slice(2)}
                </div>
                {i < milestones.length - 1 && <div className="w-0.5 h-full bg-border min-h-[60px]" />}
              </div>

              <div className="pb-10">
                <span className="font-display font-bold text-muted-foreground text-sm">{m.year}</span>
                <h3 className="font-display font-bold text-lg mt-1">{m.title}</h3>
                <p className="text-muted-foreground font-body text-sm mt-1">{m.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Coming Soon - Team */}
      <section className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center bg-secondary rounded-3xl p-10 md:p-16"
        >
          <motion.div
            animate={{ y: reduceMotion ? 0 : [0, -8, 0] }}
            transition={{ duration: 3, repeat: reduceMotion ? 0 : Infinity }}
          >
            <Rocket size={48} className="mx-auto text-accent mb-4" />
          </motion.div>
          <h2 className="font-display text-2xl md:text-3xl font-black mb-3">
            More <span className="text-brand">Coming Soon</span>
          </h2>
          <p className="text-muted-foreground font-body max-w-md mx-auto mb-8">
            We're expanding our team and building something incredible. Stay connected to be part of the RoboCraft family.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
            {[
              { label: "Team stories", desc: "Meet the makers", soon: true },
              { label: "Behind the scenes", desc: "How we build", soon: true },
              { label: "Community", desc: "Join the club", soon: true },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-4 rounded-xl border border-border bg-card"
              >
                <h4 className="font-display font-bold text-sm">{item.label}</h4>
                <p className="text-muted-foreground text-xs font-body mt-1">{item.desc}</p>
                <span className="inline-block mt-2 text-xs font-display font-bold text-accent">Coming Soon</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Contact */}
      <section className="container mx-auto px-4 py-12 pb-20">
        <div className="max-w-2xl mx-auto text-center">
          <h3 className="font-display text-xl font-bold mb-6">Get in Touch</h3>
          <div className="flex justify-center gap-4">
            {[
              { icon: Instagram, label: "Instagram" },
              { icon: Twitter, label: "Twitter" },
              { icon: Mail, label: "Email" },
            ].map((social) => (
              <motion.a
                key={social.label}
                href="#"
                whileHover={{ scale: 1.1, y: -3 }}
                whileTap={{ scale: 0.95 }}
                className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                aria-label={social.label}
              >
                <social.icon size={20} />
              </motion.a>
            ))}
          </div>
        </div>
      </section>
      </div>
      <FooterSection />
    </div>
  );
};

export default AboutPage;
