import type { AuctionSession, Player, PlayerDatabase } from "./types";
import { eligibleMantraRoles, computeFlexibilityScore } from "./mantra";
import { getFormation } from "./formations";
import { getStrategy } from "./strategies";
import { computeFormationFit, computeStrategyFit } from "./strategicFit";
import type { PlayerIntelligence, PlayerIntelligenceStore } from "./intelligence/types";
import { stalenessWeight } from "./intelligence/freshness";

export interface LiveScoreBreakdown {
  baseRank: number;
  formationFit: number;
  strategyFit: number;
  rosterNeed: number;
  marketValue: number;
  scarcity: number;
  versatility: number;
  riskAdjustment: number;
  intelligenceBoost: number;
  total: number;
}

/**
 * Player Intelligence section 29: a bounded, upside-only nudge from real
 * bonus-potential signal (rigori/piazzati/goal threat) — never dominates
 * baseRank, and strictly neutral (0) when a player simply has no imported
 * signal at all, rather than silently penalizing the entire roster for
 * lacking manual stats (section 24: absence of data is "unknown", not
 * "bad"). Deliberately proportional to bonusPotential.score directly
 * (0-100 -> 0-12) rather than relative to an assumed "average known
 * player" baseline — bonusPotential's own neutral point isn't a flat 50
 * (it's pulled down by the same NONE-confidence dampening that keeps a
 * no-signal player's score low), so anchoring on 50 would wrongly punish a
 * player who has, say, a known penalty rank but no goal-threat stats yet.
 */
function computeIntelligenceBoost(intel: PlayerIntelligence): number {
  const hasSignal = intel.goalThreat.confidence !== "NONE" || intel.penalty.rank != null || intel.setPieces.setPieceValueScore > 0;
  if (!hasSignal) return 0;
  const stalenessFactor = stalenessWeight(intel.goalThreat.staleness);
  return Math.max(0, Math.min(12, (intel.bonusPotential.score / 100) * 12 * stalenessFactor));
}

/**
 * Section 15: "chi comprare" ranking. Deliberately does NOT take
 * auctionStyle into account — style only affects "quanto pagare"
 * (DynamicMax/decision engine), never who looks like the better target.
 * `intelligence` is optional and defaults to no adjustment, so existing
 * callers keep working unchanged.
 */
export function computeLiveScore(player: Player, session: AuctionSession, db: PlayerDatabase, intelligence?: PlayerIntelligenceStore): LiveScoreBreakdown {
  const formation = getFormation(session.settings.primaryFormation);
  const strategy = getStrategy(session.settings.strategyProfile);
  const c = player.computed;

  const baseRank = c.indiceFanta;
  const formationFit = computeFormationFit(player, formation) * 0.3;
  const strategyFit = computeStrategyFit(player, formation, strategy) * 0.3;

  const roles = eligibleMantraRoles(player.ruoloMantra);
  const openSlotsForRole = session.rosterSlots.filter((s) => s.playerId == null && roles.includes(s.role));
  const rosterNeed = Math.min(20, openSlotsForRole.length * 6);

  const marketStats = session.marketState.perFamiglia[c.famiglia433];
  const marketValue = marketStats ? -(marketStats.adjustedMarketIndex - 1) * 25 : 0; // inflated family -> slight penalty, cheap family -> bonus

  const scarcityInfo = session.marketState.scarcity[c.famiglia433];
  const scarcity = scarcityInfo ? Math.min(15, scarcityInfo.scarcityIndex * 1.5) : 0;

  const versatility = computeFlexibilityScore(player.ruoloMantra) * 0.1;
  const riskAdjustment = (c.fattoreRischio - 1) * 20;

  const intel = intelligence?.players[player.id];
  const intelligenceBoost = intel ? computeIntelligenceBoost(intel) : 0;

  const total = baseRank + formationFit + strategyFit + rosterNeed + marketValue + scarcity + versatility + riskAdjustment + intelligenceBoost;

  return {
    baseRank: Math.round(baseRank), formationFit: Math.round(formationFit), strategyFit: Math.round(strategyFit),
    rosterNeed: Math.round(rosterNeed), marketValue: Math.round(marketValue), scarcity: Math.round(scarcity),
    versatility: Math.round(versatility), riskAdjustment: Math.round(riskAdjustment),
    intelligenceBoost: Math.round(intelligenceBoost), total: Math.round(total),
  };
}
