import type { PlayerDatabase } from "../types";
import type { PenaltyIntelligence, PenaltyRank } from "./types";
import { computeStaleness } from "./freshness";

/**
 * Real proxy for "how good is this team's attack" computed from data we
 * already have (average Indice Fanta across the team's own A/Pc players),
 * rather than a fabricated stat — used to scale penalty/set-piece value
 * without pretending we have real team xG data.
 */
export function estimateTeamAttackFactor(db: PlayerDatabase, squadra: string): number {
  const attackers = db.players.filter((p) => p.squadra === squadra && (p.computed.famiglia433 === "A" || p.computed.famiglia433 === "Pc"));
  if (attackers.length === 0) return 1;
  const avg = attackers.reduce((s, p) => s + p.computed.indiceFanta, 0) / attackers.length;
  return Math.max(0.7, Math.min(1.3, 0.7 + avg / 100));
}

/**
 * Section 13/14: PenaltyValueScore = HierarchyWeight × StarterProbability ×
 * TeamAttackFactor — a Penalty #1 who barely plays gets nowhere near the
 * same value as a Penalty #1 who nearly always starts.
 */
export function computePenaltyValueScore(rank: PenaltyRank, starterProbability: number, teamAttackFactor: number): number {
  if (!rank) return 0;
  const hierarchyWeight = rank === 1 ? 1 : rank === 2 ? 0.35 : 0.12;
  return Math.round(Math.min(100, hierarchyWeight * (starterProbability / 100) * teamAttackFactor * 100));
}

export function buildPenaltyIntelligence(params: {
  rank: PenaltyRank;
  confidence: number;
  starterProbability: number;
  teamAttackFactor: number;
  updatedAt: string | null;
}): PenaltyIntelligence {
  return {
    rank: params.rank,
    confidence: params.confidence,
    penaltyValueScore: computePenaltyValueScore(params.rank, params.starterProbability, params.teamAttackFactor),
    staleness: computeStaleness(params.updatedAt),
  };
}
