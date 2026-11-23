/**
 * Parses KUCCPS PDFs in data/raw into data/clusters.json and data/programmes.json.
 *
 *   npm run parse-data
 *
 * Handles three kinds of PDF, detected per page from the header row:
 *   1. Cluster document ("Subject 1 … Subject 4" blocks, sub-clusters like "2A" with programme names)
 *   2. Programme + cutoff tables  ("PROG CODE | INSTITUTION NAME | PROGRAMME NAME | CUTOFF - YYYY … | SUBJECT 1–4")
 *   3. Programme + sub-cluster tables ("No | SUB CLUSTER | PROG CODE | INSTITUTION NAME | PROGRAMME NAME | PROGRAMME COST")
 * Other PDFs (e.g. the student guide) are skipped.
 *
 * Text comes from pdf.js text items (one item per spreadsheet cell line) and is assigned to columns by x-position,
 * so it survives the column shifts between pages that break plain `pdftotext -layout` parsing.
 *
 * Hand-maintained inputs: data/cluster-names.json (cluster names are not printed in the PDFs) and
 * data/overrides.json (fixes for anything the parser gets wrong). See data/parse-report.md after each run.
 */
import fs from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { SUBJECT_BY_CODE, SUBJECT_BY_ID, subjectsInGroup, isGrade, type Grade, type SubjectGroup } from "../lib/subjects";
import type { Cluster, ClustersFile, Programme, ProgrammesFile, SubCluster, SubjectRequirement } from "../lib/types";

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "data", "raw");
const OUT_DIR = path.join(ROOT, "data");

const report: string[] = [];
const warn = (msg: string) => report.push(`- ${msg}`);

// ---------------------------------------------------------------------------------------------------------------
// PDF → positioned lines

interface Item {
  str: string;
  x: number;
  y: number; // from top of page
  w: number;
}
interface Line {
  y: number;
  items: Item[];
  text: string;
}

async function loadPages(file: string): Promise<Line[][]> {
  const task = getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 });
  const doc = await task.promise;
  const pages: Line[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const it of content.items) {
      if (!("str" in it)) continue;
      const str = it.str.replace(/\s+/g, " ").trim();
      if (!str) continue;
      items.push({ str, x: it.transform[4], y: height - it.transform[5], w: it.width });
    }
    pages.push(groupLines(items));
  }
  await task.destroy();
  return pages;
}

function groupLines(items: Item[]): Line[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(it.y - last.y) < 2) last.items.push(it);
    else lines.push({ y: it.y, items: [it], text: "" });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map((i) => i.str).join(" ");
  }
  return lines;
}

const isFooter = (l: Line) => /©|copyright|KUCCPS PORTAL|^\s*\d+\s+of\s+\d+\s*$/i.test(l.text);

// ---------------------------------------------------------------------------------------------------------------
// Text helpers

const SMALL_WORDS = new Set(["of", "and", "in", "with", "the", "for", "on", "at", "to", "&", "a", "an", "or"]);
const ACRONYMS = new Set(["IT", "ICT", "KCA", "ECDE", "HIV", "AIDS", "GIS", "USIU", "II", "III", "IV", "LLB", "LL.B", "MBCHB", "B.SC", "BSC", "BED", "B.ED", "ICT,", "IT)", "IT,", "(IT)", "AMREF", "KAG", "PAC", "NGO", "TV", "UK"]);

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(?<=\/)|\s+/)
    .map((word, i) => {
      const bare = word.replace(/[^a-z.&]/g, "");
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper) || ACRONYMS.has(upper.replace(/[(),]/g, ""))) return upper;
      if (/^\(?[a-z]{1,3}(\.[a-z]{1,4})+\.?\)?,?$/.test(word)) return upper; // (ll.b.), b.sc, m.b.ch.b
      if (i > 0 && SMALL_WORDS.has(bare) && !/^\(/.test(word)) return word;
      const idx = word.search(/[a-z]/);
      return idx < 0 ? word : word.slice(0, idx) + word[idx].toUpperCase() + word.slice(idx + 1);
    })
    .join(" ")
    .replace(/\/ /g, "/");
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bin\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------------------------------------------
// Cluster subject slots

