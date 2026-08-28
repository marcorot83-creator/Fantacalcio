import type { AlternativeSuggestion, AuctionSession, Famiglia433, GraduatoriaEntry, Player } from "./types";
import { findPlayer } from "./roster";

/** Section 50: AlternativeScore, with the curated graduatoria rank as the dominant signal. */
export function computeAlternativeScore(params: {
  player: Player;
  graduatoriaRank: number | null; // lower is better; null if not ranked
  scarcityIndex: number;
  budgetResiduo: number;
}): number {
  const { player, graduatoriaRank, scarcityIndex, budgetResiduo } = params;
  const c = player.computed;
  const rankScore = graduatoriaRank != null ? Math.max(0, 40 - graduatoriaRank) : 10;
  const qualityScore = c.indiceFanta * 0.3;
  const convenienzaScore = c.indiceAffare * 0.2;
  const titolaritaScore = c.titolarita * 0.15;
  const priceScore = c.prezzoObiettivo <= budgetResiduo ? Math.max(0, 15 - c.prezzoObiettivo / 10) : -20;
  const riskScore = c.fattoreRischio * 10;
  const scarcityScore = Math.min(10, scarcityIndex);
  const flexScore = Math.min(8, (player.versatilita - 1) * 4);
  return rankScore + qualityScore + convenienzaScore + titolaritaScore + priceScore + riskScore + scarcityScore + flexScore;
}

export function findAlternatives(params: {
  players: Player[];
  graduatorie: GraduatoriaEntry[];
  session: AuctionSession;
  famiglia: Famiglia433;
  excludePlayerId?: string;
  budgetResiduo: number;
  scarcityIndex: number;
  limit?: number;
}): AlternativeSuggestion[] {
  const { players, graduatorie, session, famiglia, excludePlayerId, budgetResiduo, scarcityIndex, limit = 5 } = params;

  const rankByPlayerId = new Map<string, number>();
  for (const g of graduatorie) {
    if (g.famiglia === famiglia && g.playerId && !rankByPlayerId.has(g.playerId)) {
      rankByPlayerId.set(g.playerId, g.rank);
    }
  }

  const candidates = players.filter((p) => {
    if (p.id === excludePlayerId) return false;
    if (p.computed.famiglia433 !== famiglia) return false;
    const st = session.playerStates[p.id];
    return !st || st.status === "AVAILABLE" || st.status === "NOMINATED";
  });

  const scored = candidates.map((player) => {
    const score = computeAlternativeScore({
      player,
      graduatoriaRank: rankByPlayerId.get(player.id) ?? null,
      scarcityIndex,
      budgetResiduo,
    });
    const suggestion: AlternativeSuggestion = {
      playerId: player.id,
      nome: player.nome,
      squadra: player.squadra,
      score: Math.round(score * 10) / 10,
      prezzoObiettivo: player.computed.prezzoObiettivo,
      offertaMax: player.computed.offertaMaxBase,
      rischio: player.rischio,
      note: player.computed.strategia433,
    };
    return suggestion;
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
