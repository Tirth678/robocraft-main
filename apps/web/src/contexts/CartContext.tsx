import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { getBackendUrl } from "@/lib/backend";
import { parseJsonSafely } from "@/lib/apiErrors";
import { toast } from "sonner";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  image: string;
  quantity: number;
  productId?: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (item: Omit<CartItem, "quantity">) => Promise<void>;
  removeFromCart: (id: string) => Promise<void>;
  updateQuantity: (id: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  totalItems: number;
  totalPrice: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isLoading: boolean;
  syncCart: () => Promise<void>;
}

type BackendCartItem = {
  product: {
    id: number;
    name: string;
    price: string | number;
    imageUrl?: string | null;
  };
  quantity: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { token, isAuthenticated } = useAuth();

  const syncCart = useCallback(async () => {
    if (!isAuthenticated || !token) return;

    try {
      setIsLoading(true);
      const response = await fetch(getBackendUrl("/api/cart"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to sync cart");

      const data = await parseJsonSafely<{ success?: boolean; data?: { items?: BackendCartItem[] } }>(response);
      if (data?.success && data.data?.items) {
        setItems(
          (data.data.items as BackendCartItem[]).map((item) => ({
            id: item.product.id.toString(),
            productId: item.product.id,
            name: item.product.name,
            price: Number(item.product.price),
            originalPrice: Number(item.product.price),
            image: item.product.imageUrl || "",
            quantity: item.quantity,
          }))
        );
      }
    } catch (error) {
      console.error("Failed to sync cart:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, token]);

  const addToCart = async (item: Omit<CartItem, "quantity">) => {
    if (!isAuthenticated || !token) {
      toast.error("Please login to add items to cart");
      return;
    }

    try {
      const productId = item.productId || parseInt(item.id);
      const response = await fetch(getBackendUrl("/api/cart/items"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId,
          quantity: 1,
        }),
      });

      if (!response.ok) throw new Error("Failed to add to cart");

      setItems((prev) => {
        const existing = prev.find((i) => i.id === item.id);
        if (existing) {
          return prev.map((i) =>
            i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
          );
        }
        return [...prev, { ...item, quantity: 1 }];
      });
      setIsOpen(true);
      toast.success("Added to cart");
    } catch (error) {
      toast.error("Failed to add to cart");
      console.error(error);
    }
  };

  const removeFromCart = async (id: string) => {
    if (!isAuthenticated || !token) return;

    try {
      const item = items.find((i) => i.id === id);
      if (!item) return;

      const response = await fetch(
        getBackendUrl(`/api/cart/items/${item.productId}`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) throw new Error("Failed to remove from cart");

      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("Removed from cart");
    } catch (error) {
      toast.error("Failed to remove from cart");
      console.error(error);
    }
  };

  const updateQuantity = async (id: string, quantity: number) => {
    if (!isAuthenticated || !token) return;

    if (quantity <= 0) {
      await removeFromCart(id);
      return;
    }

    try {
      const item = items.find((i) => i.id === id);
      if (!item) return;

      const response = await fetch(
        getBackendUrl(`/api/cart/items/${item.productId}`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ quantity }),
        }
      );

      if (!response.ok) throw new Error("Failed to update quantity");

      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, quantity } : i))
      );
    } catch (error) {
      toast.error("Failed to update quantity");
      console.error(error);
    }
  };

  const clearCart = async () => {
    if (!isAuthenticated || !token) return;

    try {
      const response = await fetch(getBackendUrl("/api/cart"), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to clear cart");

      setItems([]);
    } catch (error) {
      toast.error("Failed to clear cart");
      console.error(error);
    }
  };

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
        isOpen,
        setIsOpen,
        isLoading,
        syncCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
};
