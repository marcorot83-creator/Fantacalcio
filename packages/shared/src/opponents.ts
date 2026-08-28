import type { AuctionSession, Famiglia433, ManagerState, OpponentStyleGuess, Player } from "./types";
import { findPlayer } from "./roster";
import { maxBidCapacity } from "./budget";

export interface OpponentReport {
  managerId: string;
  name: string;
  budgetInitial: number;
  budgetResidual: number;
  slotsFilled: number;
  slotsTotal: number;
  maxBidCapacity: number;
  spesaPerFamiglia: Partial<Record<Famiglia433, number>>;
  prezzoMedio: number;
  acquistiPremium: string[];
  style: OpponentStyleGuess[];
  /** Full roster built so far, for the "cosa si stanno facendo gli avversari" view. */
  players: {
    playerId: string;
    nome: string;
    squadra: string;
    ruoloMantra: string;
    famiglia: Famiglia433;
    paidPrice: number;
    acquiredAt: string;
  }[];
}

/** Section 41: probabilistic behavioural inference — never presented as certainty. */
export function inferOpponentStyle(manager: ManagerState, players: Player[]): OpponentStyleGuess[] {
  const guesses: OpponentStyleGuess[] = [];
  if (manager.players.length === 0) return guesses;

  const paidList = manager.players.map((mp) => mp.paidPrice);
  const avgPaid = paidList.reduce((a, b) => a + b, 0) / paidList.length;
  const topBuys = manager.players.filter((mp) => mp.paidPrice >= 40);
  const ratios = manager.players
    .map((mp) => {
      const pl = findPlayer(players, mp.playerId);
      return pl ? mp.paidPrice / Math.max(1, pl.computed.prezzoAtteso) : null;
    })
    .filter((r): r is number => r != null);
  const avgRatio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;

  if (avgRatio > 1.15) guesses.push({ label: "aggressivo", confidence: Math.min(0.9, (avgRatio - 1) * 2) });
  if (avgRatio < 0.9) guesses.push({ label: "prudente / value hunter", confidence: Math.min(0.9, (1 - avgRatio) * 2) });
  if (topBuys.length >= 2) guesses.push({ label: "amante dei top", confidence: Math.min(0.85, topBuys.length * 0.2) });
  if (avgPaid < 8 && manager.players.length >= 4) guesses.push({ label: "value hunter", confidence: 0.6 });

  const pcSpend = manager.players
    .filter((mp) => findPlayer(players, mp.playerId)?.computed.famiglia433 === "Pc")
    .reduce((s, mp) => s + mp.paidPrice, 0);
  if (pcSpend > 100) guesses.push({ label: "inflazionatore dei Pc", confidence: 0.7 });

  return guesses;
}

export function buildOpponentReport(manager: ManagerState, players: Player[]): OpponentReport {
  const spesaPerFamiglia: Partial<Record<Famiglia433, number>> = {};
  for (const mp of manager.players) {
    const pl = findPlayer(players, mp.playerId);
    if (!pl) continue;
    const fam = pl.computed.famiglia433;
    spesaPerFamiglia[fam] = (spesaPerFamiglia[fam] ?? 0) + mp.paidPrice;
  }
  const prezzoMedio = manager.players.length
    ? Math.round((manager.players.reduce((s, mp) => s + mp.paidPrice, 0) / manager.players.length) * 10) / 10
    : 0;
  const acquistiPremium = manager.players
    .filter((mp) => mp.paidPrice >= 30)
    .map((mp) => findPlayer(players, mp.playerId)?.nome ?? mp.playerId);

  const roster = manager.players
    .map((mp) => {
      const pl = findPlayer(players, mp.playerId);
      if (!pl) return null;
      return {
        playerId: mp.playerId,
        nome: pl.nome,
        squadra: pl.squadra,
        ruoloMantra: pl.ruoloMantra,
        famiglia: pl.computed.famiglia433,
        paidPrice: mp.paidPrice,
        acquiredAt: mp.acquiredAt,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null)
    .sort((a, b) => b.paidPrice - a.paidPrice);

  return {
    managerId: manager.id,
    name: manager.name,
    budgetInitial: manager.budgetInitial,
    budgetResidual: manager.budgetResidual,
    slotsFilled: manager.slotsFilled,
    slotsTotal: manager.slotsTotal,
    maxBidCapacity: maxBidCapacity(manager),
    spesaPerFamiglia,
    prezzoMedio,
    acquistiPremium,
    style: inferOpponentStyle(manager, players),
    players: roster,
  };
}

export function buildAllOpponentReports(session: AuctionSession, players: Player[]): OpponentReport[] {
  return session.managers.filter((m) => !m.isMe).map((m) => buildOpponentReport(m, players));
}

/** How many rivals could still realistically outbid a given price. */
export function countRivalsAbove(session: AuctionSession, price: number): number {
  return session.managers.filter((m) => !m.isMe && maxBidCapacity(m) >= price).length;
}
