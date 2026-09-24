import { useState, useEffect } from "react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Check, Package, Tag, X, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import FooterSection from "@/components/FooterSection";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { getProductImage } from "@/data/productCatalog";
import { getBackendUrl } from "@/lib/backend";
import { getApiErrorMessage, getSafeErrorMessage, parseJsonSafely } from "@/lib/apiErrors";
import PaymentModal from "@/components/PaymentModal";

const shippingSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(50, "First name must be less than 50 characters"),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required")
    .max(50, "Last name must be less than 50 characters"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .max(255, "Email must be less than 255 characters"),
  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .regex(/^[+]?[\d\s-]{10,15}$/, "Please enter a valid phone number"),
  address: z
    .string()
    .trim()
    .min(1, "Address is required")
    .max(200, "Address must be less than 200 characters"),
  city: z
    .string()
    .trim()
    .min(1, "City is required")
    .max(100, "City must be less than 100 characters"),
  state: z
    .string()
    .trim()
    .min(1, "State is required")
    .max(100, "State must be less than 100 characters"),
  zipCode: z
    .string()
    .trim()
    .min(1, "ZIP code is required")
    .regex(/^[A-Za-z0-9\s-]{3,10}$/, "Please enter a valid ZIP code"),
  country: z
    .string()
    .trim()
    .min(1, "Country is required")
    .max(100, "Country must be less than 100 characters"),
});

type ShippingFormData = z.infer<typeof shippingSchema>;

interface OrderConfirmation {
  items: { id: string; name: string; price: number; quantity: number }[];
  subtotal: number;
  tax: number;
  total: number;
  customerName: string;
  customerEmail: string;
  shippingAddress: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  orderId: string;
  orderDate: string;
}

const CREATE_ORDER_URL = getBackendUrl("/api/create-order");

