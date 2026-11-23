import type { ClusterResult } from "./kcse";
import type { Match, Tier } from "./match";
import type { Grade } from "./subjects";

/** Response of /api/match (preview) and /api/unlock (full list). */
export interface MatchResponse {
  meanGrade: Grade;
  total: number;
  clusters: Pick<ClusterResult, "id" | "name" | "weight">[];
  counts: Record<Tier, number>;
  totalMatches: number;
  belowDegreeMinimum: boolean;
  cutoffYear: string;
  /** First FREE_PREVIEW matches, or all of them when unlocked. */
  matches: Match[];
  unlocked: boolean;
  /** Distinct cut-off years used across all matches (most are the latest; a few fall back to an older year). */
  cutoffYears: string[];
  /** Canonical grades the result was computed from (unlock only). */
  grades?: string;
  reference?: string;
}

/**
 * What the browser is told when something fails. Deliberately general — the real cause (missing keys, Paystack
 * responses, amounts) is only written to the server logs (see lib/log.ts), keyed by the payment reference.
 */
export type ErrorCode =
  | "invalid_grades" // form validation, safe to show as-is
  | "unavailable" // our side or Paystack is down/misconfigured — retryable
  | "pending" // payment not final yet (M-Pesa still processing) — retryable
  | "not_paid" // Paystack says failed/abandoned, or amount didn't match
  | "not_found" // unknown reference
  | "invalid" // payment exists but can't be used (no grades attached)
  | "network"; // browser couldn't reach us

export interface ApiError {
  error: string;
  code: ErrorCode;
  /** Worth retrying automatically. */
  pending?: boolean;
}

export const RETRYABLE: ReadonlySet<ErrorCode> = new Set(["unavailable", "pending", "network"]);

export const MESSAGES = {
  generic: "Something went wrong. Please try again.",
  checkoutFailed: "Payment failed. Please try again.",
  checkoutOffline: "Couldn't open the payment window. Check your connection and try again.",
  notPaid: "Payment didn't go through. Please try again.",
  notFound: "We couldn't find that payment. Please try again.",
  /** After money may have moved: never tell them to pay again. */
  unconfirmed: (ref: string) =>
    `We couldn't confirm your payment yet. If you were charged, don't pay again. Your results will unlock automatically next time you open this page. Payment reference: ${ref}`,
  unusable: (ref: string) => `Something went wrong unlocking your results. Payment reference: ${ref}`,
  redeemNotFound: "We couldn't find a payment with that reference. Use the reference from your Paystack receipt email, not the M-Pesa SMS code.",
  redeemNotPaid: "That payment didn't go through, so there's nothing to unlock. You weren't charged for it.",
} as const;

/** Events the browser may report to /api/log. Anything else is dropped. */
export const CLIENT_EVENTS = ["checkout_not_configured", "checkout_script_failed", "checkout_error", "unlock_failed"] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];
