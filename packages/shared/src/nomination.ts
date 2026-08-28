import type { AuctionSession, Famiglia433, GraduatoriaEntry, Player, RosterSlot } from "./types";
import { getMyManager } from "./budget";

export type NominationCategory = "ATTACK" | "DRAIN" | "INFORMATION" | "HIDE";

export interface NominationSuggestion {
  category: NominationCategory;
  playerId: string;
  nome: string;
  squadra: string;
  reason: string;
  keepHidden: { playerId: string; nome: string }[];
}

function budgetSpentRatio(session: AuctionSession): number {
  const totalInitial = session.managers.reduce((s, m) => s + m.budgetInitial, 0);
  const totalResidual = session.managers.reduce((s, m) => s + m.budgetResidual, 0);
  if (totalInitial === 0) return 0;
  return 1 - totalResidual / totalInitial;
}

function isAvailable(session: AuctionSession, playerId: string): boolean {
  const st = session.playerStates[playerId];
  return !st || st.status === "AVAILABLE";
}

export function suggestNomination(params: {
  players: Player[];
  graduatorie: GraduatoriaEntry[];
  session: AuctionSession;
}): NominationSuggestion {
  const { players, graduatorie, session } = params;
  const myManager = getMyManager(session);
  const spentRatio = budgetSpentRatio(session);

  const available = players.filter((p) => isAvailable(session, p.id));

  const openSlots = [...session.rosterSlots]
    .filter((s) => s.playerId == null)
    .sort((a, b) => a.protectPriority - b.protectPriority);

  const rankByPlayerId = new Map<string, { rank: number; famiglia: Famiglia433 }>();
  for (const g of graduatorie) {
    if (g.playerId && !rankByPlayerId.has(g.playerId)) rankByPlayerId.set(g.playerId, { rank: g.rank, famiglia: g.famiglia });
  }

  // Gems worth keeping hidden until the market has spent real money.
  const gems = available
    .filter((p) => p.computed.gemScore >= 65 && p.computed.prezzoObiettivo <= 15)
    .sort((a, b) => b.computed.gemScore - a.computed.gemScore)
    .slice(0, 6);
  const keepHidden = spentRatio < 0.55 ? gems.slice(0, 3).map((p) => ({ playerId: p.id, nome: p.nome })) : [];
  const hiddenIds = new Set(keepHidden.map((g) => g.playerId));

  // 1) ATTACK: my top open slot, best-ranked non-gem candidate still available.
  for (const slot of openSlots.slice(0, 3)) {
    const candidates = available
      .filter((p) => p.computed.famiglia433 === slot.famiglia && !hiddenIds.has(p.id))
      .sort((a, b) => {
        const ra = rankByPlayerId.get(a.id)?.rank ?? 999;
        const rb = rankByPlayerId.get(b.id)?.rank ?? 999;
        return ra - rb;
      });
    const best = candidates[0];
    if (best && best.computed.offertaMaxBase <= myManager.budgetResidual) {
      return {
        category: "ATTACK",
        playerId: best.id,
        nome: best.nome,
        squadra: best.squadra,
        reason: `È il candidato migliore per ${slot.slotKey} (${slot.profilo}), ancora scoperto. Meglio chiuderlo prima che il reparto ${slot.famiglia} si scaldi.`,
        keepHidden,
      };
    }
  }

  // 2) INFORMATION: very early, no data yet on inflation of the Pc family.
  if (spentRatio < 0.15 && !session.marketState.perFamiglia.Pc) {
    const midPc = available
      .filter((p) => p.computed.famiglia433 === "Pc" && p.computed.tierGruppo !== "Top")
      .sort((a, b) => b.computed.indiceFanta - a.computed.indiceFanta)[0];
    if (midPc) {
      return {
        category: "INFORMATION",
        playerId: midPc.id,
        nome: midPc.nome,
        squadra: midPc.squadra,
        reason: "Asta ancora fredda: chiamalo per misurare l'inflazione sui Pc prima di esporre il tuo vero obiettivo.",
        keepHidden,
      };
    }
  }

  // 3) DRAIN: a popular player outside my current priority needs, to burn rivals' budget.
  const myOpenFamilies = new Set(openSlots.map((s) => s.famiglia));
  const drain = available
    .filter((p) => !myOpenFamilies.has(p.computed.famiglia433) && !hiddenIds.has(p.id))
    .sort((a, b) => b.computed.indiceFanta - a.computed.indiceFanta)[0];
  if (drain) {
    return {
      category: "DRAIN",
      playerId: drain.id,
      nome: drain.nome,
      squadra: drain.squadra,
      reason: "Non è una tua priorità ma è appetibile: fai spendere budget agli avversari senza rischiare nulla.",
      keepHidden,
    };
  }

  // Fallback: whatever is left, highest indiceFanta.
  const fallback = available.sort((a, b) => b.computed.indiceFanta - a.computed.indiceFanta)[0];
  return {
    category: "DRAIN",
    playerId: fallback?.id ?? "",
    nome: fallback?.nome ?? "",
    squadra: fallback?.squadra ?? "",
    reason: "Nessun candidato prioritario chiaro: usa questo nome per continuare a leggere il mercato.",
    keepHidden,
  };
}
