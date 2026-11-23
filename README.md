# KCSE Course Matcher

KCSE grades → mean grade, KUCCPS weighted cluster points for all 20 clusters, and the degree programmes a student can
realistically get, compared with past KUCCPS cutoffs. Top 5 free; full list and PDF unlocked with a KES 149 Paystack payment.
No database, no accounts.

Next.js 16 (App Router), TypeScript and Tailwind 4. Pages are static. Two serverless routes do the matching and payment checks.

## Setup

```bash
npm install
cp .env.example .env.local   # add Paystack test keys
npm run dev
```

| Variable | Where it's used |
| --- | --- |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Inline checkout in the browser |
| `PAYSTACK_SECRET_KEY` | `/api/unlock` verifies the transaction server-side |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL, `sitemap.xml`, `robots.txt`, OG image URLs |

On Vercel, set the same three variables under Project → Settings → Environment Variables. Use live keys in Production.

## Data

```bash
npm run parse-data   # data/raw/*.pdf → data/clusters.json, data/programmes.json, data/parse-report.md
npm run selftest     # formula, aggregate, tiering and Paystack-verification checks
```

`data/raw/` is gitignored because the KUCCPS PDFs are copyrighted. Download them from the KUCCPS student portal
(Downloads), put them in `data/raw/` on your machine, and commit only the generated JSON. The build never reads the PDFs.

The parser detects each PDF by its header row, so file names don't matter:

- **Cluster document** (`DEGREE_CLUSTER_DOCUMENT_*.pdf`): the 4 subject slots for each of the 20 clusters, plus each
  sub-cluster's minimum grades and programme names.
- **Programmes with cutoffs** (`DEGREE_PROGRAMMES_2025.pdf`): code, institution, name, a `CUTOFF - YYYY` column for each
  year, and minimum subject grades. Cutoffs from several files are merged by year, so dropping in a newer list adds its years.
- **Programmes with sub-clusters** (`DEGREE_PROGRAMMES.pdf`): sub-cluster and annual cost by code. These are joined
  onto the cutoff list.
- Anything else (for example the student guide) is skipped.

After each run, read `data/parse-report.md`. It lists programmes the parser couldn't place in a cluster, cells that are
clipped in the source PDF, and unknown subject codes. To fix those, edit these hand-maintained files and run the parser again:

- `data/overrides.json`: `{"programmes": {"1112633": {"subcluster": "2A"}}}` assigns a cluster; `"exclude": true` drops a
  programme; `{"clusters": {"8": {"slots": ["…", "…", "…", "…"]}}}` replaces a cluster's slot text.
- `data/cluster-names.json`: the KUCCPS PDFs don't print cluster names.

## How results are calculated

- **Aggregate t** (max 84): Mathematics + the better of English/Kiswahili/KSL + the best 5 other subjects (KNEC rules
  since the 2023 KCSE). Mean grade = round(t ÷ 7).
- **Raw cluster points r** (max 48): the best total from filling the cluster's 4 slots with 4 *different* subjects.
  "2nd/3rd GROUP II" in the KUCCPS document is handled by the distinct-subject rule. If any slot can't be filled, the
  weight is 0, as on the KUCCPS portal.
- **Weighted cluster points** C = √((r/48) × (t/84)) × 48, rounded to 3 decimal places.
- **Eligibility**: mean grade ≥ C+ and every minimum subject grade for the programme is met.
- **Fit** against each programme's most recent published cut-off. That's the column KUCCPS labels `2023` in its
  2025/2026 list, or `2022` for programmes with no 2023 figure. Safe ≥ +2, Close −2 to +2, Reach −4 to −2. Anything
  further below isn't shown. Every card and every PDF row shows the cut-off year, so nobody mistakes it for this year's number.

## Payments

1. The browser loads Paystack Inline JS only when the user taps Unlock, and opens checkout for KES 149. The student's
   grades go in the transaction `metadata`.
2. On success, `/api/unlock` calls `GET /transaction/verify/:reference` with the secret key. It checks that `status` is
   `success`, the currency is `KES` and the amount is at least 14900, then computes the full list **from the grades stored
   on the transaction**. A reference therefore unlocks only the grades that were paid for.
