import type { SetPieceRole, GoalThreatStatSeason, PenaltyRank } from "./types";

/**
 * Section 4: an architecture built around providers, not scraping. Only
 * `ManualImportProvider` is actually wired right now (JSON upload) — the
 * seed dataset itself carries no rigoristi/piazzati/xG data to automate
 * against, and this environment has no legal/technical access to
 * SOSFanta/Fantacalcio.it/FotMob/FBref APIs. `FantacalcioProvider`,
 * `SOSFantaProvider` and `StatsProvider` are named here as the intended
 * shape for when real API access exists — never implemented as scraping.
 */
export interface PlayerIntelligenceProvider {
  readonly kind: "manual_import" | "fantacalcio" | "sosfanta" | "stats_provider";
  fetchLineupData?(): Promise<ManualLineupImportRow[]>;
  fetchSetPieceData?(): Promise<ManualLineupImportRow[]>;
  fetchPerformanceData?(): Promise<ManualStatsImportRow[]>;
}

/** One row of a manual lineup/hierarchy/set-piece import (JSON). */
export interface ManualLineupImportRow {
  nome: string;
  squadra?: string;
  starterProbability?: number;
  penaltyRank?: PenaltyRank;
  cornerRole?: SetPieceRole;
  directFreeKickRole?: SetPieceRole;
  indirectFreeKickRole?: SetPieceRole;
  editorialGoalThreatNote?: string;
  editorialGoalThreatWeight?: number; // 0-1, defaults to 0.5
}

/** One row of a manual performance-stats import (JSON), one per player+season. */
export interface ManualStatsImportRow extends GoalThreatStatSeason {
  nome: string;
  squadra?: string;
}

export interface ManualImportPayload {
  label?: string;
  importedAt?: string; // defaults to now
  lineup?: ManualLineupImportRow[];
  stats?: ManualStatsImportRow[];
}
