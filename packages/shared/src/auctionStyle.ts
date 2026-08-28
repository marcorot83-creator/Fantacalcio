export type AuctionStyleId = "PRUDENT" | "MEDIUM" | "AGGRESSIVE";

export interface AuctionRiskStyle {
  id: AuctionStyleId;
  name: string;
  description: string;
  /** Multiplier on the ATTACCA/COMPRA thresholds relative to prezzoObiettivo. */
  targetAggressiveness: number;
  /** Multiplier applied to the computed "normal" DynamicMax. */
  dynamicCapMultiplier: number;
  /** Max extra % above DynamicMax reachable via an explicit, financed override. */
  strategicOverridePct: number;
  overspendTolerance: "low" | "medium" | "high";
  reserveProtection: "high" | "medium" | "low";
}

export const AUCTION_STYLES: Record<AuctionStyleId, AuctionRiskStyle> = {
  PRUDENT: {
    id: "PRUDENT", name: "Prudente",
    description: "Disciplina forte sui prezzi. Preferisce perdere un obiettivo piuttosto che compromettere il piano.",
    targetAggressiveness: 0.96,
    dynamicCapMultiplier: 0.97,
    strategicOverridePct: 0,
    overspendTolerance: "low",
    reserveProtection: "high",
  },
  MEDIUM: {
    id: "MEDIUM", name: "Medio",
    description: "Equilibrio tra disciplina e aggressività. Può usare parte del buffer per obiettivi realmente importanti.",
    targetAggressiveness: 1.0,
    dynamicCapMultiplier: 1.0,
    strategicOverridePct: 0.045,
    overspendTolerance: "medium",
    reserveProtection: "medium",
  },
  AGGRESSIVE: {
    id: "AGGRESSIVE", name: "Aggressivo",
    description: "Disposto a spingere di più sui target prioritari, sfruttando in modo deciso savings e reallocazioni quando l'engine identifica una vera opportunità.",
    targetAggressiveness: 1.04,
    dynamicCapMultiplier: 1.05,
    strategicOverridePct: 0.09,
    overspendTolerance: "high",
    reserveProtection: "low",
  },
};

export function getAuctionStyle(id: AuctionStyleId): AuctionRiskStyle {
  return AUCTION_STYLES[id] ?? AUCTION_STYLES.MEDIUM;
}
