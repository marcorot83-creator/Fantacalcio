import type { AuctionSession, Player, PlayerDatabase } from "./types";
import { eligibleMantraRoles, computeFlexibilityScore } from "./mantra";
import { getFormation } from "./formations";
import { getStrategy } from "./strategies";
import { computeFormationFit, computeStrategyFit } from "./strategicFit";

export interface LiveScoreBreakdown {
  baseRank: number;
  formationFit: number;
  strategyFit: number;
  rosterNeed: number;
  marketValue: number;
  scarcity: number;
  versatility: number;
  riskAdjustment: number;
  total: number;
}

/**
 * Section 15: "chi comprare" ranking. Deliberately does NOT take
 * auctionStyle into account — style only affects "quanto pagare"
 * (DynamicMax/decision engine), never who looks like the better target.
 */
export function computeLiveScore(player: Player, session: AuctionSession, db: PlayerDatabase): LiveScoreBreakdown {
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

  const total = baseRank + formationFit + strategyFit + rosterNeed + marketValue + scarcity + versatility + riskAdjustment;

  return {
    baseRank: Math.round(baseRank), formationFit: Math.round(formationFit), strategyFit: Math.round(strategyFit),
    rosterNeed: Math.round(rosterNeed), marketValue: Math.round(marketValue), scarcity: Math.round(scarcity),
    versatility: Math.round(versatility), riskAdjustment: Math.round(riskAdjustment), total: Math.round(total),
  };
}
