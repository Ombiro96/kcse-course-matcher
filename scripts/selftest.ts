// Sanity checks for the calculator. Run: npm run selftest
import assert from "node:assert/strict";
import clustersFile from "../data/clusters.json";
import programmesFile from "../data/programmes.json";
import { aggregate, rawClusterPoints, weightedClusterPoints } from "../lib/kcse";
import { runMatch, tierFor } from "../lib/match";
import type { Cluster, Programme } from "../lib/types";
import type { GradeMap } from "../lib/subjects";

const clusters = clustersFile.clusters as Cluster[];
const programmes = programmesFile.programmes as Programme[];

// Worked example widely published for the formula: r = 42, t = 72 → 41.569
assert.equal(weightedClusterPoints(42, 72), 41.569);
assert.equal(weightedClusterPoints(48, 84), 48);

// Aggregate: Maths + best language + best 5 others; mean grade = round(total / 7)
const g: GradeMap = { ENG: "B", KIS: "A-", MAT_A: "B+", BIO: "B", CHE: "B-", PHY: "C+", HAG: "A", GEO: "B+", AGR: "C" };
const agg = aggregate(g)!;
assert.deepEqual(agg.counted.slice(0, 2), ["MAT_A", "KIS"]);
assert.equal(agg.total, 10 + 11 + 12 + 10 + 9 + 9 + 8); // HAG, GEO, ENG, BIO, CHE
assert.equal(agg.meanGrade, "B+"); // 69 points → B+ (67–73)
assert.equal(aggregate({ ENG: "A" }), null);

// Distinct subjects per slot: cluster 9 needs MAT A + three different sciences
const c9 = clusters.find((c) => c.id === 9)!;
assert.equal(rawClusterPoints(c9, { MAT_A: "A", BIO: "A" }), null);
assert.equal(rawClusterPoints(c9, { MAT_A: "A", BIO: "A", CHE: "B", PHY: "C" })!.r, 12 + 12 + 9 + 6);
// Medicine cluster: missing chemistry → 0
assert.equal(rawClusterPoints(clusters.find((c) => c.id === 13)!, g)!.r, 9 + 8 + 10 + 12);

assert.equal(tierFor(2), "safe");
assert.equal(tierFor(1.999), "close");
assert.equal(tierFor(-2), "close");
assert.equal(tierFor(-2.001), "reach");
assert.equal(tierFor(-4.001), null);

const res = runMatch(g, clusters, programmes)!;
console.log("mean", res.aggregate.meanGrade, res.aggregate.total, "matches", res.matches.length, res.counts);
console.log(res.clusters.map((c) => `${c.id}:${c.weight}`).join(" "));
for (const m of res.matches.slice(0, 5)) console.log(m.tier, m.weight, m.cutoff, m.code, m.name, "—", m.institution);
for (const m of res.matches) {
  const p = programmes.find((p) => p.code === m.code)!;
  assert.ok(m.diff >= -4 && p.cluster === m.cluster);
}
const weak = runMatch({ ENG: "C", KIS: "C", MAT_A: "C-", BIO: "C", CHE: "C-", HAG: "C", AGR: "C" }, clusters, programmes)!;
assert.equal(weak.belowDegreeMinimum, true);
assert.equal(weak.matches.length, 0);
console.log("selftest ok");

// ---- Paystack verification (fetch mocked; needs --conditions=react-server for "server-only")
import("../lib/paystack").then(async ({ verifyPayment }) => {
  const realFetch = globalThis.fetch;
  const logged: string[] = [];
  const realLog = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (line: string) => logged.push(String(line));
  const lastEvent = () => JSON.parse(logged.at(-1)!).event as string;
  const mock = (data: object | null, status = 200) => {
    globalThis.fetch = (async () => new Response(JSON.stringify(data ? { status: true, message: "ok", data } : { status: false, message: "Transaction reference not found" }), { status })) as typeof fetch;
  };
  const grades = "BIO:B,CHE:B-,ENG:B,GEO:B+,HAG:A,KIS:A-,MAT_A:B+";

  delete process.env.PAYSTACK_SECRET_KEY;
  assert.deepEqual(await verifyPayment("ref_nokey"), { ok: false, status: 503, code: "unavailable" });
  assert.equal(lastEvent(), "paystack_config_missing");
  process.env.PAYSTACK_SECRET_KEY = "sk_test_dummy";

  mock({ status: "success", amount: 14900, currency: "KES", metadata: { grades } });
  const ok = await verifyPayment("ref_ok_123");
  assert.ok(ok.ok && ok.canonical === grades);
  mock({ status: "success", amount: 14900, currency: "KES", metadata: JSON.stringify({ grades }) });
  assert.ok((await verifyPayment("ref_str_meta")).ok, "metadata as string");
  mock({ status: "success", amount: 100, currency: "KES", metadata: { grades } });
  assert.deepEqual(await verifyPayment("ref_cheap"), { ok: false, status: 402, code: "not_paid" });
  assert.equal(lastEvent(), "payment_amount_mismatch");
  mock({ status: "success", amount: 14900, currency: "NGN", metadata: { grades } });
  assert.equal((await verifyPayment("ref_ngn")).ok, false);
  mock({ status: "ongoing", amount: 14900, currency: "KES", metadata: { grades } });
  assert.deepEqual(await verifyPayment("ref_pending"), { ok: false, status: 402, code: "pending" });
  mock({ status: "failed", amount: 14900, currency: "KES", metadata: { grades } });
  assert.deepEqual(await verifyPayment("ref_failed"), { ok: false, status: 402, code: "not_paid" });
  assert.equal(lastEvent(), "payment_not_successful");
  mock({ status: "success", amount: 14900, currency: "KES", metadata: { grades: "ENG:Z" } });
  assert.deepEqual(await verifyPayment("ref_badgrades"), { ok: false, status: 422, code: "invalid" });
  assert.equal(lastEvent(), "payment_missing_grades");
  mock(null, 400);
  assert.deepEqual(await verifyPayment("ref_missing"), { ok: false, status: 404, code: "not_found" });
  mock(null, 401);
  assert.deepEqual(await verifyPayment("ref_badkey"), { ok: false, status: 503, code: "unavailable" });
  assert.equal(lastEvent(), "paystack_auth_failed");
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  assert.deepEqual(await verifyPayment("ref_down"), { ok: false, status: 502, code: "unavailable" });
  assert.equal(lastEvent(), "paystack_unreachable");

  // Every log line is one JSON object with the reference, and never contains the secret key.
  for (const line of logged) {
    const o = JSON.parse(line);
    assert.ok(o.event && o.ts && o.reference, line);
    assert.ok(!line.includes("sk_test_dummy"), "secret leaked into logs");
  }
  Object.assign(console, realLog);
  globalThis.fetch = realFetch;
  console.log(`paystack verify ok (${logged.length} log lines checked)`);
});
