import { GRADE_POINTS, pointsToGrade, type Grade, type GradeMap } from "./subjects";
import type { Cluster } from "./types";

const pts = (g: Grade | undefined) => (g ? GRADE_POINTS[g] : 0);

export interface Aggregate {
  /** Sum of the 7 subjects KNEC counts (max 84). */
  total: number;
  meanGrade: Grade;
  /** Subjects counted, in the order they were picked. */
  counted: string[];
}

/**
 * KCSE aggregate under the KNEC rules used since the 2023 exam: Mathematics + the better of English/Kiswahili
 * (or KSL) + the best five remaining subjects. Mean grade = aggregate ÷ 7, rounded (A = 81–84 … E = 7–10).
 * Returns null if fewer than 7 subjects are graded.
 */
export function aggregate(grades: GradeMap): Aggregate | null {
  const taken = Object.entries(grades).filter(([, g]) => g) as [string, Grade][];
  if (taken.length < 7) return null;
  const counted: string[] = [];
  const pick = (ids: string[]) => {
    const best = taken.filter(([id]) => ids.includes(id) && !counted.includes(id)).sort((a, b) => pts(b[1]) - pts(a[1]))[0];
    if (best) counted.push(best[0]);
  };
  pick(["MAT_A", "MAT_B"]);
  pick(["ENG", "KIS", "KSL"]);
  const rest = taken.filter(([id]) => !counted.includes(id)).sort((a, b) => pts(b[1]) - pts(a[1]));
  for (const [id] of rest) {
    if (counted.length >= 7) break;
    counted.push(id);
  }
  const total = counted.reduce((sum, id) => sum + pts(grades[id]), 0);
  return { total, meanGrade: pointsToGrade(total / 7), counted };
}

/**
 * Raw cluster points r: best total from filling the cluster's 4 slots with 4 *different* subjects.
 * Returns null when a slot can't be filled (KUCCPS shows 0.000 for that cluster).
 */
export function rawClusterPoints(cluster: Cluster, grades: GradeMap): { r: number; used: string[] } | null {
  // Only the top 4 candidates per slot can matter (at most 3 are taken by other slots).
  const options = cluster.slots.map((slot) =>
    slot.subjects
      .filter((id) => grades[id])
      .sort((a, b) => pts(grades[b]) - pts(grades[a]))
      .slice(0, 4),
  );
  if (options.some((o) => o.length === 0)) return null;
  let best: { r: number; used: string[] } | null = null;
  const walk = (i: number, used: string[], sum: number) => {
    if (i === options.length) {
      if (!best || sum > best.r) best = { r: sum, used: [...used] };
      return;
    }
    for (const id of options[i]) {
      if (used.includes(id)) continue;
      used.push(id);
      walk(i + 1, used, sum + pts(grades[id]));
      used.pop();
    }
  };
  walk(0, [], 0);
  return best;
}

/** KUCCPS weighted cluster points: C = √((r/48) × (t/84)) × 48, to 3 decimal places. */
export function weightedClusterPoints(r: number, t: number): number {
  return Math.round(Math.sqrt((r / 48) * (t / 84)) * 48 * 1000) / 1000;
}

export interface ClusterResult {
  id: number;
  name: string;
  r: number;
  weight: number; // 0 when a required subject is missing
  used: string[];
}

export function clusterWeights(clusters: Cluster[], grades: GradeMap, t: number): ClusterResult[] {
  return clusters.map((c) => {
    const raw = rawClusterPoints(c, grades);
    return {
      id: c.id,
      name: c.name,
      r: raw?.r ?? 0,
      weight: raw ? weightedClusterPoints(raw.r, t) : 0,
      used: raw?.used ?? [],
    };
  });
}
