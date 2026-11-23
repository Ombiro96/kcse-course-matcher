import { MESSAGES } from "../api";
import { PRICE_SUBUNIT } from "../site";
import { report } from "./report";

interface PaystackTransaction {
  reference: string;
}
interface PaystackPopInstance {
  newTransaction(options: {
    key: string;
    email: string;
    amount: number;
    currency: string;
    reference?: string;
    metadata?: Record<string, unknown>;
    onSuccess: (tx: PaystackTransaction) => void;
    onCancel?: () => void;
    onError?: (error: { message?: string }) => void;
  }): void;
}
declare global {
  interface Window {
    PaystackPop?: new () => PaystackPopInstance;
  }
}

/** Error whose message is safe to show to the user; the real cause has already been reported. */
export class CheckoutError extends Error {}

let loading: Promise<void> | null = null;

/** Loads Paystack Inline JS on demand, so it costs nothing for visitors who never pay. */
export function loadPaystack(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.PaystackPop) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v2/inline.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error("Paystack inline.js failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export async function startCheckout(opts: {
  email: string;
  reference: string;
  grades: string;
  onSuccess: (reference: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const key = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
  if (!key) {
    report("checkout_not_configured", { message: "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY is not set in this build" });
    throw new CheckoutError(MESSAGES.checkoutFailed);
  }
  try {
    await loadPaystack();
  } catch (e) {
    report("checkout_script_failed", { message: e instanceof Error ? e.message : String(e) });
    throw new CheckoutError(MESSAGES.checkoutOffline);
  }
  const Pop = window.PaystackPop;
  if (!Pop) {
    report("checkout_script_failed", { message: "PaystackPop missing after script load" });
    throw new CheckoutError(MESSAGES.checkoutFailed);
  }
  try {
    new Pop().newTransaction({
      key,
      email: opts.email,
      amount: PRICE_SUBUNIT,
      currency: "KES",
      reference: opts.reference,
      // The server reads the grades back from Paystack when verifying, so this reference unlocks only these grades.
      metadata: {
        grades: opts.grades,
        custom_fields: [{ display_name: "KCSE grades", variable_name: "grades", value: opts.grades }],
      },
      onSuccess: (tx) => opts.onSuccess(tx.reference),
      onCancel: opts.onCancel,
      onError: (e) => {
        report("checkout_error", { reference: opts.reference, message: e?.message });
        opts.onError(MESSAGES.checkoutFailed);
      },
    });
  } catch (e) {
    report("checkout_error", { message: e instanceof Error ? e.message : String(e) });
    throw new CheckoutError(MESSAGES.checkoutFailed);
  }
}
