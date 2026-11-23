// KCSE subjects, KNEC codes and grade points. Shared by the PDF parser and the app.

export const GRADE_POINTS = {
  A: 12,
  "A-": 11,
  "B+": 10,
  B: 9,
  "B-": 8,
  "C+": 7,
  C: 6,
  "C-": 5,
  "D+": 4,
  D: 3,
  "D-": 2,
  E: 1,
} as const;

export type Grade = keyof typeof GRADE_POINTS;
export const GRADES = Object.keys(GRADE_POINTS) as Grade[];

export function isGrade(g: string): g is Grade {
  return Object.prototype.hasOwnProperty.call(GRADE_POINTS, g);
}

/** Points (1–12) → letter grade. */
export function pointsToGrade(points: number): Grade {
  const p = Math.min(12, Math.max(1, Math.round(points)));
  return GRADES[12 - p];
}

/** KNEC subject groups: I compulsory, II sciences, III humanities, IV applied/technical, V languages & business. */
export type SubjectGroup = 1 | 2 | 3 | 4 | 5;

export interface Subject {
  id: string;
  code: number; // KNEC subject code
  name: string;
  group: SubjectGroup;
  /** No longer examined — kept so old requirement strings still parse, hidden from the form. */
  legacy?: boolean;
  /** Shown in the main form; others sit under "More subjects". */
  common?: boolean;
}

export const SUBJECTS: Subject[] = [
  { id: "ENG", code: 101, name: "English", group: 1, common: true },
  { id: "KIS", code: 102, name: "Kiswahili", group: 1, common: true },
  { id: "MAT_A", code: 121, name: "Mathematics (Alt A)", group: 1, common: true },
  { id: "MAT_B", code: 122, name: "Mathematics (Alt B)", group: 1 },
  { id: "BIO", code: 231, name: "Biology", group: 2, common: true },
  { id: "PHY", code: 232, name: "Physics", group: 2, common: true },
  { id: "CHE", code: 233, name: "Chemistry", group: 2, common: true },
  { id: "BSC", code: 235, name: "Biological Sciences (235)", group: 2 },
  { id: "PSC", code: 234, name: "Physical Science", group: 2 },
  { id: "GSC", code: 237, name: "General Science", group: 2 },
  { id: "HAG", code: 311, name: "History & Government", group: 3, common: true },
  { id: "GEO", code: 312, name: "Geography", group: 3, common: true },
  { id: "CRE", code: 313, name: "CRE", group: 3, common: true },
  { id: "IRE", code: 314, name: "IRE", group: 3 },
  { id: "HRE", code: 315, name: "HRE", group: 3 },
  { id: "SEE", code: 316, name: "Social Education & Ethics", group: 3, legacy: true },
  { id: "HSC", code: 441, name: "Home Science", group: 4 },
  { id: "ARD", code: 442, name: "Art & Design", group: 4 },
  { id: "AGR", code: 443, name: "Agriculture", group: 4, common: true },
  { id: "WDW", code: 444, name: "Woodwork", group: 4 },
  { id: "MTW", code: 445, name: "Metalwork", group: 4 },
  { id: "BLD", code: 446, name: "Building Construction", group: 4 },
  { id: "PWM", code: 447, name: "Power Mechanics", group: 4 },
  { id: "ELE", code: 448, name: "Electricity", group: 4 },
  { id: "DRD", code: 449, name: "Drawing & Design", group: 4 },
  { id: "AVT", code: 450, name: "Aviation Technology", group: 4 },
  { id: "CMP", code: 451, name: "Computer Studies", group: 4, common: true },
  { id: "FRE", code: 501, name: "French", group: 5 },
  { id: "GER", code: 502, name: "German", group: 5 },
  { id: "ARB", code: 503, name: "Arabic", group: 5 },
  { id: "KSL", code: 504, name: "Kenyan Sign Language", group: 5 },
  { id: "MUS", code: 511, name: "Music", group: 5 },
  { id: "ACC", code: 561, name: "Accounting (561)", group: 5, legacy: true },
  { id: "COM", code: 562, name: "Commerce", group: 5, legacy: true },
  { id: "BST", code: 565, name: "Business Studies", group: 5, common: true },
];

export const SUBJECT_BY_ID: Record<string, Subject> = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]));
export const SUBJECT_BY_CODE: Record<number, Subject> = Object.fromEntries(SUBJECTS.map((s) => [s.code, s]));

export function subjectsInGroup(group: SubjectGroup): string[] {
  return SUBJECTS.filter((s) => s.group === group).map((s) => s.id);
}

/** Student's grades keyed by subject id. */
export type GradeMap = Partial<Record<string, Grade>>;

/** Stable string form, e.g. "BIO:B+,ENG:A-". Used in Paystack metadata so a payment unlocks exactly one grade set. */
export function canonicalGrades(grades: GradeMap): string {
  return Object.entries(grades)
    .filter(([id, g]) => g && SUBJECT_BY_ID[id])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, g]) => `${id}:${g}`)
    .join(",");
}

export function parseCanonicalGrades(s: string): GradeMap | null {
  if (typeof s !== "string" || s.length > 600) return null;
  const out: GradeMap = {};
  for (const part of s.split(",")) {
    const [id, g] = part.split(":");
    if (!id || !g || !SUBJECT_BY_ID[id] || !isGrade(g) || out[id]) return null;
    out[id] = g;
  }
  return out;
}

/** Validates untrusted input (API bodies). Returns null if anything is off. */
export function sanitizeGrades(input: unknown): GradeMap | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: GradeMap = {};
  for (const [id, g] of Object.entries(input as Record<string, unknown>)) {
    if (g === "" || g == null) continue;
    if (!SUBJECT_BY_ID[id] || typeof g !== "string" || !isGrade(g)) return null;
    out[id] = g;
  }
  return out;
}
