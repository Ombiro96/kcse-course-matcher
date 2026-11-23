// localStorage can throw (private mode, blocked storage) — never let that break the page.
export function load<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function save(key: string, value: unknown) {
  try {
    if (value === null) return window.localStorage.removeItem(key);
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/**
 * `attempt`: reference saved just before the Paystack popup opens. If the tab dies mid-M-Pesa it's checked quietly on
 *   the next visit — unlocked if it was paid, dropped if it wasn't.
 * `pending`: a reference Paystack's popup reported as paid that we haven't confirmed yet — retried on every visit.
 */
export const KEYS = { grades: "kcm:grades", unlock: "kcm:unlock", email: "kcm:email", pending: "kcm:pending", attempt: "kcm:attempt" } as const;
export interface StoredAttempt {
  reference: string;
  at: number; // ms
}
export interface StoredUnlock {
  reference: string;
  grades: string; // canonical
}
