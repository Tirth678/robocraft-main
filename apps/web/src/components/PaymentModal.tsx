import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, AlertCircle, CheckCircle, X, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBackendUrl } from "@/lib/backend";
import { getApiErrorMessage, parseJsonSafely } from "@/lib/apiErrors";
import { useAuth } from "@/contexts/AuthContext";
import {
  loadRazorpayCheckout,
  openRazorpayCheckout,
  type RazorpayPaymentResponse,
} from "@/lib/razorpay";
import { toast } from "sonner";

interface PaymentModalProps {
  isOpen: boolean;
  orderId: string;
  amount: number;
  onClose: () => void;
  onSuccess: () => void;
}

type PaymentStatus = "pending" | "processing" | "success" | "failed" | "expired";

interface PaymentIntent {
  orderId?: string;
  paymentMode?: "razorpay" | "mock";
  amount?: number;
  currency?: string;
  keyId?: string | null;
  razorpayOrderId?: string;
  paymentIntentId?: string;
  status?: string;
  clientSecret?: string;
  prefill?: { name?: string; email?: string; contact?: string };
}

const PAYMENT_WINDOW_SECONDS = 600;

const PaymentModal = ({ isOpen, orderId, amount, onClose, onSuccess }: PaymentModalProps) => {
  const [status, setStatus] = useState<PaymentStatus>("pending");
  const [timeLeft, setTimeLeft] = useState(PAYMENT_WINDOW_SECONDS);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const { token } = useAuth();

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const checkoutOpenedRef = useRef(false);
  const verifyingRef = useRef(false);

  const isRazorpay = intent?.paymentMode === "razorpay";

  // Confirm the payment with the backend, which checks Razorpay's signature
  // before it marks the order paid.
  const verifyPayment = useCallback(
    async (response: RazorpayPaymentResponse) => {
      if (!token || verifyingRef.current) return;
      verifyingRef.current = true;
      setStatus("processing");

      try {
        const res = await fetch(getBackendUrl("/api/payments/verify"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            orderId,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          }),
        });

        const data = await parseJsonSafely<{ success?: boolean; error?: string }>(res);
        if (res.ok && data?.success) {
          setStatus("success");
          toast.success("Payment successful!");
          setTimeout(() => onSuccessRef.current(), 1200);
        } else {
          setStatus("failed");
          toast.error(getApiErrorMessage(data, "We couldn't verify the payment"));
        }
      } catch (error) {
        console.error("Payment verification failed:", error);
        setStatus("failed");
        toast.error("We couldn't verify the payment. Contact support if you were charged.");
      } finally {
        verifyingRef.current = false;
      }
    },
    [orderId, token]
  );

  const openCheckout = useCallback(() => {
    if (!intent?.keyId || !intent.razorpayOrderId) {
      setStatus("failed");
      toast.error("Payment provider is not configured");
      return;
    }

    const checkout = openRazorpayCheckout({
      key: intent.keyId,
      amount: Math.round((intent.amount ?? amount) * 100),
      currency: intent.currency ?? "INR",
      name: "RoboCraft Studio",
      description: `Order #${orderId.slice(0, 8).toUpperCase()}`,
      order_id: intent.razorpayOrderId,
      prefill: intent.prefill,
      notes: { orderId },
      theme: { color: "#a855f7" },
      handler: (response) => {
        void verifyPayment(response);
      },
      modal: {
        // Closing the sheet is not a failure: the customer can pay again while
        // the order is still pending.
        ondismiss: () => setStatus("pending"),
      },
    });

    if (!checkout) {
      setStatus("failed");
      toast.error("Razorpay checkout could not be loaded");
      return;
    }
    checkout.open();
  }, [amount, intent, orderId, verifyPayment]);

  // Fresh order / reopen: drop any state from the previous attempt.
  useEffect(() => {
    if (!isOpen) return;
    checkoutOpenedRef.current = false;
    verifyingRef.current = false;
    setIntent(null);
    setStatus("pending");
    setTimeLeft(PAYMENT_WINDOW_SECONDS);
  }, [isOpen, orderId]);

  // Ask the backend for a payment intent (a Razorpay order, or mock mode).
  useEffect(() => {
    if (!isOpen || !token || !orderId) return;

    let cancelled = false;

    const createIntent = async () => {
      setStatus("processing");
      try {
        const response = await fetch(getBackendUrl("/api/payments/create-intent"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ orderId, amount }),
        });

        const data = await parseJsonSafely<{
          success?: boolean;
          data?: PaymentIntent;
          error?: string;
        }>(response);

        if (!response.ok || !data?.success || !data.data) {
          throw new Error(getApiErrorMessage(data, "Payment setup failed"));
        }
        if (cancelled) return;

        setIntent(data.data);

        if (data.data.status === "paid") {
          setStatus("success");
          setTimeout(() => onSuccessRef.current(), 800);
        } else {
          setStatus("pending");
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Payment initialization failed:", error);
        setStatus("failed");
        toast.error("Failed to initialize payment");
      }
    };

    void createIntent();
    return () => {
      cancelled = true;
    };
  }, [isOpen, orderId, amount, token]);

  // Load Checkout.js and open the payment sheet for a real Razorpay order.
  useEffect(() => {
    if (!isOpen || !isRazorpay || status !== "pending" || checkoutOpenedRef.current) return;
    checkoutOpenedRef.current = true;

    let disposed = false;
    void (async () => {
      const loaded = await loadRazorpayCheckout();
      if (disposed) return;
      if (!loaded) {
        setStatus("failed");
        toast.error("Could not reach Razorpay. Check your connection and retry.");
        return;
      }
      openCheckout();
    })();

    return () => {
      disposed = true;
    };
  }, [isOpen, isRazorpay, status, openCheckout]);

  // Countdown only applies to the mock window; Razorpay's sheet has its own.
  useEffect(() => {
    if (!isOpen || isRazorpay || status === "success" || status === "expired") return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, isRazorpay, status]);

  // The webhook may settle the order while this modal is open, so keep asking.
  useEffect(() => {
    if (!isOpen || !token || status !== "pending") return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(getBackendUrl(`/api/payments/${orderId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await parseJsonSafely<{ data?: { status?: string } }>(response);
          if (data?.data?.status === "completed") {
            setStatus("success");
            toast.success("Payment successful!");
            setTimeout(() => onSuccessRef.current(), 1500);
          } else if (data?.data?.status === "failed") {
            setStatus("failed");
            toast.error("Payment failed");
          }
        }
      } catch (error) {
        console.error("Failed to check payment status:", error);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [isOpen, token, orderId, status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const amountLabel = `₹${(intent?.amount ?? amount).toFixed(2)}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative bg-card rounded-3xl border border-border p-8 max-w-md w-full shadow-2xl"
          >
            <button
              onClick={onClose}
              aria-label="Close payment"
              className="absolute top-4 right-4 p-2 hover:bg-secondary rounded-full transition-colors"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-6">
              <h2 className="font-display text-2xl font-black mb-2">Complete Payment</h2>
              <p className="text-muted-foreground">
                {isRazorpay ? "Pay securely with Razorpay" : "Amount due"} {amountLabel}
              </p>
            </div>

            {status === "pending" && isRazorpay && (
              <div className="space-y-5">
                <div className="flex items-center justify-center gap-2 rounded-xl bg-secondary/50 p-4 text-sm text-muted-foreground">
                  <ShieldCheck size={18} className="text-accent" />
                  <span>Payments are processed by Razorpay. Card details never touch our servers.</span>
                </div>
                <Button onClick={openCheckout} className="w-full h-12 rounded-full">
                  Pay {amountLabel} with Razorpay
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Closed the payment window? Reopen it above — the order stays reserved for 15
                  minutes.
                </p>
              </div>
            )}

            {status === "pending" && !isRazorpay && (
              <div className="space-y-6">
                <div className="flex flex-col items-center gap-3 py-4">
                  <Loader2 size={28} className="animate-spin text-accent" />
                  <p className="text-sm text-muted-foreground text-center">
                    Test mode is on, so this order settles automatically without a real charge.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2 text-sm font-display font-bold">
                  <Clock size={16} className="text-accent" />
                  <span>
                    Expires in <span className="text-accent">{formatTime(timeLeft)}</span>
                  </span>
                </div>

                <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-accent to-accent/50"
                    initial={{ width: "100%" }}
                    animate={{ width: `${(timeLeft / PAYMENT_WINDOW_SECONDS) * 100}%` }}
                    transition={{ duration: 1, ease: "linear" }}
                  />
                </div>
              </div>
            )}

            {status === "processing" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-8 gap-4"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full"
                />
                <p className="text-muted-foreground">Confirming payment...</p>
              </motion.div>
            )}

            {status === "success" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-8 gap-4"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center"
                >
                  <CheckCircle size={32} className="text-accent" />
                </motion.div>
                <div className="text-center">
                  <h3 className="font-display font-bold text-lg mb-1">Payment Successful!</h3>
                  <p className="text-muted-foreground text-sm">Your order has been confirmed</p>
                </div>
              </motion.div>
            )}

            {status === "failed" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-8 gap-4"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center"
                >
                  <AlertCircle size={32} className="text-destructive" />
                </motion.div>
                <div className="text-center">
                  <h3 className="font-display font-bold text-lg mb-1">Payment Failed</h3>
                  <p className="text-muted-foreground text-sm">
                    Your payment could not be processed. Please try again.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    checkoutOpenedRef.current = false;
                    setStatus("pending");
                  }}
                  className="w-full rounded-full mt-4"
                  variant="secondary"
                >
                  Try Again
                </Button>
              </motion.div>
            )}

            {status === "expired" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-8 gap-4"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center"
                >
                  <AlertCircle size={32} className="text-destructive" />
                </motion.div>
                <div className="text-center">
                  <h3 className="font-display font-bold text-lg mb-1">Payment Expired</h3>
                  <p className="text-muted-foreground text-sm">
                    The payment window has expired. Please try again.
                  </p>
                </div>
                <Button onClick={onClose} className="w-full rounded-full mt-4" variant="secondary">
                  Close
                </Button>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PaymentModal;