const ROMAN: Record<string, SubjectGroup> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
const ABBR: Record<string, string> = {
  ENG: "ENG", KIS: "KIS", BIO: "BIO", CHE: "CHE", PHY: "PHY", GEO: "GEO", HSC: "HSC", GSC: "GSC", HAG: "HAG",
  CRE: "CRE", IRE: "IRE", HRE: "HRE", FRE: "FRE", GER: "GER", MUS: "MUS", AGR: "AGR", AGRIC: "AGR", BST: "BST",
  CMP: "CMP", ARB: "ARB", KSL: "KSL",
};
const FILLER = new Set(["OR", "ANY", "AND", "THE", "PLAIN", "AN", "ND", "RD", "SUBJECT"]);

export function slotSubjects(text: string, unknown: string[] = []): string[] {
  let t = ` ${text.toUpperCase().replace(/[–—]/g, "-")} `;
  const set = new Set<string>();
  const MAT = String.raw`MAT(?:HEMATICS)?\s*ALTERNATIVE\s*`;
  t = t.replace(new RegExp(`${MAT}A\\s*/\\s*(?:${MAT})?B`, "g"), () => (set.add("MAT_A"), set.add("MAT_B"), " "));
  t = t.replace(new RegExp(`${MAT}A`, "g"), () => (set.add("MAT_A"), " "));
  t = t.replace(new RegExp(`${MAT}B`, "g"), () => (set.add("MAT_B"), " "));
  t = t.replace(/(?:ANY|AN|A|2ND|3RD|4TH)?\s*GROUP\s+(IV|V|III|II|I)\b/g, (_, g: string) => {
    for (const id of subjectsInGroup(ROMAN[g])) set.add(id);
    return " ";
  });
  for (const m of t.matchAll(/\b[A-Z]{2,6}\b/g)) {
    if (ABBR[m[0]]) set.add(ABBR[m[0]]);
    else if (!FILLER.has(m[0])) unknown.push(m[0]);
  }
  return [...set].sort();
}

const GRADE_TAIL = /\s*[-–]\s*(?:[A-E]\s*[+-]?\s*(?:\(\s*PLAIN\s*\))?)?\s*$/i;
const hasGrade = (s: string) => /\b[A-E]\s*\(\s*PLAIN\s*\)|[-–]\s*[A-E]\s*\+?\s*$|[-–]\s*$/i.test(s);
const stripGrade = (s: string) => s.replace(GRADE_TAIL, "").trim();
const dangles = (s: string) => /(?:\bor|\bany|\ba|\ban|\/|GROUP)\s*$/i.test(s.trim());
const isProgrammeName = (s: string) => /^(Bachelor|Doctor|Master)/i.test(s);

interface ClusterDraft {
  id: number;
  slotTexts: string[];
  subclusters: SubCluster[];
}

