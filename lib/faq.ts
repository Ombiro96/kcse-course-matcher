import { PRICE_KES } from "./site";

export function getFaq(cutoffYear: string, cutoffYears: string[], programmeCount: number) {
  const older = cutoffYears.filter((y) => y !== cutoffYear).sort().reverse();
  return [
    {
      q: "How are KUCCPS cluster points calculated?",
      a: "Weighted cluster points use C = √((r ÷ 48) × (t ÷ 84)) × 48, where r is the total points of the 4 subjects your cluster requires and t is your KCSE aggregate (best 7 subjects, out of 84). The answer is out of 48 and shown to 3 decimal places. KUCCPS shows your official figure on its student portal; use that if it differs from ours.",
    },
    {
      q: "How is my KCSE mean grade worked out?",
      a: "Since the 2023 KCSE, KNEC counts Mathematics, the better of English or Kiswahili, and your best five other subjects. The total out of 84 is divided by 7 and rounded: 81–84 is an A, 74–80 an A-, 67–73 a B+, 60–66 a B, 53–59 a B-, 46–52 a C+, and so on down to E.",
    },
    {
      q: "What do Safe, Close and Reach mean?",
      a: `We compare your cluster points with each programme's most recent published cut-off. Safe means you are at least 2 points above it, Close means within 2 points either side, and Reach means 2 to 4 points below. Cut-offs move every year with demand and the number of places, so even Safe isn't a guarantee.`,
    },
    {
      q: "Which programmes and cut-offs do you use?",
      a: `${programmeCount.toLocaleString("en-KE")} degree programmes from the KUCCPS 2025/2026 programme list, with the most recent cut-off KUCCPS published for each one. That's the column KUCCPS labels ${cutoffYear}${older.length ? `, or ${older.join(" or ")} for the few programmes with no ${cutoffYear} figure` : ""}. Every course shows its year next to the number. We also check each programme's minimum subject grades and the C+ minimum for degrees.`,
    },
    {
      q: "Are these this year's cut-offs?",
      a: "No. Cut-offs are only known after KUCCPS finishes placement, so every figure here is a past one, and each course shows the year it comes from. Treat them as a guide to how competitive a course has been, not a promise of this year's number.",
    },
    {
      q: "What is the minimum mean grade for a degree?",
      a: "C+ (plain). With a C- you can apply for diploma courses, with a D for certificate courses and with an E for artisan courses. This tool covers degree programmes only.",
    },
    {
      q: `What do I get for KES ${PRICE_KES}?`,
      a: "Your mean grade, all 20 cluster points and your top 5 courses are free. A one-time payment unlocks every programme you qualify for, with institutions, cutoffs and fees, and a PDF you can save or print. You pay by M-Pesa or card through Paystack, and no account is needed.",
    },
    {
      q: "I paid but my results didn't unlock. What do I do?",
      a: "Open this page again on the same phone and it will check your payment automatically. On another phone, tap “Already paid? Enter your payment reference” and type the reference from your Paystack receipt email (it starts with KCM-, and it isn't the M-Pesa SMS code). Please don't pay again.",
    },
    {
      q: "Is this the official KUCCPS website?",
      a: "No. This is an independent planning tool built from documents KUCCPS publishes. You still need to apply through the official KUCCPS student portal.",
    },
  ];
}
