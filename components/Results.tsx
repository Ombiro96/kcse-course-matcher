"use client";

import { useMemo, useState } from "react";
import type { MatchResponse } from "@/lib/api";
import { KEYS, load, save } from "@/lib/client/storage";
import { CheckoutError, loadPaystack, startCheckout } from "@/lib/client/paystack";
import { MESSAGES } from "@/lib/api";
import { newReference } from "@/lib/client/reference";
import type { StoredAttempt } from "@/lib/client/storage";
import { RedeemBox } from "./RedeemBox";
import type { Match, Tier } from "@/lib/match";
import { FREE_PREVIEW, PRICE_KES } from "@/lib/site";

// Tiers are bare text labels, no pills: blue = comfortably in, ink = borderline, orange = stretch.
const TIER: Record<Tier, { label: string; hint: string; cls: string }> = {
  safe: { label: "Safe", hint: "2+ points above the cut-off", cls: "text-link" },
  close: { label: "Close", hint: "within 2 points of the cut-off", cls: "text-ink" },
  reach: { label: "Reach", hint: "2–4 points below the cut-off", cls: "text-launch" },
};
const PAGE = 40;

interface Props {
  result: MatchResponse;
  canonical: string;
  stale: boolean;
  unlocking: boolean;
  unlockError: string | null;
  onPaid: (reference: string) => void;
  onPayError: (message: string | null) => void;
  onRedeem: (reference: string) => void;
}

