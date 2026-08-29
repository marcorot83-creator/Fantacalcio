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

/**
 * Section 1/34: when the current slot's own plan has already collapsed
 * (e.g. Pc2 after an expensive Pc1), name the purchase that caused it so
 * the reasoning is legible ("hai già Malen come Pc premium a 164") instead
 * of just a smaller number with no story behind it.
 */
function describeSiblingInvestment(session: AuctionSession, players: Player[], famiglia: Famiglia433, excludeSlotKey: string): string | null {
  const myManager = getMyManager(session);
  const siblingSlots = session.rosterSlots.filter((s) => s.famiglia === famiglia && s.slotKey !== excludeSlotKey && s.playerId != null);
  if (siblingSlots.length === 0) return null;
  let best: { nome: string; price: number } | null = null;
  for (const s of siblingSlots) {
    const paid = myManager.players.find((mp) => mp.playerId === s.playerId)?.paidPrice;
    const p = players.find((pp) => pp.id === s.playerId);
    if (paid == null || !p) continue;
    if (!best || paid > best.price) best = { nome: p.nome, price: paid };
  }
  if (!best) return null;
  return `Hai già ${best.nome} (${best.price} crediti) in questo reparto: il resto del budget va protetto per gli altri ruoli.`;
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

  // Static, player-only baseline (still shown in the UI as "Target" /
  // "Base Max" so the absolute market value stays visible) — kept unchanged
  // for backward compatibility with existing callers/UI.
  const prezzoObiettivo = Math.round(player.computed.prezzoObiettivo * style.targetAggressiveness);
  // The actually-operative target for ATTACCA/COMPRA/RILANCIA banding:
  // rescaled proportionally onto the new slot-anchored dynamicMax, so once a
  // role is already satisfied the bands shrink along with the ceiling
  // instead of staying pinned to the player's own market-wide target.
  const targetRatio = Math.min(0.98, Math.max(0.5, player.computed.prezzoObiettivo / player.computed.offertaMaxBase));
  const bandTarget = Math.max(1, Math.round(dynamicMax * targetRatio));
  const siblingNote = slot ? describeSiblingInvestment(session, players, famiglia, slot.slotKey) : null;

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

  // Section 1/15/34: a saturated slot (its own plan collapsed well below the
  // player's market value) gets its story told up front, before the price
  // banding — this is the "hai già Malen come Pc premium" explanation.
  const saturated = slot != null && dmx.slotBudgetAnchor < player.computed.offertaMaxBase * 0.6;
  if (saturated && siblingNote) reasons.push(siblingNote);

  if (currentBid > ceiling) {
    action = "MOLLA";
    headline = `MOLLA A ${currentBid}.`;
    reasons.push(`Prezzo ${currentBid} sopra la red line${aggressive.financeable ? " (anche includendo l'override)" : ""} (${ceiling}).`);
    if (saturated && slot) {
      reasons.push(`${slot.slotKey} ha ora un budget target di ${dmx.slotBudgetAnchor} crediti: il valore di mercato del giocatore (${player.computed.offertaMaxBase}) non è più il riferimento.`);
    } else if (dmx.budgetFeasibilityCap < player.computed.offertaMaxBase) {
      reasons.push(`Il budget residuo (${myManager.budgetResidual}) non regge oltre ${dmx.budgetFeasibilityCap} tenendo 1 credito per ogni slot ancora da coprire.`);
    }
    if (alternatives.length > 0) {
      reasons.push(`Restano ${alternatives.length} alternative valide: ${alternatives.slice(0, 3).map((a) => a.nome).join(", ")}.`);
    }
    reasons.push("Il prezzo già raggiunto è sunk cost: non inseguire il nome.");
  } else if (slotAlreadyCovered && currentBid > bandTarget) {
    action = "MOLLA";
    headline = `MOLLA A ${currentBid}.`;
    reasons.push(`Nel tuo ${formation.name} + ${strategy.name} questo ruolo non ha uno slot strutturale scoperto: non serve pagare sopra target.`);
  } else if (currentBid <= bandTarget * 0.97) {
    action = "ATTACCA";
    headline = `ATTACCA. RILANCIA FINO A ${ceiling}.`;
    reasons.push(`Prezzo attuale ${currentBid} è sotto il target per la tua rosa (${bandTarget}).`);
    if (slot) reasons.push(`Copre lo slot ${slot.slotKey} (${slot.profilo}), ancora scoperto.`);
    if (strategicFitScore >= 70) reasons.push(`StrategicFitScore ${strategicFitScore}: coerente con ${formation.name} + ${strategy.name}.`);
    if (scarcity) reasons.push(`Scarsità ${famiglia}: ${scarcity.level} (indice ${scarcity.scarcityIndex}).`);
  } else if (currentBid <= bandTarget * 1.06) {
    action = "COMPRA";
    headline = `COMPRA A ${currentBid} SE SERVE.`;
    reasons.push(`Prezzo ${currentBid} è in linea con il target per la tua rosa (${bandTarget}).`);
    if (slot) reasons.push(`Slot ${slot.slotKey} ancora aperto: acquisto coerente col piano.`);
  } else {
    action = "RILANCIA";
    headline = `RILANCIA FINO A ${ceiling}.`;
    // currentBid <= ceiling is already guaranteed here (the MOLLA branch above
    // catches anything past it) — but ceiling can be the style's override
    // (aggressiveMax), which sits above the plain dynamicMax. Say so
    // precisely instead of always claiming "sotto la red line dinamica",
    // which would be false whenever the override is what's actually covering it.
    reasons.push(
      currentBid <= dynamicMax
        ? `Prezzo ${currentBid} è sopra il target per la tua rosa (${bandTarget}) ma sotto la red line dinamica (${dynamicMax}).`
        : `Prezzo ${currentBid} supera la red line dinamica (${dynamicMax}), ma resta entro l'override ${style.name.toLowerCase()} (${ceiling}).`
    );
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
