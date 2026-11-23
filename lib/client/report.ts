import type { ClientEvent } from "../api";

/** Fire-and-forget report of a browser-side failure to /api/log (ends up in the server logs). Never throws. */
export function report(event: ClientEvent, data: { reference?: string; code?: string; message?: string } = {}) {
  try {
    const body = JSON.stringify({ event, ...data, path: window.location.pathname });
    if (navigator.sendBeacon?.("/api/log", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/log", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}
