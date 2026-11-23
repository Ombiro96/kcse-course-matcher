export const SITE_NAME = "KCSE Course Matcher";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
export const SITE_DESCRIPTION =
  "Free KUCCPS cluster points calculator. Enter your KCSE grades to get your mean grade, weighted cluster points for all 20 clusters, and the degree courses you can get based on past KUCCPS cutoffs.";

/** Unlock price in KES. Paystack amounts are in the subunit (cents). */
export const PRICE_KES = 149;
export const PRICE_SUBUNIT = PRICE_KES * 100;
export const FREE_PREVIEW = 5;
