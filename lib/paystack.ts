import "server-only";
import type { ErrorCode } from "./api";
import { errorDetail, log } from "./log";
import { PRICE_SUBUNIT } from "./site";
import { parseCanonicalGrades, type GradeMap } from "./subjects";

export type VerifyResult =
  | { ok: true; grades: GradeMap; canonical: string; amount: number; channel?: string }
  | { ok: false; status: number; code: ErrorCode };

const PENDING = new Set(["ongoing", "pending", "processing", "queued", "send_otp", "send_birthday", "send_phone"]);

interface PaystackVerify {
  status?: boolean;
  message?: string;
  data?: {
    status?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    channel?: string;
    gateway_response?: string;
    paid_at?: string;
    metadata?: unknown;
  };
}

/**
 * Verifies a Paystack transaction server-side. The grades are read from the transaction's own metadata (set at
 * checkout), so a reference unlocks exactly the grade set that was paid for and can't be reused for other grades.
 * Every failure is logged with its real cause; the caller only gets a general code.
 */
export async function verifyPayment(reference: string, context: Record<string, unknown> = {}): Promise<VerifyResult> {
  const L = (level: Parameters<typeof log>[0], event: string, data: Record<string, unknown>) => log(level, event, { ...context, ...data });
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    L("error", "paystack_config_missing", { reference, detail: "PAYSTACK_SECRET_KEY is not set" });
    return { ok: false, status: 503, code: "unavailable" };
  }

  let res: Response;
  let body: PaystackVerify | null;
  try {
    res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    body = await res.json().catch(() => null);
  } catch (e) {
    L("error", "paystack_unreachable", { reference, detail: errorDetail(e) });
    return { ok: false, status: 502, code: "unavailable" };
  }

  if (res.status === 401 || res.status === 403) {
    L("error", "paystack_auth_failed", { reference, httpStatus: res.status, message: body?.message, detail: "Secret key rejected — wrong key or test/live mismatch" });
    return { ok: false, status: 503, code: "unavailable" };
  }
  if (res.status === 400 || res.status === 404) {
    L("warn", "paystack_reference_not_found", { reference, httpStatus: res.status, message: body?.message });
    return { ok: false, status: 404, code: "not_found" };
  }
  if (!res.ok || !body?.status || !body.data) {
    L("error", "paystack_verify_error", { reference, httpStatus: res.status, message: body?.message });
    return { ok: false, status: 502, code: "unavailable" };
  }

  const d = body.data;
  const ctx = { reference, paystackStatus: d.status, amount: d.amount, currency: d.currency, channel: d.channel, gatewayResponse: d.gateway_response, paidAt: d.paid_at };
  if (d.status !== "success") {
    if (PENDING.has(d.status ?? "")) {
      L("info", "payment_pending", ctx);
      return { ok: false, status: 402, code: "pending" };
    }
    L("warn", "payment_not_successful", ctx);
    return { ok: false, status: 402, code: "not_paid" };
  }
  if (d.currency !== "KES" || (d.amount ?? 0) < PRICE_SUBUNIT) {
    L("error", "payment_amount_mismatch", { ...ctx, expectedAmount: PRICE_SUBUNIT, expectedCurrency: "KES" });
    return { ok: false, status: 402, code: "not_paid" };
  }
  let meta = d.metadata as unknown;
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = null;
    }
  }
  const canonical = (meta as { grades?: unknown } | null)?.grades;
  const grades = typeof canonical === "string" ? parseCanonicalGrades(canonical) : null;
  if (!grades) {
    L("error", "payment_missing_grades", { ...ctx, detail: "Successful payment has no usable metadata.grades — cannot compute results" });
    return { ok: false, status: 422, code: "invalid" };
  }
  return { ok: true, grades, canonical: canonical as string, amount: d.amount ?? 0, channel: d.channel };
}
