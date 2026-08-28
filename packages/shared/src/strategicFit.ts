import type { Player } from "./types";
import { eligibleMantraRoles, computeFlexibilityScore } from "./mantra";
import { type FormationDefinition, computeRoleScarcity } from "./formations";
import { type AuctionStrategyProfile } from "./strategies";
import { computeRoleImportance } from "./rosterStructure";

/** 0-100: how well this player's roles fit the chosen formation's structural needs (section 14). */
export function computeFormationFit(player: Player, formation: FormationDefinition): number {
  const roles = eligibleMantraRoles(player.ruoloMantra);
  const scarcity = computeRoleScarcity(formation);
  const needed = new Set(formation.startingEleven.map((s) => s.role));
  let best = 0;
  for (const r of roles) {
    if (!needed.has(r)) continue;
    best = Math.max(best, (scarcity[r] ?? 0.3) * 100);
  }
  if (best === 0) return 15; // plays no role this formation actually fields
  // Reward covering MULTIPLE needed roles (tactical redundancy) with a bonus, capped.
  const coveredCount = roles.filter((r) => needed.has(r)).length;
  return Math.round(Math.min(100, best + (coveredCount - 1) * 8));
}

/** 0-100: how well this player's roles/attributes fit the chosen strategy (section 14). */
export function computeStrategyFit(player: Player, formation: FormationDefinition, strategy: AuctionStrategyProfile): number {
  const roles = eligibleMantraRoles(player.ruoloMantra);
  const importance = computeRoleImportance(formation, strategy);
  const roleScore = roles.length
    ? Math.max(...roles.map((r) => (importance[r] ?? 0.3) * 60))
    : 15;

  const c = player.computed;
  const attr = strategy.attributeWeights;
  const attributeScore =
    attr.fantaScore * c.indiceFanta +
    attr.valueScore * c.indiceAffare +
    attr.starterProbability * c.titolarita +
    attr.upside * c.gemScore +
    attr.reliability * (player.affidabilita === "Alta" ? 90 : player.affidabilita === "Medio-alta" ? 70 : player.affidabilita === "Media" ? 50 : 30) +
    attr.versatility * computeFlexibilityScore(player.ruoloMantra) +
    attr.lowRisk * (c.fattoreRischio * 100);
  const attrWeightSum = attr.fantaScore + attr.valueScore + attr.starterProbability + attr.upside + attr.reliability + attr.versatility + attr.lowRisk;
  const normalizedAttrScore = attrWeightSum > 0 ? attributeScore / attrWeightSum : 50;

  return Math.round(Math.min(100, Math.max(0, roleScore * 0.55 + normalizedAttrScore * 0.45)));
}

/**
 * Section 14: "Quanto questo giocatore è coerente con la combinazione
 * modulo + strategia scelta?" — the anchor metric everything else (live
 * ranking, alternatives, nomination) is built on.
 */
export function computeStrategicFitScore(player: Player, formation: FormationDefinition, strategy: AuctionStrategyProfile): number {
  const formationFit = computeFormationFit(player, formation);
  const strategyFit = computeStrategyFit(player, formation, strategy);
  return Math.round(formationFit * 0.45 + strategyFit * 0.55);
}
