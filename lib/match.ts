import { aggregate, clusterWeights, type Aggregate, type ClusterResult } from "./kcse";
import { GRADE_POINTS, type GradeMap } from "./subjects";
import type { Cluster, Programme } from "./types";

export type Tier = "safe" | "close" | "reach";

/** weight − cutoff. Safe ≥ +2; Close within ±2; Reach between −2 and −4. Below −4 is not shown. */
export const TIERS = { safe: 2, close: -2, reach: -4 } as const;

export function tierFor(diff: number): Tier | null {
  if (diff >= TIERS.safe) return "safe";
  if (diff >= TIERS.close) return "close";
  if (diff >= TIERS.reach) return "reach";
  return null;
}

export interface Match {
  code: string;
  name: string;
  institution: string;
  cluster: number;
  weight: number;
  cutoff: number;
  cutoffYear: string;
  diff: number;
  tier: Tier;
  cost: number | null;
}

export function latestCutoff(p: Programme): { value: number; year: string } | null {
  const years = Object.keys(p.cutoffs).sort().reverse();
  for (const y of years) {
    const v = p.cutoffs[y];
    if (v !== null && v !== undefined) return { value: v, year: y };
  }
  return null;
}

export function meetsRequirements(p: Programme, grades: GradeMap, agg: Aggregate): boolean {
  if (GRADE_POINTS[agg.meanGrade] < GRADE_POINTS[p.minMeanGrade]) return false;
  return p.requirements.every((req) =>
    req.subjects.some((id) => {
      const g = grades[id];
      return g !== undefined && GRADE_POINTS[g] >= GRADE_POINTS[req.grade];
    }),
  );
}

const TIER_ORDER: Record<Tier, number> = { safe: 0, close: 1, reach: 2 };

export interface MatchResult {
  aggregate: Aggregate;
  clusters: ClusterResult[];
  matches: Match[];
  counts: Record<Tier, number>;
  /** Mean grade is below the degree minimum (C+). */
  belowDegreeMinimum: boolean;
}

export function runMatch(grades: GradeMap, clusters: Cluster[], programmes: Programme[]): MatchResult | null {
  const agg = aggregate(grades);
  if (!agg) return null;
  const weights = clusterWeights(clusters, grades, agg.total);
  const weightById = new Map(weights.map((w) => [w.id, w.weight]));
  const matches: Match[] = [];
  for (const p of programmes) {
    if (p.cluster === null) continue;
    const weight = weightById.get(p.cluster) ?? 0;
    if (weight <= 0) continue;
    const cut = latestCutoff(p);
    if (!cut) continue;
    if (!meetsRequirements(p, grades, agg)) continue;
    const diff = Math.round((weight - cut.value) * 1000) / 1000;
    const tier = tierFor(diff);
    if (!tier) continue;
    matches.push({
      code: p.code,
      name: p.name,
      institution: p.institution,
      cluster: p.cluster,
      weight,
      cutoff: cut.value,
      cutoffYear: cut.year,
      diff,
      tier,
      cost: p.cost,
    });
  }
  // Best fit first: safest tier, then the most competitive programme you still clear.
  matches.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.cutoff - a.cutoff || a.name.localeCompare(b.name));
  const counts = { safe: 0, close: 0, reach: 0 };
  for (const m of matches) counts[m.tier]++;
  return {
    aggregate: agg,
    clusters: weights,
    matches,
    counts,
    belowDegreeMinimum: GRADE_POINTS[agg.meanGrade] < GRADE_POINTS["C+"],
  };
}
