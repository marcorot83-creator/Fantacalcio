import type { AuctionSession, Player, WhatIfResult } from "./types";
import { eligibleMantraRoles } from "./mantra";
import { findOpenSlotForRoles } from "./decision";
import { reallocateBudget, getMyManager } from "./budget";

export function simulateWhatIf(params: {
  player: Player;
  hypotheticalPrice: number;
  session: AuctionSession;
}): WhatIfResult {
  const { player, hypotheticalPrice, session } = params;
  const myManager = getMyManager(session);
  const famiglia = player.computed.famiglia433;
  const slot = findOpenSlotForRoles(session.rosterSlots, eligibleMantraRoles(player.ruoloMantra));

  const newBudgetResiduo = myManager.budgetResidual - hypotheticalPrice;
  const otherOpenSlots = session.rosterSlots.filter((s) => s.playerId == null && s.slotKey !== slot?.slotKey).length;
  const feasibleOnPaper = newBudgetResiduo >= otherOpenSlots; // 1 credit floor per remaining slot

  const requiredCuts: WhatIfResult["requiredCuts"] = [];
  const risks: string[] = [];

  if (slot) {
    const { slots: after } = reallocateBudget(session.rosterSlots, slot.slotKey, player.id, hypotheticalPrice);
    for (const s of after) {
      const before = session.rosterSlots.find((b) => b.slotKey === s.slotKey);
      if (before && before.targetBudgetDynamic !== s.targetBudgetDynamic) {
        requiredCuts.push({ slotKey: s.slotKey, from: before.targetBudgetDynamic, to: s.targetBudgetDynamic });
      }
    }
  } else {
    risks.push(`Lo slot ${famiglia} risulta già coperto: valuta se questo acquisto ha davvero senso strategico.`);
  }

  if (!feasibleOnPaper) {
    risks.push("Il budget residuo non basterebbe a coprire almeno 1 credito per ciascuno degli slot ancora aperti.");
  }
  if (requiredCuts.filter((c) => c.to <= 3).length >= 3) {
    risks.push("Il piano diventerebbe dipendente da almeno tre slot low cost per restare in equilibrio.");
  }
  if (hypotheticalPrice > player.computed.offertaMaxBase * 1.15) {
    risks.push(`${hypotheticalPrice} è molto oltre il walk-away cap del file (${player.computed.offertaMaxBase}): sarebbe un override strategico, non una decisione ordinaria.`);
  }

  const summary =
    `${player.nome} a ${hypotheticalPrice} è ${feasibleOnPaper ? "tecnicamente sostenibile" : "NON sostenibile"}` +
    (requiredCuts.length ? `, richiede: ${requiredCuts.map((c) => `${c.slotKey} ${c.from}→${c.to}`).join(", ")}.` : ".");

  return {
    playerId: player.id,
    hypotheticalPrice,
    feasible: feasibleOnPaper,
    newBudgetResiduo,
    requiredCuts,
    risks,
    summary,
  };
}
