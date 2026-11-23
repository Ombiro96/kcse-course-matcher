import { CLIENT_EVENTS } from "@/lib/api";
import { log } from "@/lib/log";

const ALLOWED = new Set<string>(CLIENT_EVENTS);
const clip = (v: unknown, n = 300) => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, n) : undefined);

/** Browser-side failures (checkout couldn't open, unlock never confirmed) land in the same server logs. */
export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > 2000) return new Response(null, { status: 413 });
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  if (!body || typeof body.event !== "string" || !ALLOWED.has(body.event)) return new Response(null, { status: 204 });
  log("warn", `client_${body.event}`, {
    reference: clip(body.reference, 100),
    code: clip(body.code, 40),
    message: clip(body.message),
    path: clip(body.path, 100),
    ua: clip(request.headers.get("user-agent"), 200),
  });
  return new Response(null, { status: 204 });
}
