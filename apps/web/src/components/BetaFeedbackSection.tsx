import { motion } from "framer-motion";
import { Mail, Send, CheckCircle, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getBackendUrl } from "@/lib/backend";
import { getApiErrorMessage, parseJsonSafely } from "@/lib/apiErrors";

const FEEDBACK_URL = getBackendUrl("/api/beta-feedback");

const BetaFeedbackSection = () => {
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    
    try {
      const response = await fetch(FEEDBACK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          feedback: feedback.trim() || null,
        }),
      });

      const payload = await parseJsonSafely(response);

      if (!response.ok) {
        toast.error(getApiErrorMessage(payload, "We couldn't submit your feedback. Please try again."));
        setIsSubmitting(false);
        return;
      }

      setIsSubmitted(true);
      setEmail("");
      setFeedback("");
      toast.success("Thank you for your feedback!");
      
      // Reset after 3 seconds
      setTimeout(() => {
        setIsSubmitted(false);
      }, 3000);
    } catch (error) {
      console.error("Feedback submission failed:", error);
      toast.error("We couldn't submit your feedback. Please try again.");
      setIsSubmitting(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="py-20 px-6 bg-gradient-to-b from-background via-primary/5 to-background relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute w-96 h-96 rounded-full opacity-5"
          style={{
            background: "radial-gradient(circle, hsl(280, 80%, 60%), transparent)",
            left: "-10%",
            top: "-10%",
          }}
          animate={{
            scale: [1, 1.2, 1],
            x: [0, 30, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute w-96 h-96 rounded-full opacity-5"
          style={{
            background: "radial-gradient(circle, hsl(40, 80%, 60%), transparent)",
            right: "-10%",
            bottom: "-10%",
          }}
          animate={{
            scale: [1, 1.2, 1],
            x: [0, -30, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5,
          }}
        />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 200 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/30 mb-4"
          >
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-display font-bold text-accent text-xs">BETA FEEDBACK</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="font-display text-4xl md:text-5xl font-black mb-4"
          >
            Help us improve <motion.span
              className="text-accent inline-block"
              animate={{ rotate: [0, 2, -2, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              RoboCraft
            </motion.span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="font-body text-foreground/60 text-lg"
          >
            Your feedback helps us build the perfect desk companion. Share your thoughts and suggestions!
          </motion.p>
        </motion.div>

        {/* Feedback Form */}
        <motion.form
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, type: "spring", stiffness: 100 }}
          onSubmit={handleSubmit}
          className="relative"
        >
          <div className="p-8 rounded-3xl bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl border border-border/50 shadow-lg hover:shadow-xl transition-shadow"
          >
            <div className="flex flex-col gap-3">
              {/* Email Input */}
              <motion.div
                className="relative"
                animate={{ y: isSubmitted ? -5 : 0 }}
              >
                <div className="absolute left-4 top-4 text-foreground/40">
                  <Mail size={20} />
                </div>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting || isSubmitted}
                  className="w-full pl-12 pr-4 py-4 rounded-xl bg-background/50 border border-border/50 text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all disabled:opacity-50"
                />
              </motion.div>

              {/* Feedback Textarea */}
              <motion.div
                className="relative"
                animate={{ y: isSubmitted ? -5 : 0 }}
              >
                <textarea
                  placeholder="Share your feedback (optional)"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  disabled={isSubmitting || isSubmitted}
                  rows={4}
                  className="w-full px-4 py-4 rounded-xl bg-background/50 border border-border/50 text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all disabled:opacity-50 resize-none"
                />
              </motion.div>

              {/* Submit Button */}
              <motion.button
                type="submit"
                disabled={isSubmitting || isSubmitted}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-accent to-accent/80 text-accent-foreground font-display font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitted ? (
                  <>
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 200 }}
                    >
                      <CheckCircle size={20} />
                    </motion.div>
                    <span>Sent!</span>
                  </>
                ) : isSubmitting ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
                    >
                      <LoaderCircle size={20} />
                    </motion.div>
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    <span>Send Feedback</span>
                  </>
                )}
              </motion.button>
            </div>

            {/* Success Message */}
            {isSubmitted && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-4 p-4 rounded-lg bg-accent/10 border border-accent/30 text-center"
              >
                <p className="font-body text-sm text-accent font-semibold">
                  Thank you! We'll review your feedback shortly.
                </p>
              </motion.div>
            )}
          </div>

          {/* Info Text */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="text-center font-body text-xs text-foreground/40 mt-6"
          >
            We respect your privacy. Your email will only be used for beta feedback purposes.
          </motion.p>
        </motion.form>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-3 gap-4 mt-12"
        >
          {[
            { number: "2.0.1", label: "Current Version" },
            { number: "40+", label: "Expressions" },
            { number: "5", label: "Moods" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              whileHover={{ scale: 1.05 }}
              className="text-center p-4 rounded-xl bg-card/30 border border-border/30 hover:border-accent/30 transition-colors"
            >
              <motion.p
                className="font-display text-2xl font-black text-accent"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
              >
                {stat.number}
              </motion.p>
              <p className="font-body text-xs text-foreground/60 mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default BetaFeedbackSection;
