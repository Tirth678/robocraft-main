import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { parseJsonSafely } from "@/lib/apiErrors";
import { getBackendUrl } from "@/lib/backend";

const cache = new Map<string, string>();
const PRODUCT_DESCRIPTION_URL = getBackendUrl("/api/generate-product-description");

export function useProductDescription(product: {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  available: boolean;
  badge: string;
}) {
  const [description, setDescription] = useState<string | null>(
    cache.get(product.id) ?? null
  );
  const [loading, setLoading] = useState(false);

  const fetchDescription = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(PRODUCT_DESCRIPTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productName: product.name,
          subtitle: product.subtitle,
          price: product.price,
          available: product.available,
          badge: product.badge,
        }),
      });

      const data = await parseJsonSafely<{ error?: string; description?: string }>(response);

      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Failed to generate description");
      }

      if (data?.error) {
        if (data.error.includes("Rate limit")) {
          toast.error("Too many requests", { description: "Please wait a moment and try again." });
        } else if (data.error.includes("Payment required")) {
          toast.error("AI credits exhausted", { description: "Please add funds to continue." });
        } else {
          toast.error("Failed to generate description");
        }
        return;
      }
      const desc = data?.description ?? "";
      cache.set(product.id, desc);
      setDescription(desc);
    } catch (e) {
      console.error("Failed to generate description:", e);
      toast.error("Failed to generate description", { description: "Please try again later." });
    } finally {
      setLoading(false);
    }
  }, [product.id, product.name, product.subtitle, product.price, product.available, product.badge]);

  useEffect(() => {
    setDescription(cache.get(product.id) ?? null);
    setLoading(false);
  }, [product.id]);

  const regenerate = useCallback(() => {
    cache.delete(product.id);
    setDescription(null);
    fetchDescription();
  }, [product.id, fetchDescription]);

  return { description, loading, generateDescription: fetchDescription, regenerate };
}
