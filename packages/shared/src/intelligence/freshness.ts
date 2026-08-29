import type { Staleness } from "./types";

/**
 * Section 40/41: ballottaggi, rigoristi e gerarchie sono più volatili del
 * resto del database. `updatedAt` è tipicamente la data d'importazione del
 * dataset (per i segnali derivati dall'Excel) o la data dell'import manuale.
 */
export function computeStaleness(updatedAt: string | null, freshDays = 7, agingDays = 21): Staleness {
  if (!updatedAt) return "UNKNOWN";
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return "UNKNOWN";
  const ageDays = (Date.now() - t) / 86_400_000;
  if (ageDays <= freshDays) return "FRESH";
  if (ageDays <= agingDays) return "AGING";
  return "STALE";
}

/** Section 41: stale data must weigh less in the recommendation engine. */
export function stalenessWeight(staleness: Staleness): number {
  switch (staleness) {
    case "FRESH":
      return 1;
    case "AGING":
      return 0.7;
    case "STALE":
      return 0.35;
    case "UNKNOWN":
      return 0.5;
  }
}

export interface WeightedObservation {
  value: number;
  confidence: number; // 0-1
}

export interface ConsensusResult {
  value: number;
  confidence: number;
  disagreement: boolean;
}

/**
 * Section 42: conflicting sources are never resolved by picking one
 * arbitrarily — blend by confidence and flag real disagreement instead.
 */
export function consensus(observations: WeightedObservation[]): ConsensusResult {
  if (observations.length === 0) return { value: 0, confidence: 0, disagreement: false };
  const totalWeight = observations.reduce((s, o) => s + Math.max(0.05, o.confidence), 0);
  const value = observations.reduce((s, o) => s + o.value * Math.max(0.05, o.confidence), 0) / totalWeight;
  const spread = Math.max(...observations.map((o) => o.value)) - Math.min(...observations.map((o) => o.value));
  const disagreement = observations.length > 1 && spread > 15;
  const avgConfidence = totalWeight / observations.length;
  const confidence = Math.max(0, Math.min(1, disagreement ? avgConfidence * 0.7 : avgConfidence));
  return { value: Math.round(value), confidence, disagreement };
}
