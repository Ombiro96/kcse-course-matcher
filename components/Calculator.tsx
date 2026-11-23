"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MESSAGES, RETRYABLE, type ApiError, type MatchResponse } from "@/lib/api";
import { report } from "@/lib/client/report";
import { KEYS, load, save, type StoredAttempt, type StoredUnlock } from "@/lib/client/storage";
import { aggregate } from "@/lib/kcse";
import { GRADES, SUBJECTS, canonicalGrades, parseCanonicalGrades, type Grade, type GradeMap } from "@/lib/subjects";
import { RedeemBox } from "./RedeemBox";
import { Results } from "./Results";

type UnlockSource = "paid" | "pending" | "attempt" | "redeem" | "url" | "restore" | "stored";

const SECTIONS: { title: string; ids: string[] }[] = [
  { title: "Compulsory", ids: ["ENG", "KIS", "MAT_A"] },
  { title: "Sciences", ids: ["BIO", "CHE", "PHY"] },
  { title: "Humanities", ids: ["HAG", "GEO", "CRE"] },
  { title: "Technical & business", ids: ["AGR", "BST", "CMP"] },
];
const SHOWN = new Set(SECTIONS.flatMap((s) => s.ids));
const MORE = SUBJECTS.filter((s) => !s.legacy && !SHOWN.has(s.id));
const NAME = Object.fromEntries(SUBJECTS.map((s) => [s.id, s.name]));

async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; error: ApiError }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (res.ok && data) return { ok: true, data: data as T };
    const err: ApiError = data?.code ? data : { error: MESSAGES.generic, code: "unavailable", pending: true };
    return { ok: false, status: res.status, error: err };
  } catch {
    return { ok: false, status: 0, error: { error: "No connection. Check your data and try again.", code: "network", pending: true } };
  }
}

