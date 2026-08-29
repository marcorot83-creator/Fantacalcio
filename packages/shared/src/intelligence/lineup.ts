import type { Player } from "../types";
import type { LineupCategory, LineupIntelligence } from "./types";
import { computeStaleness } from "./freshness";

/**
 * Section 5. Thresholds are indicative, not sacred — the app already has a
 * real 0-100 starterProbability (player.computed.titolarita), just not this
 * readable a categorization on top of it.
 */
export function categorizeStarterProbability(starterProbability: number): LineupCategory {
  if (starterProbability >= 90) return "NAILED";
  if (starterProbability >= 80) return "STRONG_STARTER";
  if (starterProbability >= 65) return "FAVORITE";
  if (starterProbability >= 40) return "BALLOT";
  if (starterProbability >= 20) return "BACKUP";
  return "FRINGE";
}

/**
 * Section 5/6: the baseline lineup read straight from data we already
 * import — no duplication. `player.computed.titolarita` already IS a
 * starter-probability estimate; `rischio` already flags a real, curated
 * ballottaggio when the Excel source considered it a genuine 50/50 (not
 * just "possible rotation"), so it can promote a borderline-Favorite read
 * that would otherwise miss the real uncertainty.
 */
export function baseLineupIntelligence(player: Player, datasetImportedAt: string): LineupIntelligence {
  const starterProbability = player.computed.titolarita;
  let category = categorizeStarterProbability(starterProbability);
  const rischioUpper = (player.rischio || "").toUpperCase();
  if (rischioUpper.includes("BALLOTTAGGIO") && category !== "BACKUP" && category !== "FRINGE") {
    category = "BALLOT";
  }
  return {
    starterProbability,
    category,
    battleId: null, // filled in by the store once LineupBattles are derived from Coppie & Gioielli
    directCompetitorId: null,
    staleness: computeStaleness(datasetImportedAt),
  };
}
