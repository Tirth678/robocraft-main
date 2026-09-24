import { describe, expect, it } from "vitest";

import {
  featuredProduct,
  featuredProductFeatures,
  frontendProducts,
  getProductImage,
} from "@/data/productCatalog";
import {
  ROBOCRAFT_FEATURES,
  ROBOCRAFT_PRODUCTS,
} from "../../shared/robocraftCatalog";

describe("productCatalog", () => {
  it("maps every shared product into frontend product data", () => {
    expect(frontendProducts).toHaveLength(ROBOCRAFT_PRODUCTS.length);

    for (const product of frontendProducts) {
      expect(product.image).toBe(getProductImage(product.id));
      expect(product.badgeColor).toBe(product.available ? "bg-accent" : "bg-foreground");
      expect(product.rating).toBeGreaterThan(0);
      expect(product.reviews).toBeGreaterThan(0);
    }
  });

  it("keeps the featured product and feature list aligned with the shared catalog", () => {
    expect(featuredProduct.id).toBe("robocraft-bot");
    expect(featuredProduct.name).toBe("RoboCraft Bot");
    expect(featuredProductFeatures).toEqual([...ROBOCRAFT_FEATURES]);
  });
});