function parseClusterDoc(pages: Line[][], file: string): ClusterDraft[] {
  const clusters = new Map<number, ClusterDraft>();
  let cluster: ClusterDraft | null = null;
  let cols: number[] = [];
  let block: string[][] | null = null; // slot text fragments for the current "Subject 1–4" block
  let blockIsPrimary = false;
  let sub: SubCluster | null = null;
  let lastNameByCol: Record<number, number> = {}; // col → index in sub.programmeNames
  let linesSinceLabel = 99;
  let pendingNames: string[] = []; // names printed above their (vertically centred) sub-cluster label

  const colOf = (x: number) => {
    let best = 0;
    cols.forEach((cx, i) => {
      if (x >= cx - 8) best = i;
    });
    return best;
  };
  const commitBlock = () => {
    if (block && cluster && blockIsPrimary) cluster.slotTexts = block.map((f) => clean(f.join(" ")));
    block = null;
  };

  for (const page of pages) {
    for (const line of page) {
      if (isFooter(line)) continue;
      const headers = line.items.filter((i) => /^Subject\s*[1-4]$/i.test(i.str));
      if (headers.length >= 3) {
        commitBlock();
        const num = line.items.find((i) => /^\d{1,2}$/.test(i.str) && i.x < headers[0].x - 5);
        if (num) {
          const id = Number(num.str);
          if (!clusters.has(id)) clusters.set(id, { id, slotTexts: [], subclusters: [] });
          cluster = clusters.get(id)!;
        }
        if (!cluster) continue;
        cols = headers.map((h) => h.x);
        block = [[], [], [], []];
        blockIsPrimary = cluster.slotTexts.length === 0;
        sub = null;
        continue;
      }
      if (!cluster || cols.length === 0) continue;

      const label = line.items.find((i) => /^\d{1,2}\s?[A-Z]$/.test(i.str) && i.x < cols[0] - 5);
      if (label) {
        sub = { id: label.str.replace(/\s/g, ""), requirementsText: [], programmeNames: pendingNames };
        pendingNames = [];
        cluster.subclusters.push(sub);
        lastNameByCol = {};
        linesSinceLabel = 0;
      } else linesSinceLabel++;

      for (const it of line.items) {
        if (it === label || (/^\d{1,2}$/.test(it.str) && it.x < cols[0] - 5)) continue;
        const col = colOf(it.x);
        const text = it.str.replace(/^Subject\s*\d\s*/i, "");
        if (!text) continue;

        if (!sub) {
          // Still inside the slot block (before the first sub-cluster label).
          if (isProgrammeName(text)) pendingNames.push(clean(text));
          else block?.[col].push(stripGrade(text));
          continue;
        }
        // Slot text that wrapped onto the sub-cluster label line ("…or any" / "GROUP III").
        if (block && linesSinceLabel <= 1 && !hasGrade(text) && /GROUP/i.test(text) && dangles(block[col].join(" "))) {
          block[col].push(text);
          continue;
        }
        if (isProgrammeName(text)) {
          sub.programmeNames.push(clean(text));
          lastNameByCol[col] = sub.programmeNames.length - 1;
        } else if (lastNameByCol[col] !== undefined && /^[a-z(&]|^[A-Z][a-z]/.test(text) && !hasGrade(text)) {
          const i = lastNameByCol[col];
          sub.programmeNames[i] = clean(`${sub.programmeNames[i]} ${text}`);
        } else if (sub.programmeNames.length === 0) {
          sub.requirementsText.push(clean(text));
        } else {
          warn(`${file}: unplaced text in sub-cluster ${sub.id}: "${text}"`);
        }
      }
      if (sub && sub.programmeNames.length > 0) commitBlock();
    }
  }
  commitBlock();
  // Requirement fragments split across lines ("MAT ALTERNATIVE A/B -" + "C (PLAIN)").
  for (const c of clusters.values())
    for (const s of c.subclusters) {
      const merged: string[] = [];
      for (const r of s.requirementsText) {
        if (merged.length && /[-–]\s*$/.test(merged[merged.length - 1])) merged[merged.length - 1] += ` ${r}`;
        else merged.push(r);
      }
      s.requirementsText = merged;
    }
  return [...clusters.values()].sort((a, b) => a.id - b.id);
}

// ---------------------------------------------------------------------------------------------------------------
// Programme tables

type ColKey = string; // "inst" | "name" | "code" | "sub" | "cost" | "cut:2023" | "req1"…
interface Col {
  key: ColKey;
  x: number;
}

function detectColumns(lines: Line[]): { cols: Col[]; bottom: number } | null {
  const cols: Col[] = [];
  let bottom = 0;
  for (const line of lines.slice(0, 12)) {
    for (const it of line.items) {
      const s = it.str.toUpperCase();
      const add = (key: ColKey, x = it.x) => {
        cols.push({ key, x });
        bottom = Math.max(bottom, it.y);
      };
      if (s === "INSTITUTION NAME") add("inst");
      else if (s === "PROGRAMME NAME") add("name");
      else if (s === "CODE") add("code");
      else if (s === "COST") add("cost");
      else if (s === "CLUSTER") add("sub");
      else if (/^SUBJECT\s*[1-4]$/.test(s)) add(`req${s.slice(-1)}`);
      // "CUTOFF - 2023" — occasionally two headers share one text item; estimate each x from its char offset.
      for (const m of s.matchAll(/CUTOFF\s*-\s*(\d{4})/g))
        add(`cut:${m[1]}`, it.x + (it.w * (m.index ?? 0)) / Math.max(1, s.length));
    }
  }
  if (!cols.some((c) => c.key === "inst") || !cols.some((c) => c.key === "name")) return null;
  cols.sort((a, b) => a.x - b.x);
  return { cols, bottom };
}

/** pdf.js sometimes merges neighbouring cells into one item ("19.914 MAT A(121):C+"). Split at the space nearest each column boundary. */
function splitAcrossColumns(it: Item, cols: Col[]): Item[] {
  const boundary = cols.map((c) => c.x).find((b) => b > it.x + 6 && b < it.x + it.w - 0.5);
  if (boundary === undefined || !it.str.includes(" ")) return [it];
  const charW = it.w / it.str.length;
  const target = (boundary - it.x) / charW;
  let best = -1;
  for (let i = 0; i < it.str.length; i++) if (it.str[i] === " " && (best < 0 || Math.abs(i - target) < Math.abs(best - target))) best = i;
  const a = it.str.slice(0, best).trim();
  const b = it.str.slice(best + 1).trim();
  if (!a || !b) return [it];
  const wa = best * charW;
  return [{ ...it, str: a, w: wa }, ...splitAcrossColumns({ ...it, str: b, x: Math.max(boundary, it.x + wa + charW), w: it.w - wa - charW }, cols)];
}

interface RawRow {
  code: string;
  cells: Record<ColKey, string[]>;
  page: number;
}

function parseProgrammeTable(pages: Line[][]): { rows: RawRow[]; years: string[]; kind: "cutoff" | "cluster" } | null {
  let layout: { cols: Col[]; bottom: number } | null = null;
  const rows: RawRow[] = [];
  const years = new Set<string>();
  let kind: "cutoff" | "cluster" | null = null;

  pages.forEach((lines, pageIdx) => {
    const detected = detectColumns(lines);
    if (detected) layout = detected;
    if (!layout) return;
    const { cols, bottom } = layout;
    for (const c of cols) if (c.key.startsWith("cut:")) years.add(c.key.slice(4));
    kind ??= cols.some((c) => c.key.startsWith("cut:")) ? "cutoff" : cols.some((c) => c.key === "sub") ? "cluster" : null;

    const instX = cols.find((c) => c.key === "inst")!.x;
    const isNumeric = (s: string) => /^(?:-+|\d[\d,]*(?:\.\d+)?)$/.test(s);
    /** Column for an item. Text cells are left-aligned, so a non-numeric item never belongs to a cutoff/cost column. */
    const colOf = (it: Item, strict: boolean): ColKey | null => {
      let idx = -1;
      cols.forEach((c, i) => {
        if (it.x >= c.x - 6) idx = i;
      });
      if (idx < 0) return null;
      while (!isNumeric(it.str) && /^(cut:|cost)/.test(cols[idx].key) && idx + 1 < cols.length && it.x + it.w > cols[idx + 1].x - 6) idx++;
      if (!isNumeric(it.str) && /^(cut:|cost)/.test(cols[idx].key)) return null;
      if (strict) {
        // Wrapped continuation lines are left-aligned and fit inside their column. Anything else on a
        // non-anchor line (e.g. a centred group title) is not part of the row.
        const next = cols[idx + 1]?.x ?? Infinity;
        if (Math.abs(it.x - cols[idx].x) > 6 || it.x + it.w > next + 4) return null;
      }
      return cols[idx].key;
    };
    let current: RawRow | null = null;
    let lastY = 0;
    for (const raw of lines) {
      // Split merged cells, but only for items that start at a column edge — a centred group title
      // ("BACHELOR OF ARTS (DESIGN)") starts mid-column and must stay whole so it gets rejected below.
      // Numbers are right-aligned, so an item starting with a number ("43.794 MAT A(121):C+") is always a merged data cell.
      const atEdge = (it: Item) => /^(?:\d|-(?:\s|$))/.test(it.str) || cols.some((c) => Math.abs(it.x - c.x) <= 6);
      const items = raw.items.flatMap((it) => (it.x < instX - 3 || !atEdge(it) ? [it] : splitAcrossColumns(it, cols)));
      const line: Line = { ...raw, items };
      if (detected && line.y <= bottom + 1) continue;
      if (isFooter(line)) {
        current = null;
        continue;
      }
      const left = line.items.filter((i) => i.x < instX - 3);
      const leftText = left.map((i) => i.str).join(" ");
      const anchor = leftText.match(/(?:^|\s)(\d{4}[0-9A-Z]{3})$/);
      if (anchor) {
        current = { code: anchor[1], cells: {}, page: pageIdx + 1 };
        rows.push(current);
        // The sub-cluster column sits left of the code; pick it out of the left-hand items.
        const subItem = left.find((i) => /^\d{1,2}[A-Z]$/.test(i.str));
        if (subItem) current.cells.sub = [subItem.str];
      } else if (!current || line.y - lastY > 24) {
        current = null;
        continue;
      }
      lastY = line.y;
      for (const it of line.items) {
        if (it.x < instX - 3) continue;
        const key = colOf(it, !anchor);
        if (!key) continue;
        (current.cells[key] ??= []).push(it.str);
      }
    }
  });
  if (!kind) return null;
  return { rows, years: [...years].sort(), kind };
}

const shortName = (id: string) => id.replace("_", " ");

const REQ_RE = /((?:[^:]*?\(\s*\d{3}\s*\))+)[^:]*?:\s*([A-E][+-]?)/g;

function parseRequirements(cells: string[], ctx: string): { reqs: SubjectRequirement[]; unreadable: boolean } {
  const out: SubjectRequirement[] = [];
  let unreadable = false;
  for (const cell of cells) {
    const text = cell.replace(/\s+/g, " ").trim();
    if (!text || text === "-") continue;
    let matched = false;
    for (const m of text.matchAll(REQ_RE)) {
      matched = true;
      const codes = [...m[1].matchAll(/\(\s*(\d{3})\s*\)/g)].map((c) => Number(c[1]));
      const subjects: string[] = [];
      for (const code of codes) {
        const s = SUBJECT_BY_CODE[code];
        if (s) subjects.push(s.id);
        else warn(`${ctx}: unknown subject code ${code} in "${text}"`);
      }
      const grade = m[2] as Grade;
      const uniq = [...new Set(subjects)];
      if (uniq.length && isGrade(grade)) out.push({ subjects: uniq, grade, text: `${uniq.map(shortName).join("/")} ${grade}` });
    }
    if (!matched) {
      unreadable = true;
      warn(`${ctx}: could not read requirement "${text}" (clipped in PDF?) — using sub-cluster minimums from the cluster document`);
    }
  }
  return { reqs: out, unreadable };
}

/** "BIO/CHE/PHY - C (PLAIN)" or "MAT ALTERNATIVE A - C+" from the cluster document. */
function parseDocRequirement(text: string): SubjectRequirement | null {
  const m = text.match(/[-–]\s*([A-E])\s*([+-]?)\s*(?:\(\s*PLAIN\s*\))?\s*\/?\s*$/i);
  if (!m) return null;
  const grade = `${m[1].toUpperCase()}${m[2]}`;
  const subjects = slotSubjects(text.slice(0, m.index));
  return subjects.length && isGrade(grade) ? { subjects, grade, text: `${subjects.map(shortName).join("/")} ${grade}` } : null;
}

const num = (cells?: string[]) => {
  const s = (cells ?? []).join("").replace(/,/g, "").trim();
  if (!s || /^-+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

// ---------------------------------------------------------------------------------------------------------------

interface Overrides {
  clusters?: Record<string, { slots?: string[] }>;
  programmes?: Record<string, { subcluster?: string; exclude?: boolean }>;
}

async function main() {
  if (!fs.existsSync(RAW_DIR)) throw new Error(`Put KUCCPS PDFs in ${RAW_DIR}`);
  const files = fs.readdirSync(RAW_DIR).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
  if (!files.length) throw new Error(`No PDFs in ${RAW_DIR}`);

  const clusterNames: Record<string, string> = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "cluster-names.json"), "utf8"));
  const overridesPath = path.join(OUT_DIR, "overrides.json");
  const overrides: Overrides = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, "utf8")) : {};

  let clusterDrafts: ClusterDraft[] = [];
  let clusterSource = "";
  const cutoffTables: { file: string; rows: RawRow[]; years: string[] }[] = [];
  const clusterTables: { file: string; rows: RawRow[] }[] = [];
  const used: string[] = [];

  for (const file of files) {
    const pages = await loadPages(path.join(RAW_DIR, file));
    const allText = pages.flat().map((l) => l.text).join("\n");
    if (/Subject\s*1/.test(allText) && /Subject\s*4/.test(allText) && !/INSTITUTION NAME/i.test(allText)) {
      const drafts = parseClusterDoc(pages, file);
      if (drafts.length) {
        if (clusterDrafts.length) warn(`More than one cluster document; using ${file} (last alphabetically)`);
        clusterDrafts = drafts;
        clusterSource = file;
        used.push(file);
        console.log(`${file}: cluster document, ${drafts.length} clusters`);
        continue;
      }
    }
    const table = parseProgrammeTable(pages);
    if (table?.kind === "cutoff") {
      cutoffTables.push({ file, rows: table.rows, years: table.years });
      used.push(file);
      console.log(`${file}: programme table with cutoffs ${table.years.join(", ")}, ${table.rows.length} rows`);
    } else if (table?.kind === "cluster") {
      clusterTables.push({ file, rows: table.rows });
      used.push(file);
      console.log(`${file}: programme table with sub-clusters, ${table.rows.length} rows`);
    } else {
      console.log(`${file}: skipped (no programme or cluster table found)`);
    }
  }
  if (!clusterDrafts.length) throw new Error("No cluster document found in data/raw");
  if (!cutoffTables.length) throw new Error("No programme table with cutoff columns found in data/raw");

  // ---- clusters.json
  const clusters: Cluster[] = clusterDrafts.map((d) => {
    const texts = overrides.clusters?.[d.id]?.slots ?? d.slotTexts;
    if (overrides.clusters?.[d.id]?.slots) warn(`Cluster ${d.id}: slots taken from overrides.json`);
    const slots = texts.map((text, i) => {
      const unknown: string[] = [];
      const subjects = slotSubjects(text, unknown);
      if (unknown.length) warn(`Cluster ${d.id} subject ${i + 1}: ignored tokens ${unknown.join(", ")} in "${text}"`);
      if (!subjects.length) warn(`Cluster ${d.id} subject ${i + 1}: NO SUBJECTS parsed from "${text}"`);
      return { text, subjects };
    });
    if (slots.length !== 4) warn(`Cluster ${d.id}: expected 4 subject slots, got ${slots.length}`);
    if (!clusterNames[d.id]) warn(`Cluster ${d.id}: no name in cluster-names.json`);
    return { id: d.id, name: clusterNames[d.id] ?? `Cluster ${d.id}`, slots, subclusters: d.subclusters };
  });
  const ids = clusters.map((c) => c.id);
  for (let i = 1; i <= 20; i++) if (!ids.includes(i)) warn(`Cluster ${i} missing from cluster document`);

  // ---- programmes.json
  const subByCode = new Map<string, { sub: string; cost: number | null }>();
  for (const t of clusterTables)
    for (const r of t.rows) {
      const sub = r.cells.sub?.[0];
      if (!sub) {
        warn(`${t.file} p${r.page}: ${r.code} has no sub-cluster`);
        continue;
      }
      const cost = num(r.cells.cost);
      subByCode.set(r.code, { sub, cost: Number.isNaN(cost) ? null : cost });
    }
  const suffixVotes = new Map<string, Map<string, number>>();
  for (const [code, { sub }] of subByCode) {
    const m = suffixVotes.get(code.slice(4)) ?? new Map<string, number>();
    m.set(sub, (m.get(sub) ?? 0) + 1);
    suffixVotes.set(code.slice(4), m);
  }
  const subByName = new Map<string, Set<string>>();
  for (const c of clusters)
    for (const s of c.subclusters)
      for (const n of s.programmeNames) {
        const key = normaliseName(n);
        (subByName.get(key) ?? subByName.set(key, new Set()).get(key)!).add(s.id);
      }
  const validSubs = new Set(clusters.flatMap((c) => c.subclusters.map((s) => s.id)));

  const byCode = new Map<string, Programme>();
  const needsDocReqs = new Set<string>();
  const allYears = new Set<string>();
  // Later files (alphabetically) win on name/institution/requirements; cutoffs from all files are merged by year.
  for (const t of cutoffTables) {
    t.years.forEach((y) => allYears.add(y));
    for (const r of t.rows) {
      const ctx = `${t.file} p${r.page} ${r.code}`;
      const name = clean((r.cells.name ?? []).join(" "));
      const institution = clean((r.cells.inst ?? []).join(" "));
      if (!name || !institution) warn(`${ctx}: missing name or institution`);
      const cutoffs: Record<string, number | null> = {};
      for (const y of t.years) {
        const v = num(r.cells[`cut:${y}`]);
        if (Number.isNaN(v) || (v !== null && (v < 0 || v > 48))) {
          warn(`${ctx}: unreadable ${y} cutoff "${(r.cells[`cut:${y}`] ?? []).join(" ")}"`);
          cutoffs[y] = null;
        } else cutoffs[y] = v;
      }
      const reqCells = [1, 2, 3, 4].map((i) => (r.cells[`req${i}`] ?? []).join(""));
      const { reqs, unreadable } = parseRequirements(reqCells, ctx);
      if (unreadable) needsDocReqs.add(r.code);
      else needsDocReqs.delete(r.code);
      const prev = byCode.get(r.code);
      byCode.set(r.code, {
        code: r.code,
        name: titleCase(name),
        institution: titleCase(institution),
        cluster: null,
        subcluster: null,
        clusterSource: null,
        cutoffs: { ...(prev?.cutoffs ?? {}), ...cutoffs },
        requirements: reqs,
        minMeanGrade: "C+",
        cost: null,
      });
    }
  }

  const unresolved: Programme[] = [];
  let bySuffix = 0, byName = 0, byOverride = 0, nameDisagrees = 0;
  for (const p of byCode.values()) {
    const o = overrides.programmes?.[p.code];
    const known = subByCode.get(p.code);
    const nameSubs = subByName.get(normaliseName(p.name));
    if (o?.subcluster) {
      p.subcluster = o.subcluster;
      p.clusterSource = "override";
      byOverride++;
    } else if (known) {
      p.subcluster = known.sub;
      p.clusterSource = "code";
      if (nameSubs && !nameSubs.has(known.sub)) nameDisagrees++;
    } else {
      const votes = suffixVotes.get(p.code.slice(4));
      const total = votes ? [...votes.values()].reduce((a, b) => a + b, 0) : 0;
      const [topSub, topCount] = votes ? [...votes.entries()].sort((a, b) => b[1] - a[1])[0] : ["", 0];
      if (total >= 2 && topCount / total >= 0.9 && (!nameSubs || nameSubs.has(topSub))) {
        p.subcluster = topSub;
        p.clusterSource = "suffix";
        bySuffix++;
      } else if (nameSubs?.size === 1) {
        p.subcluster = [...nameSubs][0];
        p.clusterSource = "name";
        byName++;
      }
    }
    if (p.subcluster) {
      if (!validSubs.has(p.subcluster)) warn(`${p.code}: sub-cluster ${p.subcluster} not in cluster document`);
      p.cluster = Number.parseInt(p.subcluster, 10);
    } else unresolved.push(p);
    p.cost = known?.cost ?? null;
    if (needsDocReqs.has(p.code)) {
      const sub = clusters.flatMap((c) => c.subclusters).find((s) => s.id === p.subcluster);
      const docReqs = (sub?.requirementsText ?? []).map(parseDocRequirement).filter((r): r is SubjectRequirement => !!r);
      if (docReqs.length) p.requirements = docReqs;
      else warn(`${p.code}: requirement unreadable and no sub-cluster minimums to fall back on`);
    }
  }

  const excluded = new Set(Object.entries(overrides.programmes ?? {}).filter(([, v]) => v.exclude).map(([k]) => k));
  const programmes = [...byCode.values()]
    .filter((p) => !excluded.has(p.code))
    .sort((a, b) => a.code.localeCompare(b.code));
  const onlyInClusterTables = [...subByCode.keys()].filter((c) => !byCode.has(c));

  const now = new Date().toISOString();
  const clustersFile: ClustersFile = { meta: { generatedAt: now, source: clusterSource }, clusters };
  const programmesFile: ProgrammesFile = {
    meta: { generatedAt: now, sources: used.filter((f) => f !== clusterSource), cutoffYears: [...allYears].sort() },
    programmes,
  };
  fs.writeFileSync(path.join(OUT_DIR, "clusters.json"), JSON.stringify(clustersFile, null, 1) + "\n");
  fs.writeFileSync(path.join(OUT_DIR, "programmes.json"), JSON.stringify(programmesFile) + "\n");

  // ---- report
  const withCutoff = programmes.filter((p) => Object.values(p.cutoffs).some((v) => v !== null)).length;
  const summary = [
    `# Parse report`,
    ``,
    `Generated ${now}`,
    ``,
    `## Inputs`,
    ...files.map((f) => `- ${f}${used.includes(f) ? "" : " (skipped)"}`),
    ``,
    `## Clusters (${clusters.length})`,
    ...clusters.map((c) => `- **${c.id} ${c.name}**: ${c.slots.map((s) => `[${s.subjects.join(" ")}]`).join(" · ")} — sub-clusters ${c.subclusters.map((s) => s.id).join(", ")}`),
    ``,
    `## Programmes`,
    `- ${programmes.length} programmes, cutoff years ${[...allYears].join(", ")}`,
    `- ${withCutoff} have at least one cutoff; ${programmes.length - withCutoff} have none ("-")`,
    `- Cluster assigned: ${programmes.length - unresolved.length} (code ${programmes.length - unresolved.length - bySuffix - byName - byOverride}, code suffix ${bySuffix}, name ${byName}, override ${byOverride})`,
    `- Sub-cluster from code disagrees with cluster-document name match: ${nameDisagrees} (informational)`,
    `- In sub-cluster tables but not in any cutoff table (dropped): ${onlyInClusterTables.length}`,
    `- **No cluster (excluded from matching): ${unresolved.length}** — add to overrides.json → programmes → { "CODE": { "subcluster": "2A" } }`,
    ...unresolved.slice(0, 200).map((p) => `  - ${p.code} ${p.name} — ${p.institution}`),
    ``,
    `## Warnings (${report.length})`,
    ...report.slice(0, 400),
    ...(report.length > 400 ? [`- … ${report.length - 400} more`] : []),
    ``,
  ].join("\n");
  fs.writeFileSync(path.join(OUT_DIR, "parse-report.md"), summary);
  console.log(`\nclusters.json: ${clusters.length} clusters`);
  console.log(`programmes.json: ${programmes.length} programmes (${unresolved.length} without cluster), cutoff years ${[...allYears].join(", ")}`);
  console.log(`${report.length} warnings → data/parse-report.md`);
  // Sanity: subject ids used anywhere must exist.
  for (const c of clusters) for (const s of c.slots) for (const id of s.subjects) if (!SUBJECT_BY_ID[id]) throw new Error(`bad subject ${id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
