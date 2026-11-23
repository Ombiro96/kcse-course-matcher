import "server-only";
import { dataMeta, clusters, programmes } from "./data";
import { runMatch } from "./match";
import { FREE_PREVIEW } from "./site";
import type { GradeMap } from "./subjects";
import type { MatchResponse } from "./api";

export function buildResponse(grades: GradeMap, unlocked: boolean): MatchResponse | null {
  const res = runMatch(grades, clusters, programmes);
  if (!res) return null;
  return {
    meanGrade: res.aggregate.meanGrade,
    total: res.aggregate.total,
    clusters: res.clusters.map(({ id, name, weight }) => ({ id, name, weight })),
    counts: res.counts,
    totalMatches: res.matches.length,
    belowDegreeMinimum: res.belowDegreeMinimum,
    cutoffYear: dataMeta.latestCutoffYear,
    cutoffYears: [...new Set(res.matches.map((m) => m.cutoffYear))].sort().reverse(),
    matches: unlocked ? res.matches : res.matches.slice(0, FREE_PREVIEW),
    unlocked,
  };
}
