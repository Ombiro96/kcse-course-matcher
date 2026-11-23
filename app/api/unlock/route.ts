import { buildResponse } from "@/lib/respond";
import { verifyPayment } from "@/lib/paystack";
import { RETRYABLE, MESSAGES, type ApiError, type ErrorCode } from "@/lib/api";
import { errorDetail, log } from "@/lib/log";

const SOURCES = new Set(["paid", "pending", "attempt", "redeem", "url", "restore", "stored"]);

const fail = (code: ErrorCode, status: number) =>
  Response.json({ error: MESSAGES.generic, code, pending: RETRYABLE.has(code) } satisfies ApiError, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const reference = body?.reference;
  // Where the check came from, so quiet background checks can be told apart from real user attempts in the logs.
  const source = SOURCES.has(body?.source) ? (body.source as string) : "unknown";
  if (typeof reference !== "string" || !/^[A-Za-z0-9._=-]{6,100}$/.test(reference)) {
    log("warn", "unlock_bad_reference", { source, sample: String(reference ?? "").slice(0, 40) });
    return fail("not_found", 400);
  }
  try {
    const verified = await verifyPayment(reference, { source });
    if (!verified.ok) return fail(verified.code, verified.status);
    const res = buildResponse(verified.grades, true);
    if (!res) {
      log("error", "unlock_incomplete_grades", { reference, source, detail: "Paid grade set has fewer than 7 subjects" });
      return fail("invalid", 422);
    }
    log("info", "unlock_ok", { reference, source, amount: verified.amount, channel: verified.channel, matches: res.totalMatches });
    return Response.json({ ...res, grades: verified.canonical, reference }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    log("error", "unlock_exception", { reference, source, detail: errorDetail(e) });
    return fail("unavailable", 500);
  }
}
