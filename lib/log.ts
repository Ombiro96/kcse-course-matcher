import "server-only";

type Level = "info" | "warn" | "error";

/**
 * One JSON object per line on stdout/stderr. On Vercel these appear in Project → Logs (and `vercel logs`), where you can
 * search by event name or payment reference, e.g. `"event":"paystack_config_missing"` or `T_ref_123`.
 * Never log emails, grades or keys here — just references, statuses and amounts.
 */
export function log(level: Level, event: string, data: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function errorDetail(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}
