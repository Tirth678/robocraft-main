import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG as QRCode } from "qrcode.react";
import { Clock, AlertCircle, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBackendUrl } from "@/lib/backend";
import { parseJsonSafely } from "@/lib/apiErrors";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface PaymentModalProps {
  isOpen: boolean;
  orderId: number;
  amount: number;
  onClose: () => void;
  onSuccess: () => void;
}

type PaymentStatus = "pending" | "processing" | "success" | "failed" | "expired";

const PaymentModal = ({
  isOpen,
  orderId,
  amount,
  onClose,
  onSuccess,
}: PaymentModalProps) => {
  const [status, setStatus] = useState<PaymentStatus>("pending");
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds
  const [clientSecret, setClientSecret] = useState<string>("");
  const [paymentIntentId, setPaymentIntentId] = useState<string>("");
  const { token } = useAuth();

  // Initialize payment intent
  useEffect(() => {
    if (!isOpen || !token) return;

    const initializePayment = async () => {
      try {
        setStatus("processing");
        const response = await fetch(
          getBackendUrl("/api/payments/create-intent"),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              orderId,
              amount,
            }),
          }
        );

        if (!response.ok) throw new Error("Failed to create payment intent");

        const data = await parseJsonSafely<{
          success?: boolean;
          data?: { clientSecret?: string; paymentIntentId?: string };
        }>(response);
        if (data?.success && data.data?.clientSecret && data.data?.paymentIntentId) {
          setClientSecret(data.data.clientSecret);
          setPaymentIntentId(data.data.paymentIntentId);
          setStatus("pending");
        } else {
          throw new Error("Payment setup failed");
        }
      } catch (error) {
        console.error("Payment initialization failed:", error);
        setStatus("failed");
        toast.error("Failed to initialize payment");
      }
    };

    initializePayment();
  }, [isOpen, orderId, amount, token]);

  // Timer countdown
  useEffect(() => {
    if (!isOpen || status === "success" || status === "expired") return;

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
  }, [isOpen, status]);

  // Poll for payment status
  useEffect(() => {
    if (!isOpen || !token || status !== "pending") return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          getBackendUrl(`/api/payments/${orderId}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data = await parseJsonSafely<{ data?: { status?: string } }>(response);
          if (data?.data?.status === "completed") {
            setStatus("success");
            toast.success("Payment successful!");
            setTimeout(onSuccess, 1500);
          } else if (data?.data?.status === "failed") {
            setStatus("failed");
            toast.error("Payment failed");
          }
        }
      } catch (error) {
        console.error("Failed to check payment status:", error);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [isOpen, token, orderId, status, onSuccess]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const qrValue = JSON.stringify({
    paymentIntentId,
    amount,
    orderId,
    clientSecret,
  });

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
            className="bg-card rounded-3xl border border-border p-8 max-w-md w-full shadow-2xl"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 hover:bg-secondary rounded-full transition-colors"
            >
              <X size={20} />
            </button>

            {/* Header */}
            <div className="text-center mb-6">
              <h2 className="font-display text-2xl font-black mb-2">
                Complete Payment
              </h2>
              <p className="text-muted-foreground">
                Scan the QR code to pay ₹{amount.toFixed(2)}
              </p>
            </div>

            {/* Status-based content */}
            {status === "pending" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-2xl">
                    <QRCode
                      value={qrValue}
                      size={256}
                      level="H"
                      includeMargin={true}
                    />
                  </div>
                </div>

                {/* Timer */}
                <div className="flex items-center justify-center gap-2 text-sm font-display font-bold">
                  <Clock size={16} className="text-accent" />
                  <span>
                    Payment expires in{" "}
                    <span className="text-accent">{formatTime(timeLeft)}</span>
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-accent to-accent/50"
                    initial={{ width: "100%" }}
                    animate={{ width: `${(timeLeft / 600) * 100}%` }}
                    transition={{ duration: 1, ease: "linear" }}
                  />
                </div>

                {/* Instructions */}
                <div className="bg-secondary/50 rounded-xl p-4 space-y-2 text-sm">
                  <p className="font-display font-bold">Payment Instructions:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Open your payment app (Google Pay, PhonePe, etc.)</li>
                    <li>Scan this QR code</li>
                    <li>Confirm the payment amount</li>
                    <li>Complete the transaction</li>
                  </ol>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  We'll automatically confirm your payment once received
                </p>
              </motion.div>
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
                <p className="text-muted-foreground">Initializing payment...</p>
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
                  <h3 className="font-display font-bold text-lg mb-1">
                    Payment Successful!
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Your order has been confirmed
                  </p>
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
                  <h3 className="font-display font-bold text-lg mb-1">
                    Payment Failed
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Your payment could not be processed. Please try again.
                  </p>
                </div>
                <Button
                  onClick={onClose}
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
                  <h3 className="font-display font-bold text-lg mb-1">
                    Payment Expired
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    The payment window has expired. Please try again.
                  </p>
                </div>
                <Button
                  onClick={onClose}
                  className="w-full rounded-full mt-4"
                  variant="secondary"
                >
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
