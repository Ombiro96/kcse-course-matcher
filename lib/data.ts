import "server-only";
import clustersFile from "@/data/clusters.json";
import programmesFile from "@/data/programmes.json";
import type { Cluster, ClustersFile, Programme, ProgrammesFile } from "./types";

// Programme data stays on the server: the free preview must not ship the full list to the browser.
export const clusters: Cluster[] = (clustersFile as ClustersFile).clusters;
export const programmes: Programme[] = (programmesFile as ProgrammesFile).programmes;
export const dataMeta = {
  cutoffYears: (programmesFile as ProgrammesFile).meta.cutoffYears,
  latestCutoffYear: [...(programmesFile as ProgrammesFile).meta.cutoffYears].sort().at(-1) ?? "",
  programmeCount: programmes.length,
};
