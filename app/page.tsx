import { Calculator } from "@/components/Calculator";
import { SiteNav } from "@/components/SiteNav";
import { dataMeta } from "@/lib/data";
import { getFaq } from "@/lib/faq";
import { FREE_PREVIEW, PRICE_KES, SITE_NAME, SITE_URL } from "@/lib/site";

// Real output of the calculator for this example student (see scripts/selftest.ts), shown as the hero "render".
const EXAMPLE = {
  grades: "Maths B+ · English B · Kiswahili A- · Biology B · Chemistry B- · Physics C+ · History A · Geography B+ · Agriculture C",
  meanGrade: "B+",
  total: 69,
  clusters: [
    { name: "Law", weight: 41.176 },
    { name: "Education", weight: 39.713 },
    { name: "Computing & IT", weight: 39.214 },
  ],
  course: { name: "Bachelor of Laws (LL.B.)", institution: "Kisii University", diff: "+2.25", cutoff: "38.924", cutoffYear: "2023" },
};

export default function Home() {
  const faq = getFaq(dataMeta.latestCutoffYear, dataMeta.cutoffYears, dataMeta.programmeCount);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: PRICE_KES, priceCurrency: "KES" },
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <SiteNav siteName={SITE_NAME} />

      <main id="top">
        {/* Hero */}
        <section className="px-4 pb-16 pt-14 text-center sm:px-6 sm:pb-[90px] sm:pt-20">
          <p className="font-display text-kicker font-semibold">KUCCPS Cluster Points Calculator</p>
          <h1 className="mx-auto mt-4 max-w-[820px] text-[44px] leading-[1.06] tracking-[-0.015em] sm:text-hero">
            Which degree courses can you get?
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-body text-slate sm:text-kicker sm:font-normal">
            Your KCSE grades in. Your mean grade, cluster points and best-fit courses out, checked against past KUCCPS cut-offs for{" "}
            {dataMeta.programmeCount.toLocaleString("en-KE")} degree programmes.
          </p>
          <div className="mt-7 flex items-center justify-center gap-6">
            <a href="#calculator" className="rounded-pill bg-action px-6 py-3 text-body-tight text-white">
              Enter your grades
            </a>
            <a href="#how" className="text-body text-link hover:underline">
              How it works ›
            </a>
          </div>

          <ExampleRender />
        </section>

        {/* Calculator */}
        <section id="calculator" aria-labelledby="calc-h" className="scroll-mt-12 bg-mist px-4 py-16 sm:px-6 sm:py-[90px]">
          <div className="mx-auto max-w-[692px]">
            <h2 id="calc-h" className="text-feature sm:text-display">
              Your grades.
            </h2>
            <p className="mt-3 mb-8 text-body text-slate">
              Pick the grade for each subject you sat. You need at least seven. Nothing is sent anywhere until you tap Show my courses.
            </p>
            <Calculator />
          </div>
        </section>

        {/* How it works — editorial block */}
        <section id="how" aria-labelledby="how-h" className="scroll-mt-12 px-4 py-16 sm:px-6 sm:py-[90px]">
          <div className="mx-auto max-w-[980px]">
            <p className="font-display text-kicker font-semibold">How it works</p>
            <h2 id="how-h" className="mt-3 max-w-[720px] text-feature sm:text-display">
              The same maths KUCCPS uses. Three steps.
            </h2>
            <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
              {[
                {
                  title: "Your aggregate",
                  body: "Mathematics, the better of English or Kiswahili, and your best five other subjects. Out of 84, the way KNEC counts it.",
                },
                {
                  title: "Your cluster points",
                  body: "For each of the 20 clusters we pick your best four subjects that fit its requirements, then weight them against your aggregate.",
                },
                {
                  title: "Your courses",
                  body: `Each programme's most recent published KUCCPS cut-off (mostly ${dataMeta.latestCutoffYear}) and minimum subject grades, compared with your points. Safe, Close or Reach.`,
                },
              ].map((s, i) => (
                <li key={s.title}>
                  <p className="tabular text-caption font-semibold text-slate">0{i + 1}</p>
                  <h3 className="mt-2 text-subtitle">{s.title}</h3>
                  <p className="mt-2 text-body text-slate">{s.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-14 rounded-card bg-mist px-6 py-10 text-center sm:py-14">
              <p className="text-caption text-slate">Weighted cluster points</p>
              <p className="mt-3 font-display text-title font-semibold sm:text-feature">C = √(r/48 × t/84) × 48</p>
              <p className="mx-auto mt-4 max-w-[520px] text-small text-slate">
                r is your total for the cluster&apos;s 4 subjects, t is your aggregate. The result is out of 48, to three decimals.
              </p>
            </div>
            <p className="mt-6 text-small text-slate">
              Your top {FREE_PREVIEW} courses are free. The full list and a PDF are KES {PRICE_KES}, once.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-h" className="scroll-mt-12 bg-mist px-4 py-16 sm:px-6 sm:py-[90px]">
          <div className="mx-auto max-w-[692px]">
            <h2 id="faq-h" className="text-feature sm:text-display">
              Questions.
            </h2>
            <div className="mt-8 rounded-card bg-canvas px-5 sm:px-7">
              {faq.map(({ q, a }) => (
                <details key={q} className="group border-b border-hairline last:border-b-0">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-body-tight font-semibold">
                    {q}
                    <span aria-hidden className="shrink-0 text-kicker font-normal text-steel transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="pb-5 text-body text-slate">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-mist px-4 pb-10 sm:px-6">
        <div className="mx-auto max-w-[980px] border-t border-hairline pt-5 text-caption text-slate">
          <p>
            Independent tool, not affiliated with KUCCPS or KNEC. Results are estimates from published past cutoffs, which change every
            year. Always confirm on the official KUCCPS student portal before you apply.
          </p>
          <p className="mt-3">
            {SITE_NAME} · Cut-offs as published by KUCCPS in its 2025/2026 programme list ({[...dataMeta.cutoffYears].reverse().join(" and ")})
          </p>
        </div>
      </footer>
    </>
  );
}

/** The hero's "product render": a worked example of the result, with a floating price callout. */
function ExampleRender() {
  return (
    <div className="relative mx-auto mt-14 max-w-[880px] sm:mt-20">
      <div className="rounded-card bg-mist px-4 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12">
        <p className="text-caption text-slate">Example result</p>
        <div className="mx-auto mt-5 max-w-[420px] rounded-card bg-canvas p-6 text-left sm:p-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-caption text-slate">Mean grade</p>
              <p className="font-display text-hero font-semibold">{EXAMPLE.meanGrade}</p>
            </div>
            <p className="tabular pb-3 text-small text-slate">{EXAMPLE.total} of 84</p>
          </div>
          <ul className="mt-5 space-y-4">
            {EXAMPLE.clusters.map((c) => (
              <li key={c.name}>
                <div className="flex justify-between text-small">
                  <span>{c.name}</span>
                  <span className="tabular font-semibold">{c.weight.toFixed(3)}</span>
                </div>
                <div className="mt-1.5 h-1 rounded-pill bg-control">
                  <div className="h-1 rounded-pill bg-ink" style={{ width: `${(c.weight / 48) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-hairline pt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-small font-semibold">{EXAMPLE.course.name}</p>
                <p className="text-caption text-slate">{EXAMPLE.course.institution}</p>
                <p className="tabular mt-1 text-caption text-slate">
                  {EXAMPLE.course.cutoffYear} cut-off: <span className="text-ink">{EXAMPLE.course.cutoff}</span>
                </p>
              </div>
              <p className="text-caption font-semibold text-link">Safe {EXAMPLE.course.diff}</p>
            </div>
          </div>
        </div>
        <p className="mx-auto mt-4 max-w-[420px] text-caption text-slate">{EXAMPLE.grades}</p>
      </div>
      {/* Floating price callout */}
      <div className="absolute inset-x-4 bottom-6 mx-auto flex max-w-[420px] items-center justify-between gap-4 rounded-card bg-canvas py-3 pl-6 pr-3 text-left shadow-ring">
        <p className="text-small">
          <span className="font-semibold">Top {FREE_PREVIEW} free</span>
          <span className="block text-caption text-slate">Full list + PDF, KES {PRICE_KES}</span>
        </p>
        <a href="#calculator" className="shrink-0 rounded-pill bg-action px-4 py-2 text-caption text-white">
          Start
        </a>
      </div>
    </div>
  );
}
