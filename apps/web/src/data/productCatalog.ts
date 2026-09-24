import productImg from "@/assets/product-robot.png";
import robotHappy from "@/assets/robot-happy.jpg";
import robotAngry from "@/assets/robot-angry.jpg";
import robotSad from "@/assets/robot-sad.jpg";
import robotClock from "@/assets/robot-clock.jpg";
import robotCustom from "@/assets/robot-custom.jpg";
import {
  ROBOCRAFT_FEATURES,
  ROBOCRAFT_PRODUCT_BY_ID,
  ROBOCRAFT_PRODUCTS,
} from "../../shared/robocraftCatalog";

export interface FrontendProduct {
  id: string;
  name: string;
  subtitle: string;
  description?: string;
  price: number;
  originalPrice: number;
  image: string;
  rating: number;
  reviews: number;
  badge: string;
  badgeColor: string;
  available: boolean;
  isCustom?: boolean;
  createdAt?: string;
}

const productReviewsById: Record<string, { rating: number; reviews: number }> = {
  "robocraft-bot": { rating: 4.8, reviews: 2450 },
  "robocraft-happy": { rating: 4.9, reviews: 1820 },
  "robocraft-angry": { rating: 4.7, reviews: 980 },
  "robocraft-sad": { rating: 4.6, reviews: 750 },
  "robocraft-clock": { rating: 4.9, reviews: 1340 },
  "robocraft-custom": { rating: 5.0, reviews: 420 },
};

export const productImageById: Record<string, string> = {
  "robocraft-bot": productImg,
  "robocraft-happy": robotHappy,
  "robocraft-angry": robotAngry,
  "robocraft-sad": robotSad,
  "robocraft-clock": robotClock,
  "robocraft-custom": robotCustom,
};

export function getProductImage(productId: string) {
  return productImageById[productId] ?? productImg;
}

export const frontendProducts: FrontendProduct[] = ROBOCRAFT_PRODUCTS.map((product) => ({
  ...product,
  description: product.subtitle,
  image: getProductImage(product.id),
  badgeColor: product.available ? "bg-accent" : "bg-foreground",
  rating: productReviewsById[product.id]?.rating ?? 0,
  reviews: productReviewsById[product.id]?.reviews ?? 0,
}));

export const featuredProduct = {
  ...ROBOCRAFT_PRODUCT_BY_ID["robocraft-bot"],
  image: getProductImage("robocraft-bot"),
};

export const featuredProductGallery = [
  getProductImage("robocraft-bot"),
  getProductImage("robocraft-sad"),
  getProductImage("robocraft-angry"),
  getProductImage("robocraft-happy"),
  getProductImage("robocraft-clock"),
];

export const featuredProductFeatures = [...ROBOCRAFT_FEATURES];
