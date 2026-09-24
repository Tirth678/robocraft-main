import { motion, useReducedMotion } from "framer-motion";
import { ReactNode } from "react";
import { motionEase, motionTimings } from "@/lib/motion";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "left" | "right" | "none";
  distance?: number;
}

const directionMap = {
  up: { y: 1, x: 0 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  none: { x: 0, y: 0 },
};

const ScrollReveal = ({
  children,
  className,
  delay = 0,
  direction = "up",
  distance = 32,
}: ScrollRevealProps) => {
  const reduceMotion = useReducedMotion();
  const baseOffset = directionMap[direction];
  const offset = {
    x: baseOffset.x * distance,
    y: baseOffset.y * distance,
  };

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: reduceMotion ? motionTimings.fast : motionTimings.base,
        delay,
        ease: motionEase,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default ScrollReveal;
