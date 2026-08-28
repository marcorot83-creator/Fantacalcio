import type { MantraRole } from "./mantra";

export type StrategyId =
  | "BOMBER_GEMS" | "BALANCED" | "PREMIUM_ATTACK" | "IRON_MIDFIELD"
  | "PREMIUM_FLANKS" | "PREMIUM_SOLIDITY" | "VALUE_HUNTER";

export type RoleGroup = "offensivePremium" | "midfieldCore" | "flank";

export interface AuctionStrategyProfile {
  id: StrategyId;
  name: string;
  description: string;
  /** Per-role budget/priority multiplier, baseline 1.0. */
  roleWeights: Partial<Record<MantraRole, number>>;
  /**
   * Section 8: the actual mechanism that combines strategy with the chosen
   * formation — pulls in the formation's offensivePremium/midfieldCore/flank
   * role group and boosts it, instead of the strategy hardcoding role names
   * that only make sense for one formation.
   */
  roleGroupBoost: { group: RoleGroup; multiplier: number } | null;
  tierPreference: { top: number; semitop: number; starter: number; scommessa: number; low: number };
  attributeWeights: {
    fantaScore: number; valueScore: number; starterProbability: number;
    upside: number; reliability: number; versatility: number; lowRisk: number;
  };
  /** 0-1: how much budget concentrates on 1-2 stars vs spreading out. */
  starsConcentration: number;
  /** 0-1: weight on GemScore when picking targets. */
  gemPreference: number;
}

export const STRATEGIES: Record<StrategyId, AuctionStrategyProfile> = {
  BOMBER_GEMS: {
    id: "BOMBER_GEMS", name: "Bomber + Gioielli",
    description: "Investimento molto elevato su una prima punta differenziale, finanziato con titolari low cost e scommesse ad alto upside.",
    roleWeights: { Pc: 1.6 },
    roleGroupBoost: { group: "offensivePremium", multiplier: 1.4 },
    tierPreference: { top: 1.35, semitop: 0.9, starter: 0.85, scommessa: 1.1, low: 1.0 },
    attributeWeights: { fantaScore: 0.9, valueScore: 1.0, starterProbability: 0.7, upside: 1.2, reliability: 0.6, versatility: 0.6, lowRisk: 0.5 },
    starsConcentration: 0.85,
    gemPreference: 0.8,
  },
  BALANCED: {
    id: "BALANCED", name: "Bilanciata",
    description: "Distribuisce il budget sui reparti evitando sia una superstar troppo costosa sia troppi slot low cost: pochissimi buchi in rosa.",
    roleWeights: {},
    roleGroupBoost: null,
    tierPreference: { top: 0.95, semitop: 1.15, starter: 1.1, scommessa: 0.85, low: 0.9 },
    attributeWeights: { fantaScore: 1.0, valueScore: 0.9, starterProbability: 0.9, upside: 0.7, reliability: 0.9, versatility: 0.9, lowRisk: 0.7 },
    starsConcentration: 0.35,
    gemPreference: 0.4,
  },
  PREMIUM_ATTACK: {
    id: "PREMIUM_ATTACK", name: "Attacco Premium",
    description: "Massimizza il potenziale offensivo: quota maggiorata di budget sugli slot che producono più bonus nel modulo scelto.",
    roleWeights: {},
    roleGroupBoost: { group: "offensivePremium", multiplier: 1.8 },
    tierPreference: { top: 1.2, semitop: 1.05, starter: 0.85, scommessa: 0.9, low: 0.85 },
    attributeWeights: { fantaScore: 1.1, valueScore: 0.8, starterProbability: 0.8, upside: 1.0, reliability: 0.6, versatility: 0.6, lowRisk: 0.5 },
    starsConcentration: 0.65,
    gemPreference: 0.45,
  },
  IRON_MIDFIELD: {
    id: "IRON_MIDFIELD", name: "Centrocampo di Ferro",
    description: "Investe nei giocatori centrali ad alta titolarità e rendimento, riducendo la dipendenza da pochi fuoriclasse offensivi.",
    roleWeights: { T: 1.15 },
    roleGroupBoost: { group: "midfieldCore", multiplier: 1.6 },
    tierPreference: { top: 0.95, semitop: 1.15, starter: 1.15, scommessa: 0.75, low: 0.85 },
    attributeWeights: { fantaScore: 1.0, valueScore: 0.85, starterProbability: 1.2, upside: 0.6, reliability: 1.1, versatility: 0.9, lowRisk: 0.8 },
    starsConcentration: 0.4,
    gemPreference: 0.3,
  },
  PREMIUM_FLANKS: {
    id: "PREMIUM_FLANKS", name: "Fasce Premium",
    description: "Costruisce un vantaggio sulle corsie investendo in terzini, esterni e ali ad alto rendimento e potenziale bonus.",
    roleWeights: {},
    roleGroupBoost: { group: "flank", multiplier: 1.7 },
    tierPreference: { top: 1.1, semitop: 1.1, starter: 0.95, scommessa: 0.9, low: 0.85 },
    attributeWeights: { fantaScore: 1.0, valueScore: 0.9, starterProbability: 0.85, upside: 1.0, reliability: 0.8, versatility: 1.15, lowRisk: 0.6 },
    starsConcentration: 0.5,
    gemPreference: 0.5,
  },
  PREMIUM_SOLIDITY: {
    id: "PREMIUM_SOLIDITY", name: "Solidità Premium",
    description: "Riduce il rischio: titolari affidabili, gerarchie chiare, pochi slot fragili. Non spende per forza sui difensori: compra certezza.",
    roleWeights: { Dc: 1.15, Por: 1.1 },
    roleGroupBoost: null,
    tierPreference: { top: 0.85, semitop: 1.1, starter: 1.25, scommessa: 0.55, low: 0.9 },
    attributeWeights: { fantaScore: 0.85, valueScore: 0.75, starterProbability: 1.3, upside: 0.4, reliability: 1.35, versatility: 0.7, lowRisk: 1.3 },
    starsConcentration: 0.25,
    gemPreference: 0.2,
  },
  VALUE_HUNTER: {
    id: "VALUE_HUNTER", name: "Value Hunter",
    description: "Non insegue i nomi: compra sistematicamente i giocatori pagati meno del loro valore stimato, adattandosi ai prezzi reali dell'asta.",
    roleWeights: {},
    roleGroupBoost: null,
    tierPreference: { top: 0.8, semitop: 1.1, starter: 1.15, scommessa: 1.0, low: 0.95 },
    attributeWeights: { fantaScore: 0.85, valueScore: 1.4, starterProbability: 0.9, upside: 0.8, reliability: 0.8, versatility: 0.9, lowRisk: 0.7 },
    starsConcentration: 0.3,
    gemPreference: 0.6,
  },
};

export function getStrategy(id: StrategyId): AuctionStrategyProfile {
  return STRATEGIES[id] ?? STRATEGIES.BOMBER_GEMS;
}