const CheckoutPage = () => {
  useEffect(() => {
    document.title = "Checkout - Secure Payment | RoboCraft Studio";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "Complete your RoboCraft purchase securely. Enter your shipping details and finalize your order."
      );
    }
  }, []);

  const { items, totalPrice, clearCart } = useCart();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<number | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoDiscount, setPromoDiscount] = useState<{ amount: number; code: string } | null>(null);
  const [appliedPromos, setAppliedPromos] = useState<Record<number, { discount: number; code: string }>>({});

  const form = useForm<ShippingFormData>({
    resolver: zodResolver(shippingSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      country: "India",
    },
  });

  const onSubmit = async (data: ShippingFormData) => {
    if (!token) {
      toast.error("Please login to place an order");
      return;
    }

    setIsSubmitting(true);
    try {
      // Create order
      const orderResponse = await fetch(getBackendUrl("/api/orders"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!orderResponse.ok) {
        throw new Error("Failed to create order");
      }

      const orderData = await parseJsonSafely<{ success?: boolean; data?: { id: number }; error?: string }>(orderResponse);
      if (!orderData.success || !orderData.data) {
        throw new Error(getApiErrorMessage(orderData, "We couldn't create your order. Please try again."));
      }

      const orderId = orderData.data.id;
      setCurrentOrderId(orderId);

      // Calculate total with tax (using discounted total if promo applied)
      const tax = Math.round(discountedTotal * 0.18);
      const total = discountedTotal + tax;

      // Show payment modal
      setShowPaymentModal(true);

      // Store order confirmation data for later
      setOrderConfirmation({
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
        subtotal: Math.round(discountedTotal),
        tax,
        total,
        customerName: `${data.firstName} ${data.lastName}`,
        customerEmail: data.email,
        shippingAddress: {
          address: data.address,
          city: data.city,
          state: data.state,
          zipCode: data.zipCode,
          country: data.country,
        },
        orderId: orderId.toString(),
        orderDate: new Date().toLocaleDateString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      });
    } catch (error) {
      console.error("Order creation failed:", error);
      toast.error("Failed to create order", {
        description: getSafeErrorMessage(error, "Please try again later."),
      });
      setIsSubmitting(false);
    }
  };

  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    await clearCart();
    toast.success("Order placed successfully!");
  };

  const handleApplyPromo = async (productId: number) => {
    if (!promoCode.trim()) {
      toast.error("Enter a promo code");
      return;
    }
    setPromoLoading(true);
    try {
      const res = await fetch(getBackendUrl("/api/products/validate-promo"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, promoCode: promoCode.trim() }),
      });
      const payload = await parseJsonSafely<{ success?: boolean; data?: { valid: boolean; discount: number; originalPrice: number; discountedPrice: number; promoCode: string; message?: string }; error?: string }>(res);
      if (res.ok && payload?.success && payload.data?.valid) {
        setAppliedPromos((prev) => ({
          ...prev,
          [productId]: { discount: payload.data!.discount, code: payload.data!.promoCode },
        }));
        toast.success(`Promo "${payload.data.promoCode}" applied! ${payload.data.discount}% off`);
        setPromoCode("");
      } else {
        const errorMessage = payload?.data?.message || payload?.error || "Invalid promo code";
        toast.error(String(errorMessage));
      }
    } catch {
      toast.error("Failed to validate promo code");
    } finally {
      setPromoLoading(false);
    }
  };

  const handleRemovePromo = (productId: number) => {
    setAppliedPromos((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const discountedTotal = items.reduce((sum, item) => {
    const promo = appliedPromos[Number(item.id.replace("product-", ""))];
    if (promo) {
      const itemTotal = item.price * item.quantity;
      return sum + itemTotal - (itemTotal * promo.discount) / 100;
    }
    return sum + item.price * item.quantity;
  }, 0);

  const promoSavings = totalPrice - discountedTotal;

  if (items.length === 0 && !orderConfirmation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Package size={64} className="mx-auto text-muted-foreground" />
          <h1 className="font-display text-2xl font-bold">Your cart is empty</h1>
          <p className="text-muted-foreground">Add some items to checkout</p>
          <Link to="/">
            <Button className="mt-4">
              <ArrowLeft size={16} className="mr-2" /> Back to Shop
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (orderConfirmation) {
    return (
      <div className="min-h-screen bg-background py-8">
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {/* Success Header */}
            <div className="text-center space-y-3 py-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto"
              >
                <Check size={32} className="text-accent" />
              </motion.div>
              <h1 className="font-display text-3xl font-black">Order Confirmed!</h1>
              <p className="text-muted-foreground text-sm">
                Order #{orderConfirmation.orderId.slice(0, 8).toUpperCase()} • {orderConfirmation.orderDate}
              </p>
            </div>

            {/* Items */}
            <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
              <h2 className="font-display font-bold text-lg flex items-center gap-2">
                <Package size={18} /> Items Ordered
              </h2>
              <div className="divide-y divide-border">
                {orderConfirmation.items.map((item, i) => (
                  <div key={i} className="flex gap-4 py-3 first:pt-0 last:pb-0">
                    <img
                      src={getProductImage(item.id)}
                      alt={item.name}
                      className="w-14 h-14 rounded-lg object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-display font-bold text-sm truncate">{item.name}</h4>
                      <p className="text-muted-foreground text-xs">Qty: {item.quantity}</p>
                    </div>
                    <span className="font-display font-bold text-sm">₹{item.price * item.quantity}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-4 space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span><span>₹{orderConfirmation.subtotal}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax (18%)</span><span>₹{orderConfirmation.tax}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Shipping</span><span className="text-accent">Free</span>
                </div>
                <div className="flex justify-between font-display font-bold text-lg pt-2 border-t border-border">
                  <span>Total</span><span className="text-accent">₹{orderConfirmation.total}</span>
                </div>
              </div>
            </div>

            {/* Shipping & Contact */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-card rounded-2xl border border-border p-5 space-y-2">
                <h3 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wider">Shipping To</h3>
                <p className="font-display font-bold">{orderConfirmation.customerName}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {orderConfirmation.shippingAddress.address}<br />
                  {orderConfirmation.shippingAddress.city}, {orderConfirmation.shippingAddress.state} {orderConfirmation.shippingAddress.zipCode}<br />
                  {orderConfirmation.shippingAddress.country}
                </p>
              </div>
              <div className="bg-card rounded-2xl border border-border p-5 space-y-2">
                <h3 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wider">Order Details</h3>
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Status:</span> <span className="text-accent font-bold">Pending</span></p>
                  <p><span className="text-muted-foreground">Email:</span> {orderConfirmation.customerEmail}</p>
                  <p><span className="text-muted-foreground">Est. Delivery:</span> 2–3 business days</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={() => navigate("/")} variant="secondary" className="rounded-full px-8">
                Continue Shopping
              </Button>
              <Button onClick={() => navigate("/track-order")} className="rounded-full px-8">
                Track Order
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      <div>
        <Navbar />
        {/* Spacer for fixed Navbar */}
        <div className="h-16 md:h-20" />
        
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <h1 className="font-display text-3xl md:text-4xl font-black mb-8">Checkout</h1>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Shipping Form */}
          <div className="space-y-6">
            <div className="bg-card rounded-2xl border border-border p-6">
              <h2 className="font-display text-xl font-bold mb-6">Shipping Information</h2>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input placeholder="John" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Doe" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="john@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="+91 98765 43210" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input placeholder="123 Main Street, Apt 4B" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="Mumbai" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State</FormLabel>
                          <FormControl>
                            <Input placeholder="Maharashtra" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="zipCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ZIP Code</FormLabel>
                          <FormControl>
                            <Input placeholder="400001" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Country</FormLabel>
                          <FormControl>
                            <Input placeholder="India" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-14 rounded-full bg-gradient-cta text-primary-foreground font-display font-bold text-lg border-[3px] border-foreground shadow-hero hover:scale-[1.02] active:scale-[0.98] transition-transform mt-6"
                  >
                    {isSubmitting ? "Processing..." : "Place Order & Pay"}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    Your order will be processed and shipped within 2-3 business days after payment confirmation.
                  </p>
                </form>
              </Form>
            </div>
          </div>

          {/* Order Summary */}
          <div className="space-y-6">
            <div className="bg-card rounded-2xl border border-border p-6 sticky top-8">
              <h2 className="font-display text-xl font-bold mb-6">Order Summary</h2>

              <div className="space-y-4 max-h-80 overflow-y-auto">
                {items.map((item) => {
                  const numericId = Number(item.id.replace("product-", ""));
                  const appliedPromo = appliedPromos[numericId];
                  return (
                    <div key={item.id} className="flex gap-4">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                      <div className="flex-1">
                        <h4 className="font-display font-bold text-sm">{item.name}</h4>
                        <p className="text-muted-foreground text-sm">Qty: {item.quantity}</p>
                        {appliedPromo && (
                          <p className="text-accent text-xs font-bold mt-1 flex items-center gap-1">
                            <Tag size={10} /> {appliedPromo.code} (-{appliedPromo.discount}%)
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        {appliedPromo ? (
                          <>
                            <span className="font-display font-bold text-sm line-through text-muted-foreground">
                              ₹{item.price * item.quantity}
                            </span>
                            <span className="font-display font-bold text-sm block text-accent">
                              ₹{Math.round((item.price * item.quantity * (100 - appliedPromo.discount)) / 100)}
                            </span>
                          </>
                        ) : (
                          <span className="font-display font-bold">
                            ₹{item.price * item.quantity}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Promo Code Input */}
              <div className="mt-4 flex gap-2">
                <div className="relative flex-1">
                  <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Promo code"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && items.length > 0) {
                        const firstId = Number(items[0].id.replace("product-", ""));
                        handleApplyPromo(firstId);
                      }
                    }}
                    className="pl-9 text-sm uppercase"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={promoLoading || !promoCode.trim()}
                  onClick={() => {
                    if (items.length > 0) {
                      const firstId = Number(items[0].id.replace("product-", ""));
                      handleApplyPromo(firstId);
                    }
                  }}
                  className="rounded-lg px-4"
                >
                  {promoLoading ? <Loader2 size={14} className="animate-spin" /> : "Apply"}
                </Button>
              </div>

              {/* Applied Promos List */}
              {Object.keys(appliedPromos).length > 0 && (
                <div className="mt-2 space-y-1">
                  {Object.entries(appliedPromos).map(([pid, promo]) => (
                    <div key={pid} className="flex items-center justify-between text-xs">
                      <span className="text-accent font-bold flex items-center gap-1">
                        <Tag size={10} /> {promo.code} (-{promo.discount}%)
                      </span>
                      <button
                        onClick={() => handleRemovePromo(Number(pid))}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-border mt-6 pt-6 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{totalPrice}</span>
                </div>
                {promoSavings > 0 && (
                  <div className="flex justify-between text-sm text-accent">
                    <span className="font-bold">Promo Discount</span>
                    <span className="font-bold">-₹{Math.round(promoSavings)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="text-accent">Free</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax (18%)</span>
                  <span>₹{Math.round(discountedTotal * 0.18)}</span>
                </div>
                <div className="border-t border-border pt-3 flex justify-between">
                  <span className="font-display font-bold">Total</span>
                  <span className="font-display text-2xl font-black text-accent">
                    ₹{Math.round(discountedTotal + discountedTotal * 0.18)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Payment Modal */}
      {currentOrderId && (
        <PaymentModal
          isOpen={showPaymentModal}
          orderId={currentOrderId}
          amount={orderConfirmation?.total || 0}
          onClose={() => {
            setShowPaymentModal(false);
            setOrderConfirmation(null);
            navigate("/");
          }}
          onSuccess={handlePaymentSuccess}
        />
      )}
      <FooterSection />
    </div>
  );
};

export default CheckoutPage;
