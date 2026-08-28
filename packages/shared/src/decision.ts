import type {
  AuctionSession, BidRecommendation, Famiglia433, GraduatoriaEntry, MarketState, Player, RosterSlot,
} from "./types";
import { eligibleMantraRoles, type MantraRole } from "./mantra";
import { computeDynamicMax, computeAggressiveMax, getMyManager, slotsStillToBuy } from "./budget";
import { findAlternatives } from "./alternatives";
import { getFormation } from "./formations";
import { getStrategy } from "./strategies";
import { getAuctionStyle } from "./auctionStyle";
import { computeStrategicFitScore } from "./strategicFit";

/** @deprecated use findOpenSlotForRoles — kept for any lingering Famiglia433-only caller. */
export function findOpenSlotForFamily(rosterSlots: RosterSlot[], famiglia: Famiglia433): RosterSlot | undefined {
  const open = rosterSlots.filter((s) => s.famiglia === famiglia && s.playerId == null);
  if (open.length === 0) return undefined;
  return [...open].sort((a, b) => a.protectPriority - b.protectPriority)[0];
}

/** The most important still-open slot any of these Mantra roles could fill. */
export function findOpenSlotForRoles(rosterSlots: RosterSlot[], roles: MantraRole[]): RosterSlot | undefined {
  const open = rosterSlots.filter((s) => s.playerId == null && roles.includes(s.role));
  if (open.length === 0) return undefined;
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
  const roles = eligibleMantraRoles(player.ruoloMantra);
  const slot = findOpenSlotForRoles(session.rosterSlots, roles);
  const scarcity = marketState.scarcity[famiglia] ?? null;

  const formation = getFormation(session.settings.primaryFormation);
  const strategy = getStrategy(session.settings.strategyProfile);
  const style = getAuctionStyle(session.settings.auctionStyle);
  const strategicFitScore = computeStrategicFitScore(player, formation, strategy);

  const dmx = computeDynamicMax({
    player, session, manager: myManager,
    slotsStillToBuy: slotsStillToBuy(myManager, session.rosterSlots) - (slot ? 1 : 0),
    slot,
  });
  const dynamicMax = dmx.dynamicMax;
  const aggressive = computeAggressiveMax({ session, dynamicMax, slot });

  const prezzoObiettivo = Math.round(player.computed.prezzoObiettivo * style.targetAggressiveness);
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
  // The style's explicit override headroom is only ever usable, not automatic:
  // it must actually be financeable and only kicks in once the plain dynamicMax is exhausted.
  const ceiling = aggressive.financeable ? aggressive.aggressiveMax : dynamicMax;

  if (currentBid > ceiling) {
    action = "MOLLA";
    headline = `MOLLA A ${currentBid}.`;
    reasons.push(`Prezzo ${currentBid} sopra la red line${aggressive.financeable ? " (anche includendo l'override)" : ""} (${ceiling}).`);
    if (dmx.budgetFeasibilityCap < player.computed.offertaMaxBase) {
      reasons.push(`Il budget residuo (${myManager.budgetResidual}) non regge oltre ${dmx.budgetFeasibilityCap} tenendo 1 credito per ogni slot ancora da coprire.`);
    }
    if (alternatives.length > 0) {
      reasons.push(`Restano ${alternatives.length} alternative valide: ${alternatives.slice(0, 3).map((a) => a.nome).join(", ")}.`);
    }
    reasons.push("Il prezzo già raggiunto è sunk cost: non inseguire il nome.");
  } else if (slotAlreadyCovered && currentBid > prezzoObiettivo) {
    action = "MOLLA";
    headline = `MOLLA A ${currentBid}.`;
    reasons.push(`Nel tuo ${formation.name} + ${strategy.name} questo ruolo non ha uno slot strutturale scoperto: non serve pagare sopra target.`);
  } else if (currentBid <= prezzoObiettivo * 0.97) {
    action = "ATTACCA";
    headline = `ATTACCA. RILANCIA FINO A ${dynamicMax}.`;
    reasons.push(`Prezzo attuale ${currentBid} è sotto il target (${prezzoObiettivo}).`);
    if (slot) reasons.push(`Copre lo slot ${slot.slotKey} (${slot.profilo}), ancora scoperto.`);
    if (strategicFitScore >= 70) reasons.push(`StrategicFitScore ${strategicFitScore}: coerente con ${formation.name} + ${strategy.name}.`);
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
    if (strategicFitScore < 50) {
      reasons.push(`StrategicFitScore basso (${strategicFitScore}) per ${formation.name} + ${strategy.name}: non forzare oltre il necessario.`);
    } else if (scarcity && (scarcity.level === "alta" || scarcity.level === "critica")) {
      reasons.push(`Scarsità ${famiglia} ${scarcity.level}: poche alternative di pari livello ancora libere.`);
    } else if (alternatives.length >= 3) {
      reasons.push(`Ci sono comunque ${alternatives.length} alternative se molli: valuta se vale davvero la pena spingere.`);
    }
    if (dynamicMax < player.computed.offertaMaxBase) {
      reasons.push(`Red line ridotta rispetto al cap base (${player.computed.offertaMaxBase}) per proteggere gli altri slot ancora aperti.`);
    }
    if (aggressive.financeable && aggressive.extra > 0) {
      reasons.push(`Override ${getAuctionStyle(session.settings.auctionStyle).name.toLowerCase()} disponibile fino a ${aggressive.aggressiveMax}: ${aggressive.note}`);
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
    aggressiveMax: aggressive.financeable ? aggressive.aggressiveMax : dynamicMax,
    aggressiveMaxNote: aggressive.financeable && aggressive.extra > 0 ? aggressive.note : null,
    strategicFitScore,
    budgetResiduo: myManager.budgetResidual,
    slot: slot?.slotKey ?? null,
    scarcity,
    reasons,
    alternatives,
  };
}
