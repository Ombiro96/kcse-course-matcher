// Our own Paystack reference, so we can show it and save it *before* the M-Pesa prompt.
// No 0/O/1/I/L so it can be read back over the phone.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newReference(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `KCM-${chars.slice(0, 5)}-${chars.slice(5)}`;
}

/** What people paste: "Reference: kcm-7h3kq px9tm" → "KCM-7H3KQ-PX9TM". Paystack's own references are left as typed. */
export function cleanReference(input: string): string {
  let s = input.trim().replace(/^ref(erence)?\s*(no\.?|number)?\s*[:#]?\s*/i, "");
  const compact = s.replace(/[\s-]/g, "").toUpperCase();
  if (/^KCM[A-Z0-9]{10}$/.test(compact)) return `KCM-${compact.slice(3, 8)}-${compact.slice(8)}`;
  s = s.replace(/\s+/g, "");
  return s;
}

export const REFERENCE_RE = /^[A-Za-z0-9._=-]{6,100}$/;
