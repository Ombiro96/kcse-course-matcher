import type { MatchResponse } from "../api";
import { SITE_NAME, SITE_URL } from "../site";
import { SUBJECT_BY_ID, parseCanonicalGrades } from "../subjects";

const TIER_LABEL = { safe: "Safe", close: "Close", reach: "Reach" } as const;

/** Builds the PDF in the browser. jsPDF (~120 KB gz) is only downloaded when someone taps the button. */
export async function downloadPdf(res: MatchResponse) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const margin = 36;
  let y = margin + 4;

  doc.setFont("helvetica", "bold").setFontSize(15).text(`${SITE_NAME}: your KUCCPS degree matches`, margin, y);
  y += 18;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  const intro = doc.splitTextToSize(
    `Generated ${new Date().toLocaleDateString("en-KE", { dateStyle: "long" })} · Compared with each programme's most recent published KUCCPS cut-off; the year is on every row. These are not this year's cut-offs.`,
    doc.internal.pageSize.getWidth() - margin * 2,
  );
  doc.text(intro, margin, y);
  y += (intro.length - 1) * 11;
  if (res.reference) {
    y += 12;
    doc.text(`Payment reference: ${res.reference}`, margin, y);
  }
  y += 18;

  const grades = res.grades ? parseCanonicalGrades(res.grades) : null;
  doc.setTextColor(20).setFontSize(10);
  doc.text(`Mean grade ${res.meanGrade} (${res.total}/84 points) · ${res.totalMatches} programmes: ${res.counts.safe} Safe, ${res.counts.close} Close, ${res.counts.reach} Reach`, margin, y);
  y += 14;
  if (grades) {
    const line = Object.entries(grades).map(([id, g]) => `${SUBJECT_BY_ID[id]?.name ?? id} ${g}`).join(" · ");
    const wrapped = doc.setFontSize(8.5).setTextColor(90).splitTextToSize(line, doc.internal.pageSize.getWidth() - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 11 + 4;
  }
  const weights = res.clusters.filter((c) => c.weight > 0).map((c) => `${c.id}: ${c.weight.toFixed(3)}`).join("  ·  ");
  const wrappedW = doc.setFontSize(8.5).splitTextToSize(`Cluster points — ${weights}`, doc.internal.pageSize.getWidth() - margin * 2);
  doc.text(wrappedW, margin, y);
  y += wrappedW.length * 11 + 6;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["#", "Programme", "Institution", "Code", "Cl.", "Your pts", "Cut-off", "Year", "Diff", "Fit"]],
    body: res.matches.map((m, i) => [
      i + 1,
      m.name,
      m.institution,
      m.code,
      m.cluster,
      m.weight.toFixed(3),
      m.cutoff.toFixed(3),
      m.cutoffYear,
      `${m.diff >= 0 ? "+" : ""}${m.diff.toFixed(2)}`,
      TIER_LABEL[m.tier],
    ]),
    styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [29, 29, 31] },
    columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 138 }, 2: { cellWidth: 112 }, 3: { cellWidth: 46 }, 4: { cellWidth: 20 }, 7: { cellWidth: 30 } },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7).setTextColor(120);
      doc.text(`Estimates from past cut-offs. Cut-offs change every year; confirm on the official KUCCPS portal. Not affiliated with KUCCPS. ${SITE_URL}`, margin, h - 18);
    },
  });
  doc.save(`kuccps-matches-${res.meanGrade.replace("+", "plus").replace("-", "minus")}.pdf`);
}