export function Results({ result, canonical, stale, unlocking, unlockError, onPaid, onPayError, onRedeem }: Props) {
  const locked = result.unlocked ? 0 : result.totalMatches - result.matches.length;

  return (
    <section aria-labelledby="results-h" className="mt-16 sm:mt-[90px]">
      <h2 id="results-h" className="text-feature sm:text-display">
        Your results.
      </h2>
      {stale && <p className="mt-3 text-small font-semibold text-launch">You changed your grades. Tap “Show my courses” to update.</p>}

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Mean grade" value={result.meanGrade} />
        <Stat label="Points of 84" value={String(result.total)} />
        <Stat label="Courses" value={result.totalMatches.toLocaleString("en-KE")} />
      </div>

      <ClusterPoints clusters={result.clusters} />

      {result.belowDegreeMinimum ? (
        <Notice>
          Degree programmes need a KCSE mean grade of at least <strong className="font-semibold">C+</strong>. You can still apply for diploma
          (C-), certificate (D) and artisan (E) courses on the KUCCPS portal. This tool covers degree programmes only.
        </Notice>
      ) : result.totalMatches === 0 ? (
        <Notice>
          No degree programmes are within 4 points of their most recent KUCCPS cut-off with these grades, or you don&apos;t meet their subject
          minimums. Check that every subject is entered.
        </Notice>
      ) : (
        <div className="mt-12">
          <TierSummary counts={result.counts} years={result.cutoffYears} />
          {result.unlocked ? (
            <FullList result={result} />
          ) : (
            <>
              <ol className="mt-5 overflow-clip rounded-card bg-canvas px-5 sm:px-7">
                {result.matches.map((m, i) => (
                  <CourseRow key={m.code} m={m} rank={i + 1} />
                ))}
              </ol>
              {locked > 0 && (
                <Locked
                  locked={locked}
                  canonical={canonical}
                  stale={stale}
                  unlocking={unlocking}
                  unlockError={unlockError}
                  onPaid={onPaid}
                  onRedeem={onRedeem}
                  onPayError={onPayError}
                />
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-canvas px-3 py-5 text-center sm:py-7">
      <div className="tabular font-display text-title font-semibold sm:text-feature">{value}</div>
      <div className="mt-1 text-caption text-slate">{label}</div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="mt-12 rounded-card bg-canvas p-7 text-body">{children}</p>;
}

function ClusterPoints({ clusters }: { clusters: MatchResponse["clusters"] }) {
  const sorted = [...clusters].sort((a, b) => b.weight - a.weight);
  const [all, setAll] = useState(false);
  const shown = all ? sorted : sorted.slice(0, 5);
  return (
    <div className="mt-3 rounded-card bg-canvas p-5 sm:p-7">
      <h3 className="text-subtitle">Cluster points</h3>
      <p className="mt-1 text-small text-slate">Out of 48. A 0 means you didn&apos;t sit a subject that cluster requires.</p>
      <ul className="mt-6 space-y-5">
        {shown.map((c) => (
          <li key={c.id}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 truncate text-small">
                <span className="text-slate">{c.id}</span>&ensp;{c.name}
              </span>
              <span className="tabular shrink-0 text-small font-semibold">{c.weight.toFixed(3)}</span>
            </div>
            <div className="mt-2 h-1 rounded-pill bg-control">
              <div className="h-1 rounded-pill bg-ink" style={{ width: `${(c.weight / 48) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setAll(!all)} className="mt-5 min-h-11 text-body text-link hover:underline">
        {all ? "Show fewer" : "Show all 20 clusters ›"}
      </button>
    </div>
  );
}

function TierSummary({ counts, years }: { counts: Record<Tier, number>; years: string[] }) {
  const yearsText = years.length > 1 ? `${years[0]} for most; ${years.slice(1).join(" or ")} where KUCCPS has no ${years[0]} figure` : years[0];
  return (
    <div>
      <h3 className="text-title">Courses you can aim for.</h3>
      <p className="tabular mt-3 text-body-tight">
        {(Object.keys(TIER) as Tier[]).map((t, i) => (
          <span key={t}>
            {i > 0 && <span className="text-steel"> · </span>}
            <span className={`font-semibold ${TIER[t].cls}`}>{counts[t].toLocaleString("en-KE")}</span> {TIER[t].label}
          </span>
        ))}
      </p>
      <p className="mt-2 text-small text-slate">
        Compared with each programme&apos;s most recent published KUCCPS cut-off ({yearsText}), not this year&apos;s. This year&apos;s cut-offs
        are only set after placement. Safe is 2+ points above, Close is within 2, Reach is 2–4 below.
      </p>
    </div>
  );
}

function CourseRow({ m, rank }: { m: Match; rank: number }) {
  const t = TIER[m.tier];
  return (
    <li className="border-b border-hairline py-5 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-body-tight font-semibold">
            <span className="tabular font-normal text-steel">{rank}&ensp;</span>
            {m.name}
          </p>
          <p className="mt-1 text-small text-slate">{m.institution}</p>
        </div>
        <span className={`shrink-0 pt-0.5 text-caption font-semibold ${t.cls}`} title={t.hint}>
          {t.label}
        </span>
      </div>
      <dl className="tabular mt-3 flex flex-wrap gap-x-5 gap-y-1 text-caption text-slate">
        <div>
          <dt className="inline">Code </dt>
          <dd className="inline text-ink">{m.code}</dd>
        </div>
        <div>
          <dt className="inline">Your points: </dt>
          <dd className="inline text-ink">{m.weight.toFixed(3)}</dd>
        </div>
        <div>
          <dt className="inline">{m.cutoffYear} cut-off: </dt>
          <dd className="inline text-ink">{m.cutoff.toFixed(3)}</dd>
        </div>
        <div>
          <dt className="sr-only">Difference</dt>
          <dd className={`inline font-semibold ${m.diff >= 0 ? "text-ink" : "text-launch"}`}>
            {m.diff >= 0 ? "+" : "−"}
            {Math.abs(m.diff).toFixed(2)}
          </dd>
        </div>
        {m.cost !== null && (
          <div>
            <dt className="inline">Fees </dt>
            <dd className="inline text-ink">KES {m.cost.toLocaleString("en-KE")}/yr</dd>
          </div>
        )}
      </dl>
    </li>
  );
}

function Locked(props: {
  locked: number;
  canonical: string;
  stale: boolean;
  unlocking: boolean;
  unlockError: string | null;
  onPaid: (reference: string) => void;
  onPayError: (message: string | null) => void;
  onRedeem: (reference: string) => void;
}) {
  const [email, setEmail] = useState(() => load<string>(KEYS.email) ?? "");
  const [reference, setReference] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const pay = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setEmailError("Enter a valid email address for your Paystack receipt.");
      return;
    }
    setEmailError(null);
    props.onPayError(null);
    save(KEYS.email, email.trim());
    setOpening(true);
    // Fresh reference per attempt (Paystack rejects reused ones). Saved before the popup opens, so if the tab dies
    // mid-M-Pesa it's checked on the next visit; shown on screen so a parent can note it down.
    const ref = newReference();
    setReference(ref);
    save(KEYS.attempt, { reference: ref, at: Date.now() } satisfies StoredAttempt);
    try {
      await startCheckout({
        email: email.trim(),
        reference: ref,
        grades: props.canonical,
        onSuccess: (ref) => props.onPaid(ref),
        onCancel: () => undefined,
        onError: (msg) => props.onPayError(msg),
      });
    } catch (e) {
      props.onPayError(e instanceof CheckoutError ? e.message : MESSAGES.checkoutFailed);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="mt-3">
      {/* Placeholder shapes only — the locked programmes are never sent to the browser. */}
      <ul aria-hidden className="pointer-events-none select-none overflow-clip rounded-card bg-canvas px-5 blur-[3px] sm:px-7">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="border-b border-hairline py-5 last:border-b-0">
            <div className="h-4 w-3/4 rounded-pill bg-control" />
            <div className="mt-2.5 h-3 w-1/2 rounded-pill bg-control" />
            <div className="mt-4 h-2.5 w-2/3 rounded-pill bg-control" />
          </li>
        ))}
      </ul>
      <div className="relative mx-3 -mt-[340px] rounded-card bg-canvas p-6 shadow-ring sm:mx-auto sm:max-w-md sm:p-7">
        <p className="text-caption font-semibold text-launch">{props.locked.toLocaleString("en-KE")} more</p>
        <p className="mt-1 font-display text-subtitle font-semibold">See every course you qualify for.</p>
        <p className="mt-2 text-small text-slate">
          You&apos;re seeing the top {FREE_PREVIEW}. Unlock the full list with every university, cut-off and fee, plus a PDF to keep.
        </p>
        <label className="mt-5 block text-caption text-slate" htmlFor="pay-email">
          Email for your receipt
        </label>
        <input
          id="pay-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => void loadPaystack().catch(() => undefined)}
          className="mt-1.5 h-11 w-full rounded-pill border border-steel bg-canvas px-5 text-body placeholder:text-steel"
          placeholder="you@gmail.com"
        />
        {emailError && <p className="mt-2 text-small text-launch">{emailError}</p>}
        <p className="mt-5 text-small">
          <span className="font-semibold">KES {PRICE_KES}</span>
          <span className="text-slate"> · One time · M-Pesa or card</span>
        </p>
        <button
          type="button"
          onClick={pay}
          disabled={opening || props.unlocking || props.stale}
          className="mt-3 block min-h-12 w-full rounded-pill bg-action px-6 text-body-tight text-white disabled:bg-control disabled:text-slate"
        >
          {props.unlocking ? "Confirming payment…" : opening ? "Opening payment…" : "Unlock all"}
        </button>
        {reference && (
          <p className="mt-3 text-caption text-slate">
            Your payment reference: <span className="tabular select-all font-semibold text-ink">{reference}</span>. It&apos;s also in your
            Paystack receipt email.
          </p>
        )}
        {props.stale && <p className="mt-3 text-caption text-launch">Update your results before paying.</p>}
        {props.unlockError && (
          <p role="alert" className="mt-3 text-small text-launch">
            {props.unlockError}
          </p>
        )}
        <p className="mt-4 text-caption text-slate">Paid securely through Paystack. No account needed, and your results stay unlocked on this device.</p>
        <RedeemBox inline className="mt-4" busy={props.unlocking} onRedeem={props.onRedeem} />
      </div>
    </div>
  );
}

function FullList({ result }: { result: MatchResponse }) {
  const [tier, setTier] = useState<Tier | "all">("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return result.matches.filter(
      (m) => (tier === "all" || m.tier === tier) && (!needle || `${m.name} ${m.institution} ${m.code}`.toLowerCase().includes(needle)),
    );
  }, [result.matches, tier, q]);
  const rank = useMemo(() => new Map(result.matches.map((m, i) => [m.code, i + 1])), [result.matches]);

  const pdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const { downloadPdf } = await import("@/lib/client/pdf");
      await downloadPdf(result);
    } catch {
      setPdfError("Could not create the PDF. Check your connection and try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="mt-6">
      <button type="button" onClick={pdf} disabled={pdfBusy} className="min-h-11 text-body text-link hover:underline disabled:text-slate">
        {pdfBusy ? "Preparing PDF…" : `Download all ${result.totalMatches.toLocaleString("en-KE")} as a PDF ↓`}
      </button>
      {pdfError && <p className="mb-2 text-small text-launch">{pdfError}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by fit">
        {(["all", "safe", "close", "reach"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tier === t}
            onClick={() => {
              setTier(t);
              setLimit(PAGE);
            }}
            className={`tabular min-h-9 rounded-pill border px-4 text-small ${
              tier === t ? "border-ink bg-ink text-white" : "border-steel bg-transparent text-ink"
            }`}
          >
            {t === "all" ? `All ${result.totalMatches.toLocaleString("en-KE")}` : `${TIER[t].label} ${result.counts[t].toLocaleString("en-KE")}`}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setLimit(PAGE);
        }}
        placeholder="Search course, university or code"
        className="mt-4 h-11 w-full rounded-pill border border-steel bg-canvas px-5 text-body placeholder:text-steel"
        aria-label="Search your matches"
      />
      {filtered.length > 0 ? (
        <ol className="mt-4 overflow-clip rounded-card bg-canvas px-5 sm:px-7">
          {filtered.slice(0, limit).map((m) => (
            <CourseRow key={m.code} m={m} rank={rank.get(m.code) ?? 0} />
          ))}
        </ol>
      ) : (
        <p className="mt-6 text-small text-slate">Nothing matches that search.</p>
      )}
      {filtered.length > limit && (
        <button type="button" onClick={() => setLimit(limit + PAGE)} className="mx-auto mt-5 block min-h-11 text-body text-link hover:underline">
          Show {Math.min(PAGE, filtered.length - limit)} more ›
        </button>
      )}
    </div>
  );
}
