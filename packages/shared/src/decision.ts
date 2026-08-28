import type {
  AuctionSession, BidRecommendation, Famiglia433, GraduatoriaEntry, MarketState, Player, RosterSlot,
} from "./types";
import { computeDynamicMax, getMyManager, netSurplus, slotsStillToBuy } from "./budget";
import { findAlternatives } from "./alternatives";

export function findOpenSlotForFamily(rosterSlots: RosterSlot[], famiglia: Famiglia433): RosterSlot | undefined {
  const open = rosterSlots.filter((s) => s.famiglia === famiglia && s.playerId == null);
  if (open.length === 0) return undefined;
  // Prefer the highest-value (most protected) still-open slot: that's the one
  // this nomination is most likely meant to fill.
  return [...open].sort((a, b) => a.protectPriority - b.protectPriority)[0];
}

export function computeBidRecommendation(params: {
  player: Player;
  currentBid: number;
  players: Player[];
  graduatorie: GraduatoriaEntry[];
  session: AuctionSession;
  marketState: MarketState;
}): BidRecommendation {
  const { player, currentBid, players, graduatorie, session, marketState } = params;
  const famiglia = player.computed.famiglia433;
  const myManager = getMyManager(session);
  const slot = findOpenSlotForFamily(session.rosterSlots, famiglia);
  const scarcity = marketState.scarcity[famiglia] ?? null;

  const { dynamicMax, limiteAssolutoDiBudget, limiteStrategicoDiRosa } = computeDynamicMax({
    offertaMaxBase: player.computed.offertaMaxBase,
    manager: myManager,
    slotsStillToBuy: slotsStillToBuy(myManager, session.rosterSlots) - (slot ? 1 : 0),
    slot,
    netSurplus: netSurplus(session),
  });

  const prezzoObiettivo = player.computed.prezzoObiettivo;
  const alternatives = findAlternatives({
    players,
    graduatorie,
    session,
    famiglia,
    excludePlayerId: player.id,
    budgetResiduo: myManager.budgetResidual,
    scarcityIndex: scarcity?.scarcityIndex ?? 0,
  });

  const reasons: string[] = [];
  let action: BidRecommendation["action"];
  let headline: string;

  const slotAlreadyCovered = !slot;

  if (currentBid > dynamicMax) {
    action = "MOLLA";
    headline = `MOLLA A ${currentBid}.`;
    reasons.push(`Prezzo ${currentBid} sopra la red line dinamica (${dynamicMax}).`);
    if (limiteAssolutoDiBudget < player.computed.offertaMaxBase) {
      reasons.push(`Il budget residuo (${myManager.budgetResidual}) non regge oltre ${limiteAssolutoDiBudget} tenendo 1 credito per ogni slot ancora da coprire.`);
    }
    if (alternatives.length > 0) {
      reasons.push(`Restano ${alternatives.length} alternative valide: ${alternatives.slice(0, 3).map((a) => a.nome).join(", ")}.`);
    }
    reasons.push("Il prezzo già raggiunto è sunk cost: non inseguire il nome.");
  } else if (slotAlreadyCovered && currentBid > prezzoObiettivo) {
    action = "MOLLA";
    headline = `MOLLA A ${currentBid}.`;
    reasons.push(`Lo slot ${famiglia} è già coperto in rosa: non serve pagare sopra target.`);
  } else if (currentBid <= prezzoObiettivo * 0.97) {
    action = "ATTACCA";
    headline = `ATTACCA. RILANCIA FINO A ${dynamicMax}.`;
    reasons.push(`Prezzo attuale ${currentBid} è sotto il target (${prezzoObiettivo}).`);
    if (slot) reasons.push(`Copre lo slot ${slot.slotKey} (${slot.profilo}), ancora scoperto.`);
    if (scarcity) reasons.push(`Scarsità ${famiglia}: ${scarcity.level} (indice ${scarcity.scarcityIndex}).`);
  } else if (currentBid <= prezzoObiettivo * 1.06) {
    action = "COMPRA";
    headline = `COMPRA A ${currentBid} SE SERVE.`;
    reasons.push(`Prezzo ${currentBid} è in linea con il target (${prezzoObiettivo}).`);
    if (slot) reasons.push(`Slot ${slot.slotKey} ancora aperto: acquisto coerente col piano.`);
  } else {
    action = "RILANCIA";
    headline = `RILANCIA FINO A ${dynamicMax}.`;
    reasons.push(`Prezzo ${currentBid} è sopra il target (${prezzoObiettivo}) ma sotto la red line dinamica (${dynamicMax}).`);
    if (scarcity && (scarcity.level === "alta" || scarcity.level === "critica")) {
      reasons.push(`Scarsità ${famiglia} ${scarcity.level}: poche alternative di pari livello ancora libere.`);
    } else if (alternatives.length >= 3) {
      reasons.push(`Ci sono comunque ${alternatives.length} alternative se molli: valuta se vale davvero la pena spingere.`);
    }
    if (dynamicMax < player.computed.offertaMaxBase) {
      reasons.push(`Red line ridotta rispetto al cap base (${player.computed.offertaMaxBase}) per proteggere gli altri slot ancora aperti.`);
    }
  }

  return {
    action,
    headline,
    player: { id: player.id, nome: player.nome, squadra: player.squadra, ruoloMantra: player.ruoloMantra },
    currentBid,
    prezzoObiettivo,
    offertaMaxBase: player.computed.offertaMaxBase,
    dynamicMax,
    budgetResiduo: myManager.budgetResidual,
    slot: slot?.slotKey ?? null,
    scarcity,
    reasons,
    alternatives,
  };
}
