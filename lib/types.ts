import type { Grade } from "./subjects";

export interface ClusterSlot {
  /** Text as printed in the KUCCPS cluster document, e.g. "MAT ALTERNATIVE A/B or any GROUP II". */
  text: string;
  /** Subject ids that may fill this slot. One subject can fill at most one slot. */
  subjects: string[];
}

export interface SubCluster {
  id: string; // e.g. "2A"
  requirementsText: string[];
  programmeNames: string[];
}

export interface Cluster {
  id: number; // 1–20
  name: string;
  slots: ClusterSlot[]; // always 4
  subclusters: SubCluster[];
}

export interface ClustersFile {
  meta: { generatedAt: string; source: string };
  clusters: Cluster[];
}

export interface SubjectRequirement {
  /** Any one of these subjects at `grade` or better. */
  subjects: string[];
  grade: Grade;
  text: string;
}

export interface Programme {
  code: string; // 7-character KUCCPS programme code
  name: string;
  institution: string;
  cluster: number | null;
  subcluster: string | null;
  /** How the cluster was assigned: "code" (listed in a sub-cluster table), "suffix" (same programme suffix elsewhere), "name" (cluster document), "override". */
  clusterSource: "code" | "suffix" | "name" | "override" | null;
  /** Cutoffs keyed by the year in the KUCCPS column header ("CUTOFF - 2023"). null = no cutoff published ("-"). */
  cutoffs: Record<string, number | null>;
  requirements: SubjectRequirement[];
  minMeanGrade: Grade;
  cost: number | null; // annual programme cost, KES
}

export interface ProgrammesFile {
  meta: { generatedAt: string; sources: string[]; cutoffYears: string[] };
  programmes: Programme[];
}
