import type {
  AuctionSession, Famiglia433, MarketFamilyStats, MarketState, Player, ScarcityInfo,
} from "./types";
import { findPlayer } from "./roster";

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Section 32: learn from prices actually observed in the current auction. */
export function computeMarketState(players: Player[], session: AuctionSession): MarketState {
  const perFamiglia: MarketState["perFamiglia"] = {};
  const soldByFamily = new Map<Famiglia433, number[]>();

  for (const ps of Object.values(session.playerStates)) {
    if ((ps.status === "WON_BY_ME" || ps.status === "WON_BY_OPPONENT") && ps.paidPrice != null) {
      const player = findPlayer(players, ps.playerId);
      if (!player) continue;
      const fam = player.computed.famiglia433;
      const ratio = ps.paidPrice / Math.max(1, player.computed.prezzoAtteso);
      if (!soldByFamily.has(fam)) soldByFamily.set(fam, []);
      soldByFamily.get(fam)!.push(ratio);
    }
  }

  for (const [fam, ratios] of soldByFamily.entries()) {
    const medianRatio = median(ratios);
    const confidence = Math.min(1, ratios.length / 5);
    const adjusted = 1 + confidence * (medianRatio - 1);
    const stats: MarketFamilyStats = {
      famiglia: fam,
      observations: ratios.length,
      medianMarketRatio: Math.round(medianRatio * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      adjustedMarketIndex: Math.round(adjusted * 1000) / 1000,
    };
    perFamiglia[fam] = stats;
  }

  const scarcity: MarketState["scarcity"] = {};
  const families: Famiglia433[] = ["Por", "Dd", "Ds", "Dc", "Jolly", "A", "C", "M", "Pc"];
  const nManagers = session.managers.length || 12;
  const slotsPerFamilyPerManager: Record<Famiglia433, number> = {
    Por: 3, Dd: 3, Ds: 3, Dc: 5, Jolly: 2, A: 4, C: 3, M: 3, Pc: 2, Non433: 0,
  };

  for (const fam of families) {
    const available = players.filter((p) => {
      const st = session.playerStates[p.id];
      return p.computed.famiglia433 === fam && (!st || st.status === "AVAILABLE" || st.status === "NOMINATED");
    });
    const topN = [...available].sort((a, b) => b.computed.indiceFanta - a.computed.indiceFanta).slice(0, 20);
    const qualitaResidua = topN.reduce((s, p) => s + p.computed.indiceFanta, 0) / Math.max(1, topN.length);

    const totalSlots = slotsPerFamilyPerManager[fam] * nManagers;
    const filledSlots = Object.values(session.playerStates).filter((ps) => {
      if (ps.status !== "WON_BY_ME" && ps.status !== "WON_BY_OPPONENT") return false;
      const pl = findPlayer(players, ps.playerId);
      return pl?.computed.famiglia433 === fam;
    }).length;
    const slotResiduiStimati = Math.max(1, totalSlots - filledSlots);

    const scarcityIndex = qualitaResidua / slotResiduiStimati;
    let level: ScarcityInfo["level"] = "bassa";
    if (scarcityIndex > 8) level = "critica";
    else if (scarcityIndex > 4) level = "alta";
    else if (scarcityIndex > 1.5) level = "media";

    scarcity[fam] = { famiglia: fam, qualitaResidua: Math.round(qualitaResidua * 10) / 10, slotResiduiStimati, scarcityIndex: Math.round(scarcityIndex * 100) / 100, level };
  }

  return { perFamiglia, scarcity };
}