export function Calculator() {
  const [grades, setGrades] = useState<GradeMap>({});
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [resultFor, setResultFor] = useState(""); // canonical grades the shown result was computed from
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [paidFor, setPaidFor] = useState<StoredUnlock | null>(null);
  const [unlockSource, setUnlockSource] = useState<UnlockSource | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const agg = useMemo(() => aggregate(grades), [grades]);
  const count = Object.values(grades).filter(Boolean).length;
  const canonical = canonicalGrades(grades);

  const showResults = useCallback((r: MatchResponse, forGrades: string) => {
    setResult(r);
    setResultFor(forGrades);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  /**
   * Where a reference came from decides how loudly we fail:
   *  paid    – Paystack popup just reported success        → loud, never "pay again"
   *  pending – a paid reference that failed to confirm     → loud, retried every visit
   *  attempt – saved before the popup opened (tab may have died mid-M-Pesa) → silent unless it unlocks
   *  redeem  – typed into "Already paid?"                  → loud, specific not-found help
   *  url     – ?ref= link                                  → loud
   *  restore – user tapped to reopen paid results          → loud
   *  stored  – auto-reopen of an earlier unlock            → silent
   */
  const unlock = useCallback(
    async (reference: string, source: UnlockSource): Promise<boolean> => {
      const quiet = source === "attempt" || source === "stored";
      setUnlocking(true);
      setUnlockSource(source);
      if (!quiet) setUnlockError(null);
      const clearSaved = () => {
        if (load<string>(KEYS.pending) === reference) save(KEYS.pending, null);
        if (load<StoredAttempt>(KEYS.attempt)?.reference === reference) save(KEYS.attempt, null);
      };
      // M-Pesa confirmations can lag a few seconds behind the popup closing; retry while it's retryable.
      let last: ApiError | null = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const res = await postJson<MatchResponse>("/api/unlock", { reference, source });
        if (res.ok) {
          const stored = { reference, grades: res.data.grades ?? "" };
          save(KEYS.unlock, stored);
          clearSaved();
          setPaidFor(stored);
          setUnlockError(null);
          const paid = res.data.grades ? parseCanonicalGrades(res.data.grades) : null;
          if (paid) {
            setGrades(paid);
            save(KEYS.grades, paid);
          }
          try {
            const url = new URL(window.location.href);
            url.searchParams.set("ref", reference);
            window.history.replaceState(null, "", url);
          } catch {
            /* ignore */
          }
          setUnlocking(false);
          showResults(res.data, res.data.grades ?? "");
          return true;
        }
        last = res.error;
        // A background check of an abandoned attempt shouldn't spin for 15 seconds.
        if (!RETRYABLE.has(res.error.code) || attempt === 5 || (source === "attempt" && res.error.code !== "pending")) break;
        await new Promise((r) => setTimeout(r, 2500));
      }
      setUnlocking(false);
      // Real causes are in the server logs (keyed by reference). Users get a general message — and once money may have
      // moved, we never tell them to pay again; the reference is kept and retried on their next visit.
      const code = last?.code ?? "unavailable";
      let message: string = MESSAGES.unconfirmed(reference);
      if (code === "not_paid") {
        clearSaved();
        message = source === "redeem" ? MESSAGES.redeemNotPaid : MESSAGES.notPaid;
      } else if (code === "not_found") {
        if (source === "attempt") clearSaved(); // popup never got as far as creating the transaction
        if (source === "redeem") message = MESSAGES.redeemNotFound;
        else if (source !== "paid" && source !== "pending") message = MESSAGES.notFound;
      } else if (code === "invalid") {
        clearSaved();
        message = MESSAGES.unusable(reference);
      } else if (!quiet) {
        save(KEYS.pending, reference); // keep the promise in MESSAGES.unconfirmed: retried next visit
      }
      if (!quiet) {
        setUnlockError(message);
        report("unlock_failed", { reference, code: `${source}:${code}` });
      }
      return false;
    },
    [showResults],
  );

  // Restore grades and any earlier payment on this device, most urgent first.
  useEffect(() => {
    const storedGrades = load<GradeMap>(KEYS.grades);
    const storedUnlock = load<StoredUnlock>(KEYS.unlock);
    const pending = load<string>(KEYS.pending);
    let attempt = load<StoredAttempt>(KEYS.attempt);
    if (attempt && Date.now() - attempt.at > 14 * 864e5) {
      save(KEYS.attempt, null);
      attempt = null;
    }
    let ref: string | null = null;
    try {
      ref = new URLSearchParams(window.location.search).get("ref");
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from browser storage
    if (storedGrades) setGrades(storedGrades);
    if (storedUnlock) setPaidFor(storedUnlock);
    void (async () => {
      if (ref) return void unlock(ref, "url");
      if (pending) return void unlock(pending, "pending");
      if (attempt && attempt.reference !== storedUnlock?.reference && (await unlock(attempt.reference, "attempt"))) return;
      if (storedUnlock) void unlock(storedUnlock.reference, "stored");
    })();
  }, [unlock]);

  const setGrade = (id: string, g: Grade | "") => {
    setGrades((prev) => {
      const next = { ...prev };
      if (g) next[id] = g;
      else delete next[id];
      // Only one Mathematics paper is sat.
      if (g && id === "MAT_A") delete next.MAT_B;
      if (g && id === "MAT_B") delete next.MAT_A;
      save(KEYS.grades, next);
      return next;
    });
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agg) {
      setError(`Enter grades for at least 7 subjects (you have ${count}).`);
      return;
    }
    if (paidFor && paidFor.grades === canonical) {
      void unlock(paidFor.reference, "restore");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await postJson<MatchResponse>("/api/match", { grades });
    setLoading(false);
    if (res.ok) showResults(res.data, canonical);
    else setError(res.error.error);
  };

  const restorePaid = () => {
    if (paidFor) void unlock(paidFor.reference, "restore");
  };

  return (
    <>
      <form onSubmit={submit} className="overflow-clip rounded-card bg-canvas" aria-label="KCSE grades">
        <div className="px-5 pt-2 sm:px-7">
          {SECTIONS.map((section) => (
            <fieldset key={section.title} className="border-b border-hairline py-5 last:border-b-0">
              <legend className="sr-only">{section.title}</legend>
              <p aria-hidden className="mb-1 text-small font-semibold text-slate">
                {section.title}
              </p>
              <div className="grid gap-x-10 sm:grid-cols-2">
                {section.ids.map((id) => (
                  <GradeRow key={id} id={id} name={NAME[id]} value={grades[id]} onChange={setGrade} />
                ))}
              </div>
            </fieldset>
          ))}
          <details className="group border-t border-hairline py-4" open={MORE.some((s) => grades[s.id])}>
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-body text-link">
              More subjects
              <span aria-hidden className="text-small transition-transform group-open:rotate-45">
                +
              </span>
              <span className="hidden text-small text-slate sm:inline">French, Home Science, Music and others</span>
            </summary>
            <div className="grid gap-x-10 pb-2 sm:grid-cols-2">
              {MORE.map((s) => (
                <GradeRow key={s.id} id={s.id} name={s.name} value={grades[s.id]} onChange={setGrade} />
              ))}
            </div>
          </details>
        </div>

        <div className="sticky bottom-0 z-10 flex items-center gap-4 border-t border-hairline bg-frost/95 px-5 py-3 backdrop-blur-xl sm:px-7">
          <div className="min-w-0 flex-1" aria-live="polite">
            {agg ? (
              <p className="text-body-tight">
                <span className="text-slate">Mean grade </span>
                <strong className="font-semibold">{agg.meanGrade}</strong>
                <span className="tabular block text-caption text-slate">{agg.total} of 84 points</span>
              </p>
            ) : (
              <p className="text-small text-slate">
                <span className="tabular font-semibold text-ink">{count}</span> of 7 subjects
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="min-h-11 shrink-0 rounded-pill bg-action px-6 text-body-tight text-white disabled:bg-control disabled:text-slate"
          >
            {loading ? "Checking…" : "Show my courses"}
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-4 px-1 text-small font-semibold text-launch">
          {error}
        </p>
      )}
      {paidFor && !result?.unlocked && paidFor.grades !== canonical && (
        <p className="mt-4 px-1 text-small text-slate">
          You&apos;ve already unlocked results on this device.{" "}
          <button type="button" onClick={restorePaid} className="text-link hover:underline">
            View the grades you paid for ›
          </button>
        </p>
      )}
      {unlocking && !result && (
        <p className="mt-4 px-1 text-small text-slate">
          {unlockSource === "attempt" ? "Checking whether your last payment went through…" : "Loading your unlocked results…"}
        </p>
      )}
      {!result && <RedeemBox className="mt-4" busy={unlocking} onRedeem={(ref) => void unlock(ref, "redeem")} />}
      {unlockError && !unlocking && (!result || result.unlocked) && (
        <p role="alert" className="mt-4 px-1 text-small font-semibold text-launch">
          {unlockError}
        </p>
      )}

      <div ref={resultsRef} className="scroll-mt-16">
        {result && (
          <Results
            result={result}
            canonical={canonical}
            stale={resultFor !== canonical}
            unlocking={unlocking}
            unlockError={unlockError}
            onPaid={(ref) => {
              save(KEYS.pending, ref);
              void unlock(ref, "paid");
            }}
            onRedeem={(ref) => void unlock(ref, "redeem")}
            onPayError={setUnlockError}
          />
        )}
      </div>
    </>
  );
}

function GradeRow({ id, name, value, onChange }: { id: string; name: string; value?: Grade; onChange: (id: string, g: Grade | "") => void }) {
  return (
    <label className="flex min-h-14 items-center justify-between gap-4">
      <span className="text-body">{name}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(id, e.target.value as Grade | "")}
        className={`tabular h-11 w-[92px] rounded-pill border bg-canvas pl-5 text-body ${
          value ? "border-ink font-semibold text-ink" : "border-hairline text-steel"
        }`}
        aria-label={`${name} grade`}
      >
        <option value="">—</option>
        {GRADES.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </label>
  );
}
