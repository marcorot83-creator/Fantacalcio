import type { AuctionSession, Famiglia433, Player } from "./types";
import { getMyManager, netSurplus } from "./budget";

export interface StatusSummary {
  budgetInitial: number;
  budgetResidual: number;
  slotsFilled: number;
  slotsTotal: number;
  perFamiglia: Record<string, { filled: number; total: number }>;
  overspendTotal: number;
  savingTotal: number;
  netSurplus: number;
  inflation: Partial<Record<Famiglia433, number>>;
  creditiMediPerSlotAperto: number;
}

const FAMILY_ORDER: Famiglia433[] = ["Por", "Dd", "Ds", "Dc", "Jolly", "A", "C", "M", "Pc"];

export function buildStatusSummary(session: AuctionSession): StatusSummary {
  const me = getMyManager(session);
  const perFamiglia: StatusSummary["perFamiglia"] = {};
  for (const fam of FAMILY_ORDER) {
    const slots = session.rosterSlots.filter((s) => s.famiglia === fam);
    perFamiglia[fam] = { filled: slots.filter((s) => s.playerId != null).length, total: slots.length };
  }
  const openSlots = session.rosterSlots.filter((s) => s.playerId == null).length;
  const inflation: StatusSummary["inflation"] = {};
  for (const [fam, stats] of Object.entries(session.marketState.perFamiglia)) {
    if (stats) inflation[fam as Famiglia433] = Math.round((stats.adjustedMarketIndex - 1) * 1000) / 10; // % delta
  }

  return {
    budgetInitial: me.budgetInitial,
    budgetResidual: me.budgetResidual,
    slotsFilled: me.slotsFilled,
    slotsTotal: me.slotsTotal,
    perFamiglia,
    overspendTotal: session.strategyState.overspendTotal,
    savingTotal: session.strategyState.savingTotal,
    netSurplus: netSurplus(session),
    inflation,
    creditiMediPerSlotAperto: openSlots > 0 ? Math.round((me.budgetResidual / openSlots) * 10) / 10 : 0,
  };
}

export function renderStatusText(summary: StatusSummary): string {
  const lines: string[] = [];
  lines.push("ASTA ATTIVA");
  lines.push(`Budget: ${summary.budgetResidual}/${summary.budgetInitial}`);
  lines.push(`Rosa: ${summary.slotsFilled}/${summary.slotsTotal}`);
  lines.push("");
  for (const fam of FAMILY_ORDER) {
    const c = summary.perFamiglia[fam];
    if (c) lines.push(`${fam}: ${c.filled}/${c.total}`);
  }
  lines.push("");
  lines.push(`Overspend: ${summary.overspendTotal}`);
  lines.push(`Saving: ${summary.savingTotal}`);
  lines.push("");
  const infl = Object.entries(summary.inflation);
  lines.push(infl.length ? `Inflazione osservata: ${infl.map(([f, v]) => `${f} ${v! > 0 ? "+" : ""}${v}%`).join(", ")}` : "Inflazione osservata: nessun dato");
  return lines.join("\n");
}

/** Traffic-light signal for a price vs a player's baseline (section 48). */
export type Semaforo = "verde" | "giallo" | "arancione" | "rosso" | "viola";

export function computeSemaforo(params: { price: number; prezzoObiettivo: number; dynamicMax: number; isGem: boolean }): Semaforo {
  const { price, prezzoObiettivo, dynamicMax, isGem } = params;
  if (isGem && price <= prezzoObiettivo) return "viola";
  if (price > dynamicMax) return "rosso";
  if (price > prezzoObiettivo * 1.05) return "arancione";
  if (price > prezzoObiettivo * 0.95) return "giallo";
  return "verde";
}
