import type { AuctionSession, GraduatoriaEntry, Player } from "./types";
import { eligibleMantraRoles } from "./mantra";
import { findOpenSlotForRoles } from "./decision";
import { getMyManager } from "./budget";
import { getFormation } from "./formations";
import { getStrategy } from "./strategies";
import { computeStrategicFitScore } from "./strategicFit";

/** Section 49: "Perché comprarlo nella MIA rosa?" — contextual to the current roster + configurazione. */
export function explainWhyForMyRoster(params: {
  player: Player;
  session: AuctionSession;
  graduatorie: GraduatoriaEntry[];
}): string[] {
  const { player, session, graduatorie } = params;
  const reasons: string[] = [];
  const fam = player.computed.famiglia433;
  const me = getMyManager(session);
  const roles = eligibleMantraRoles(player.ruoloMantra);
  const slot = findOpenSlotForRoles(session.rosterSlots, roles);
  const alreadyOwn = me.players.length;

  const formation = getFormation(session.settings.primaryFormation);
  const strategy = getStrategy(session.settings.strategyProfile);
  const fitScore = computeStrategicFitScore(player, formation, strategy);
  reasons.push(`StrategicFitScore ${fitScore}/100 per ${formation.name} + ${strategy.name}.`);

  if (slot) {
    reasons.push(`Coprirebbe ${slot.slotKey} (${slot.profilo}), ancora scoperto in rosa, con target ${slot.targetBudgetDynamic} crediti.`);
  } else {
    reasons.push(`Il ruolo ${player.ruoloMantra} risulta già coperto nel tuo ${formation.name}: sarebbe un acquisto opportunistico, non strutturale.`);
  }

  const rank = graduatorie.find((g) => g.playerId === player.id && g.famiglia === fam)?.rank;
  if (rank) reasons.push(`È il #${rank} della graduatoria per ${fam}.`);

  if (player.computed.gemScore >= 65) reasons.push(`Gem score ${player.computed.gemScore}: ottimo rapporto qualità/prezzo per finanziare i top.`);
  if (player.computed.tierGruppo === "Top") reasons.push(`È un profilo Top: coerente con ${strategy.name} se il resto della rosa lo finanzia.`);
  if (player.versatilita > 1) reasons.push(`Pluriruolo (${player.ruoloMantra}): aumenta la flessibilità della rosa e la compatibilità con moduli secondari.`);
  if (player.rischio && player.rischio.toUpperCase() !== "BASSO") reasons.push(`Attenzione al rischio "${player.rischio}": verifica la fonte prima di spingere.`);
  reasons.push(`Prezzo obiettivo ${player.computed.prezzoObiettivo}, walk-away cap ${player.computed.offertaMaxBase}.`);
  if (alreadyOwn === 0) reasons.push("Primo acquisto della sessione: nessun vincolo di budget accumulato ancora.");

  return reasons;
}