3. The reference is saved in `localStorage` (before verification, so a failed check is retried on the next visit) and
   added to the URL as `?ref=` so the student can come back later. Pending M-Pesa confirmations are retried for about 15 seconds.

Programme data never reaches the browser until payment. The free preview returns 5 rows, and the blurred cards are placeholders.

## Errors, logs and payments that fall through

Users only ever see general messages ("Payment failed. Please try again."). Once someone may already have paid, they
see "If you were charged, don't pay again" plus their payment reference, never "try again". The real cause goes to the
server logs as one JSON line per event (`lib/log.ts`). These lines never contain emails, grades or keys.

**Where to read them:** Vercel → your project → **Logs**, or `vercel logs <deployment-url>`. Search by event name or by
the payment reference the user gives you. Vercel keeps runtime logs for a limited time that depends on your plan. If you
need a longer history, add a log drain (Vercel → Settings → Log Drains).

| Event | Level | Meaning |
| --- | --- | --- |
| `unlock_ok` | info | Payment verified and results unlocked (reference, amount, channel) |
| `paystack_charge_success` | info | From the webhook: Paystack charged the user |
| `payment_pending` | info | M-Pesa still processing; the browser retries |
| `paystack_config_missing` | error | `PAYSTACK_SECRET_KEY` not set on the server |
| `paystack_auth_failed` | error | Secret key rejected (wrong key, or a test/live key mix-up) |
| `paystack_unreachable` / `paystack_verify_error` | error | Network or Paystack outage |
| `payment_amount_mismatch` | error | Paid less than KES 149, or not in KES |
| `payment_missing_grades` | error | Paid, but the transaction has no grades attached |
| `payment_not_successful` / `paystack_reference_not_found` | warn | Failed or abandoned payment, or an unknown reference |
| `unlock_exception` / `match_exception` | error | Unexpected server error (`detail` has the message) |
| `client_checkout_not_configured` | warn | Browser build has no `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` |
| `client_checkout_script_failed` / `client_checkout_error` | warn | Paystack popup couldn't load, or reported an error (includes the user agent) |
| `client_unlock_failed` | warn | The user saw an unlock error (reference + code) |
| `webhook_bad_signature` / `webhook_config_missing` | warn/error | Webhook rejected or not configured |

**Catching payments that fell through:** in Paystack → Settings → API Keys & Webhooks, set the webhook URL to
`https://<your-domain>/api/paystack-webhook`. Any reference with `paystack_charge_success` but no `unlock_ok` is a user
who paid and didn't get their results.

**Lost-payment recovery built into the site:**
- Before Paystack opens, the browser generates the reference itself (`KCM-XXXXX-XXXXX`), shows it on screen and saves it
  on the phone. If the tab closes or the phone dies during the M-Pesa prompt, the next visit on that phone checks the
  reference quietly. If it was paid, the results unlock; if it wasn't, it's dropped and the user sees nothing.
- **"Already paid? Enter your payment reference"** appears under the grade form and inside the unlock box. It accepts the
  reference from the Paystack receipt email and tolerates messy pastes like `reference: kcm 7h3kq px9tm`. If someone
  types the M-Pesa SMS code by mistake, it tells them that's the wrong code.
- Each `/api/unlock` log line has a `source` (`paid`, `pending`, `attempt`, `redeem`, `url`, `restore`, `stored`).
  Filter out `attempt` and `stored`, which are quiet background checks.

**Recovering one:** every payment, including its grades, is kept permanently in the Paystack dashboard. Find the
transaction by reference or email and send the user `https://<your-domain>/?ref=<reference>`. That link unlocks
their results on any device. The browser also saves a paid-but-unconfirmed reference and retries it every time the
user comes back, so once a configuration problem is fixed, those users unlock automatically.

## Performance

- No web fonts; native `<select>` elements.
- First load is about 180 KB of gzipped JS, mostly the React/Next runtime. The calculator itself is about 7 KB.
- Paystack (on Unlock) and jsPDF (about 130 KB, on Download) load only when used.
- The free API response is about 3 KB. The full unlock response is about 35 KB gzipped for roughly 1,900 matches.
