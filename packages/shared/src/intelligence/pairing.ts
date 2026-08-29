import type { PlayerDatabase } from "../types";
import type { IntelligenceSource, LineupBattle, PlayerPairing, PlayerPairingType } from "./types";

/**
 * Section 7: classify from the actual curated text instead of collapsing
 * everything into one "pair" concept. Keyword-driven on real data (the
 * "Tipo"/"Nota" columns of "Coppie & Gioielli"), not invented.
 */
function classifyPairingType(tipo: string, nota: string): PlayerPairingType {
  const t = `${tipo} ${nota}`.toLowerCase();
  if (t.includes("ballottaggio")) return "BALLOT_PAIR";
  if (t.includes("handcuff") || t.includes("riserva diretta") || t.includes("backup diretto") || t.includes("riserva secca")) {
    return "DIRECT_BACKUP";
  }
  if (t.includes("copertura")) return "TACTICAL_COVER";
  return "STRATEGIC_PAIR";
}

function priorityStrength(priorita: string): number {
  const p = (priorita || "").toUpperCase();
  if (p.includes("ALTA")) return 80;
  if (p.includes("MEDIA")) return 55;
  if (p.includes("BASSA")) return 30;
  return 50;
}

function estimatedCoverageFor(type: PlayerPairingType): number {
  switch (type) {
    case "DIRECT_BACKUP":
      return 85;
    case "BALLOT_PAIR":
      return 70;
    case "TACTICAL_COVER":
      return 55;
    case "STRATEGIC_PAIR":
      return 35;
  }
}

/** Section 8: real pairings, derived from the existing "Coppie & Gioielli" sheet — no fabricated data. */
export function derivePairingsFromCoppie(db: PlayerDatabase): PlayerPairing[] {
  const source: IntelligenceSource = { kind: "excel", label: "Coppie & Gioielli", fetchedAt: db.meta.importedAt };
  const pairings: PlayerPairing[] = [];
  for (const c of db.coppie) {
    if (!c.titolarePlayerId || !c.coperturaPlayerId) continue;
    const type = classifyPairingType(c.tipo, c.nota);
    pairings.push({
      id: `pair_${c.titolarePlayerId}_${c.coperturaPlayerId}`,
      primaryPlayerId: c.titolarePlayerId,
      secondaryPlayerId: c.coperturaPlayerId,
      type,
      strength: priorityStrength(c.priorita),
      estimatedCoverage: estimatedCoverageFor(type),
      note: c.nota || null,
      sourceConfidence: 0.75, // curated editorial pairing, not a raw scrape — solid but not certain
      updatedAt: db.meta.importedAt,
      sources: [source],
    });
  }
  return pairings;
}

/**
 * Section 6/7: a genuine ballottaggio — two players who really compete for
 * one XI spot — surfaced only for pairings actually classified as
 * BALLOT_PAIR, with the split derived from each player's own
 * starterProbability (titolarita) rather than inventing an exact
 * percentage the source data doesn't give us.
 */
export function deriveLineupBattles(db: PlayerDatabase, pairings: PlayerPairing[]): LineupBattle[] {
  const battles: LineupBattle[] = [];
  for (const pair of pairings) {
    if (pair.type !== "BALLOT_PAIR") continue;
    const a = db.players.find((p) => p.id === pair.primaryPlayerId);
    const b = db.players.find((p) => p.id === pair.secondaryPlayerId);
    if (!a || !b) continue;
    const totalTit = a.computed.titolarita + b.computed.titolarita;
    const probA = totalTit > 0 ? Math.round((a.computed.titolarita / totalTit) * 100) : 50;
    battles.push({
      id: `battle_${a.id}_${b.id}`,
      team: a.squadra,
      positionGroup: a.ruoloMantra,
      players: [
        { playerId: a.id, probability: probA },
        { playerId: b.id, probability: 100 - probA },
      ],
      type: "DIRECT_BATTLE",
      confidence: pair.sourceConfidence,
      updatedAt: pair.updatedAt,
      sources: pair.sources,
    });
  }
  return battles;
}

export interface PairValueContext {
  ownPrimary: boolean;
  primaryPaidPrice: number | null; // what I paid for the primary, if I own them
  primaryImportance: number; // 0-1 — how important/indispensable the primary slot is
  secondaryCandidatePrice: number; // current bid / expected price for the secondary
}

export type PairValueRecommendation = "COPRILO" | "VALUTA" | "NON_SERVE";

export interface PairValueResult {
  pairValue: number; // 0-100-ish score, not a credit amount
  recommend: PairValueRecommendation;
  reason: string;
}

/**
 * Section 9/10/11/31-34: the value of a pairing is dynamic — it only exists
 * once I own the primary, and it evaporates once the secondary's price
 * stops being proportionate to the risk it actually reduces. Deliberately
 * NOT a credit bonus added to DynamicMax directly (section 31: "questo
 * bonus deve essere limitato") — callers cap how much of `pairValue` leaks
 * into the bid ceiling.
 */
export function computePairValue(pairing: PlayerPairing, ctx: PairValueContext): PairValueResult {
  if (!ctx.ownPrimary) {
    return { pairValue: 0, recommend: "NON_SERVE", reason: "Non possiedi ancora il titolare di riferimento: la coppia non è ancora rilevante." };
  }

  const coverageStrength = pairing.estimatedCoverage / 100;
  const importance = Math.max(0, Math.min(1, ctx.primaryImportance));
  // How much real uncertainty there is to insure against — a genuine
  // ballottaggio needs more protection than a nailed-on starter's backup.
  const starterUncertainty = pairing.type === "BALLOT_PAIR" ? 0.85 : pairing.type === "DIRECT_BACKUP" ? 0.6 : pairing.type === "TACTICAL_COVER" ? 0.45 : 0.3;
  const backupQuality = pairing.strength / 100;

  const qualityScore = coverageStrength * 0.3 + importance * 0.3 + starterUncertainty * 0.2 + backupQuality * 0.2;

  // Section 9: "la copertura è interessante soltanto finché il suo costo è
  // proporzionato al rischio che riduce" — proportion anchored on a fraction
  // of what was paid for the primary (falls back to a flat reference when
  // the primary wasn't bought through this session, e.g. a hypothetical check).
  const referenceBudget = ctx.primaryPaidPrice ? ctx.primaryPaidPrice * 0.35 : 20;
  const priceEfficiency = Math.max(0, 1 - ctx.secondaryCandidatePrice / Math.max(1, referenceBudget));

  const pairValue = Math.round(100 * qualityScore * priceEfficiency);

  if (priceEfficiency <= 0.05) {
    return {
      pairValue,
      recommend: "NON_SERVE",
      reason: `Il costo della copertura (${ctx.secondaryCandidatePrice}) è ormai sproporzionato rispetto al rischio che ridurrebbe.`,
    };
  }
  if (pairValue >= 40) return { pairValue, recommend: "COPRILO", reason: "Copertura reale, a costo proporzionato: vale la pena." };
  if (pairValue >= 15) return { pairValue, recommend: "VALUTA", reason: "Copertura utile ma non prioritaria." };
  return { pairValue, recommend: "NON_SERVE", reason: "Lo slot è già sufficientemente coperto: non serve fare la coppia." };
}
