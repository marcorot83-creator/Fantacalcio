import type { AuctionSession, Famiglia433, Player } from "./types";
import { getMyManager } from "./budget";

export interface FeasibilityCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

/** Section 57: automatic post-purchase sanity checks. */
export function runFeasibilityChecks(session: AuctionSession, players: Player[]): FeasibilityCheck[] {
  const me = getMyManager(session);
  const openSlots = session.rosterSlots.filter((s) => s.playerId == null);
  const checks: FeasibilityCheck[] = [];

  const slotsRemaining = me.slotsTotal - me.slotsFilled;
  checks.push({
    key: "complete28",
    label: "Posso ancora completare la rosa?",
    ok: me.budgetResidual >= slotsRemaining,
    detail: `${me.slotsFilled}/${me.slotsTotal} giocatori, budget residuo ${me.budgetResidual}, servono almeno ${slotsRemaining} crediti.`,
  });

  const famigliaCoverage = (fam: Famiglia433) => session.rosterSlots.filter((s) => s.famiglia === fam);
  const structureOk = (["Dd", "Ds", "Dc", "Jolly", "A", "C", "M", "Pc", "Por"] as Famiglia433[]).every((fam) => {
    const slots = famigliaCoverage(fam);
    const filled = slots.filter((s) => s.playerId != null).length;
    const open = slots.length - filled;
    return me.budgetResidual >= open || open === 0;
  });
  checks.push({
    key: "structure433",
    label: "Posso ancora soddisfare la struttura 4-3-3?",
    ok: structureOk,
    detail: structureOk ? "Tutti i reparti restano copribili con il budget residuo." : "Uno o più reparti rischiano di restare scoperti.",
  });

  const pc1 = session.rosterSlots.find((s) => s.slotKey === "Pc1");
  const pcOk = !!pc1?.playerId || me.budgetResidual >= (pc1?.targetBudgetDynamic ?? 0) * 0.5;
  checks.push({
    key: "pc1",
    label: "Posso ancora permettermi un Pc forte?",
    ok: pcOk,
    detail: pc1?.playerId ? "Pc1 già coperto." : `Servirebbero almeno ${Math.round((pc1?.targetBudgetDynamic ?? 0) * 0.5)} crediti residui.`,
  });

  const a1 = session.rosterSlots.find((s) => s.slotKey === "A1");
  const aOk = !!a1?.playerId || me.budgetResidual >= (a1?.targetBudgetDynamic ?? 0) * 0.5;
  checks.push({
    key: "a1",
    label: "Se A1 non è ancora presa, posso ancora permettermi una A top?",
    ok: aOk,
    detail: a1?.playerId ? "A1 già coperta." : `Servirebbero almeno ${Math.round((a1?.targetBudgetDynamic ?? 0) * 0.5)} crediti residui.`,
  });

  const ddDs = ["Dd1", "Ds1"].map((k) => session.rosterSlots.find((s) => s.slotKey === k));
  const ddDsOk = ddDs.every((s) => !s || s.playerId != null || me.budgetResidual >= (s.targetBudgetDynamic ?? 0) * 0.3);
  checks.push({
    key: "ddds",
    label: "Copertura Dd/Ds sufficiente?",
    ok: ddDsOk,
    detail: ddDsOk ? "Struttura esterni ancora sostenibile." : "Rischio di restare scoperto su Dd/Ds top.",
  });

  const myLowTitolarita = me.players.filter((mp) => {
    const p = players.find((pl) => pl.id === mp.playerId);
    return p && p.computed.titolarita < 50;
  }).length;
  checks.push({
    key: "titolarita",
    label: "Esposizione a bassa titolarità",
    ok: myLowTitolarita <= 5,
    detail: `${myLowTitolarita} giocatori con titolarità sotto 50%.`,
  });

  const scommesse = session.rosterSlots.filter((s) => s.profilo.toUpperCase().includes("SCOMMESSA") && s.playerId != null).length;
  checks.push({
    key: "scommesse",
    label: "Quanti slot affidati a scommesse?",
    ok: scommesse <= 6,
    detail: `${scommesse} slot scommessa già occupati.`,
  });

  return checks;
}
