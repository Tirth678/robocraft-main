export const motionTimings = {
  fast: 0.24,
  base: 0.4,
  slow: 0.65,
} as const;

export const motionEase = [0.22, 1, 0.36, 1] as const;

export const pageTransition = {
  duration: 0.32,
  ease: motionEase,
} as const;

export const stagger = {
  list: 0.08,
  card: 0.05,
} as const;
