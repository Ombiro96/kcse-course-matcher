"use client";

import { useState } from "react";
import { REFERENCE_RE, cleanReference } from "@/lib/client/reference";

/** "Already paid? Enter your reference" — for parents whose tab closed or phone died mid-payment. */
export function RedeemBox({
  onRedeem,
  busy,
  className = "",
  inline = false,
}: {
  onRedeem: (reference: string) => void;
  busy: boolean;
  className?: string;
  /** Inside another card: no card chrome of its own. */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`min-h-11 text-left text-small text-link hover:underline ${className}`}>
        Already paid? Enter your payment reference ›
      </button>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const ref = cleanReference(value);
    if (!REFERENCE_RE.test(ref)) {
      setError("Check the reference. It's in your Paystack receipt email.");
      return;
    }
    setError(null);
    setValue(ref);
    onRedeem(ref);
  };

  return (
    <form
      onSubmit={submit}
      className={`${inline ? "border-t border-hairline pt-4" : "rounded-card bg-canvas p-5 shadow-ring sm:p-6"} ${className}`}
      aria-label="Restore a payment"
    >
      <label htmlFor="redeem-ref" className="block text-body-tight font-semibold">
        Already paid?
      </label>
      <p className="mt-1 text-small text-slate">
        Enter the payment reference from your Paystack receipt email (for example <span className="whitespace-nowrap">KCM-7H3KQ-PX9TM</span>). It isn&apos;t the code in the M-Pesa SMS.
      </p>
      <input
        id="redeem-ref"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        placeholder="Payment reference"
        className="mt-3 h-11 w-full rounded-pill border border-steel bg-canvas px-5 text-body uppercase placeholder:normal-case placeholder:text-steel"
      />
      {error && <p className="mt-2 text-small text-launch">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-3 block min-h-11 w-full rounded-pill border border-ink px-6 text-body-tight text-ink disabled:border-control disabled:text-slate"
      >
        {busy ? "Checking…" : "Restore my results"}
      </button>
    </form>
  );
}
