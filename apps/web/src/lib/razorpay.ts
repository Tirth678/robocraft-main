/**
 * Razorpay Checkout.js loader.
 *
 * The storefront never bundles Razorpay's SDK: Checkout.js is served by Razorpay
 * and must be loaded from their origin so the payment sheet stays PCI compliant.
 * Only the API surface this app touches is typed here.
 */

export interface RazorpayPaymentResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpayPaymentResponse) => void;
  modal?: { ondismiss?: () => void };
}

export interface RazorpayCheckout {
  open: () => void;
  close: () => void;
}

type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayCheckout;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let scriptPromise: Promise<boolean> | null = null;

/** Loads Checkout.js once; resolves false when the script cannot be fetched. */
export function loadRazorpayCheckout(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => {
      // Allow a later attempt (flaky network / blocked extension).
      scriptPromise = null;
      script.remove();
      resolve(false);
    };
    if (!existing) document.head.appendChild(script);
  });

  return scriptPromise;
}

/** Opens the Razorpay sheet, or returns null when Checkout.js is unavailable. */
export function openRazorpayCheckout(options: RazorpayOptions): RazorpayCheckout | null {
  if (!window.Razorpay) return null;
  return new window.Razorpay(options);
}
