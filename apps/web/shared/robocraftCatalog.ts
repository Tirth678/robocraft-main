export interface RoboCraftProductCore {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  originalPrice: number;
  badge: string;
  available: boolean;
  mood: string;
  compareFeatures: string[];
  batteryLife: string;
  connectivity: string;
}

export const ROBOCRAFT_FEATURES = [
  "40+ Expressions",
  "5 Different Moods",
  "Hyper Casual Games",
  "Clock Mode",
  "Focus Mode",
  "Procedural Animations",
  "RoboLink Messaging",
] as const;

export const ROBOCRAFT_SHIPPING = {
  freeShippingThreshold: 2999,
  deliveryWindow: "2-4 business days",
  warranty: "1 year warranty included",
} as const;

export const ROBOCRAFT_PRODUCTS: RoboCraftProductCore[] = [
  {
    id: "robocraft-bot",
    name: "RoboCraft Bot",
    subtitle: "Original Desk Companion",
    price: 3999,
    originalPrice: 4999,
    badge: "Best Seller",
    available: true,
    mood: "Neutral & Adaptive",
    compareFeatures: ["LED Eyes", "Voice Response", "Gesture Control", "App Control"],
    batteryLife: "8 hours",
    connectivity: "Bluetooth 5.0 + WiFi",
  },
  {
    id: "robocraft-happy",
    name: "RoboCraft Happy Edition",
    subtitle: "Always Smiling Companion",
    price: 4499,
    originalPrice: 5999,
    badge: "Coming Soon",
    available: false,
    mood: "Happy & Cheerful",
    compareFeatures: ["Smile Animation", "Laugh Sounds", "Dance Mode", "Mood Lighting"],
    batteryLife: "10 hours",
    connectivity: "Bluetooth 5.0 + WiFi",
  },
  {
    id: "robocraft-angry",
    name: "RoboCraft Fury Edition",
    subtitle: "The Fierce Desk Guardian",
    price: 4499,
    originalPrice: 5999,
    badge: "Coming Soon",
    available: false,
    mood: "Fierce & Intense",
    compareFeatures: ["Red LED Glow", "Growl Sounds", "Guard Mode", "Motion Sensor"],
    batteryLife: "6 hours",
    connectivity: "Bluetooth 5.0",
  },
  {
    id: "robocraft-sad",
    name: "RoboCraft Emo Edition",
    subtitle: "Sensitive & Expressive",
    price: 4299,
    originalPrice: 5499,
    badge: "Coming Soon",
    available: false,
    mood: "Emotional & Sensitive",
    compareFeatures: ["Tear Animation", "Sigh Sounds", "Comfort Mode", "Ambient Sensor"],
    batteryLife: "9 hours",
    connectivity: "Bluetooth 5.0 + WiFi",
  },
  {
    id: "robocraft-clock",
    name: "RoboCraft Time Keeper",
    subtitle: "Smart Clock Mode Included",
    price: 4999,
    originalPrice: 6499,
    badge: "Coming Soon",
    available: false,
    mood: "Punctual & Precise",
    compareFeatures: ["Digital Clock", "Alarm System", "Timer Mode", "World Time"],
    batteryLife: "12 hours",
    connectivity: "Bluetooth 5.0 + WiFi + NFC",
  },
  {
    id: "robocraft-custom",
    name: "RoboCraft Custom Build",
    subtitle: "Design Your Own Bot",
    price: 5999,
    originalPrice: 7999,
    badge: "Coming Soon",
    available: false,
    mood: "Your Choice!",
    compareFeatures: ["Modular Parts", "Custom LED", "DIY Voice", "Open API"],
    batteryLife: "Varies",
    connectivity: "All Options Available",
  },
];

export const ROBOCRAFT_PRODUCT_BY_ID = Object.fromEntries(
  ROBOCRAFT_PRODUCTS.map((product) => [product.id, product]),
) as Record<string, RoboCraftProductCore>;
