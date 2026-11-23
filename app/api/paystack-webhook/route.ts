import crypto from "node:crypto";
import { log } from "@/lib/log";

/**
 * Paystack webhook (Dashboard → Settings → API Keys & Webhooks → Webhook URL: https://<site>/api/paystack-webhook).
 * Logs every successful charge server-side, even if the student closed the browser before their results unlocked.
 * A `paystack_charge_success` line with no matching `unlock_ok` for the same reference = a payment that fell through.
 */
export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const raw = await request.text();
  if (!secret) {
    log("error", "webhook_config_missing", { detail: "PAYSTACK_SECRET_KEY is not set; Paystack will retry" });
    return new Response(null, { status: 503 });
  }
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const expected = crypto.createHmac("sha512", secret).update(raw).digest("hex");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    log("warn", "webhook_bad_signature", {});
    return new Response(null, { status: 401 });
  }
  let evt: { event?: string; data?: { reference?: string; amount?: number; currency?: string; channel?: string; status?: string; metadata?: unknown } };
  try {
    evt = JSON.parse(raw);
  } catch {
    log("warn", "webhook_bad_json", {});
    return new Response(null, { status: 400 });
  }
  const d = evt.data ?? {};
  let meta = d.metadata;
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = null;
    }
  }
  const hasGrades = typeof (meta as { grades?: unknown } | null)?.grades === "string";
  log(evt.event === "charge.success" ? "info" : "warn", evt.event === "charge.success" ? "paystack_charge_success" : "paystack_webhook", {
    type: evt.event,
    reference: d.reference,
    amount: d.amount,
    currency: d.currency,
    channel: d.channel,
    status: d.status,
    hasGrades,
  });
  return new Response(null, { status: 200 });
}
