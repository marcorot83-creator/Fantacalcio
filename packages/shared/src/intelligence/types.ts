// ============================================================================
// Player Intelligence Layer — section 2 of the "PLAYER INTELLIGENCE" prompt.
// Adds HOW a player produces fantacalcio value and HOW they sit in their own
// team's hierarchies, layered on top of (never duplicating) the existing
// Player/PlayerDatabase and roster/session state.
// ============================================================================

export type IntelligenceSourceKind =
  | "excel" // already-curated data we already import (titolarita, coppie, rischio)
  | "manual_import" // a JSON/CSV import the user supplies (section 4/47)
  | "manual_override" // an explicit correction (section 45), always wins
  | "fantacalcio" | "sosfanta" | "stats_provider"; // predisposed, not wired (section 4/64)

export interface IntelligenceSource {
  kind: IntelligenceSourceKind;
  label: string;
  fetchedAt: string; // ISO
  note?: string;
}

export type Staleness = "FRESH" | "AGING" | "STALE" | "UNKNOWN";

// ---------------------------------------------------------------- Lineup ---

export type LineupCategory = "NAILED" | "STRONG_STARTER" | "FAVORITE" | "BALLOT" | "BACKUP" | "FRINGE";

export interface LineupIntelligence {
  starterProbability: number; // 0-100
  category: LineupCategory;
  battleId: string | null; // set when part of a genuine LineupBattle
  directCompetitorId: string | null; // clearest single backup/competitor, when not a real 50/50 battle
  staleness: Staleness;
}

export type LineupBattleType = "DIRECT_BATTLE" | "ROTATION" | "TACTICAL_ALTERNATIVE";

/** Section 6/7: two+ players genuinely competing for the same XI spot — never collapsed into a single "pair = player X". */
export interface LineupBattle {
  id: string;
  team: string;
  positionGroup: string;
  players: { playerId: string; probability: number }[];
  type: LineupBattleType;
  confidence: number; // 0-1
  updatedAt: string;
  sources: IntelligenceSource[];
}

// --------------------------------------------------------------- Pairing ---

export type PlayerPairingType = "DIRECT_BACKUP" | "BALLOT_PAIR" | "TACTICAL_COVER" | "STRATEGIC_PAIR";

/** Section 8: distinct from a LineupBattle — a pairing is about acquisition strategy (do I buy both?), not who starts. */
export interface PlayerPairing {
  id: string;
  primaryPlayerId: string;
  secondaryPlayerId: string;
  type: PlayerPairingType;
  strength: number; // 0-100
  estimatedCoverage: number; // 0-100
  note: string | null;
  sourceConfidence: number; // 0-1
  updatedAt: string;
  sources: IntelligenceSource[];
}

export interface PairingIntelligence {
  pairings: PlayerPairing[]; // this player as primary OR secondary in any pairing
}

// -------------------------------------------------------------- Penalty ---

export type PenaltyRank = 1 | 2 | 3 | null;

export interface PenaltyHierarchy {
  team: string;
  players: { playerId: string; rank: PenaltyRank; confidence: number }[];
  updatedAt: string;
  sources: IntelligenceSource[];
}

export interface PenaltyIntelligence {
  rank: PenaltyRank;
  confidence: number; // 0-1
  penaltyValueScore: number; // 0-100 — already folds in starterProbability + team attack factor (section 14)
  staleness: Staleness;
}

// ------------------------------------------------------------ Set pieces ---

export type SetPieceRole = "PRIMARY" | "SECONDARY" | "OCCASIONAL" | "NONE";

export interface SetPieceIntelligence {
  cornerRole: SetPieceRole;
  directFreeKickRole: SetPieceRole;
  indirectFreeKickRole: SetPieceRole;
  setPieceValueScore: number; // 0-100
  staleness: Staleness;
}

// ----------------------------------------------------------- Goal threat ---

export type GoalThreatConfidence = "NONE" | "LOW" | "MEDIUM" | "HIGH";
export type GoalThreatTier = "ECCEZIONALE" | "ALTO" | "BUONO" | "MEDIO" | "BASSO" | "MINIMO";

export interface GoalThreatStatSeason {
  season: string; // "2026/27"
  minutes: number;
  nonPenaltyGoals?: number;
  nonPenaltyXG?: number;
  shots?: number;
  shotsInBox?: number;
  bigChances?: number;
  touchesInOppBox?: number;
  headedShots?: number;
  setPieceXG?: number;
}

export interface EditorialGoalThreatSignal {
  text: string;
  weight: number; // 0-1 — how strong an editorial cue this is, not a substitute for quant data (section 25)
  source: IntelligenceSource;
}

export interface GoalThreatIntelligence {
  index: number; // 0-100, role-agnostic raw score
  percentileWithinRole: number; // 0-100 — the number that actually matters (section 20)
  tier: GoalThreatTier;
  confidence: GoalThreatConfidence;
  sampleMinutes: number;
  editorialSignals: EditorialGoalThreatSignal[];
  staleness: Staleness;
}

// ------------------------------------------------------- Bonus potential ---

/** Section 27/28/50: distinct from Indice Fanta (overall value) and split into reliable vs upside. */
export interface BonusPotential {
  score: number; // 0-100, combined
  reliable: number; // 0-100 — bonus routes already backed by a starting role + solid confidence
  upside: number; // 0-100 — real signal, not yet backed by minutes/certainty
}

// ------------------------------------------------------------- Aggregate ---

export interface PlayerIntelligence {
  playerId: string;
  lineup: LineupIntelligence;
  pairing: PairingIntelligence;
  penalty: PenaltyIntelligence;
  setPieces: SetPieceIntelligence;
  goalThreat: GoalThreatIntelligence;
  bonusPotential: BonusPotential;
  manualOverride: ManualOverride | null;
  updatedAt: string;
  confidence: number; // 0-1 overall
  sources: IntelligenceSource[];
}

/** Section 45: an explicit correction. Always wins over automatic sources until removed. */
export interface ManualOverride {
  penaltyRank?: PenaltyRank;
  starterProbability?: number;
  cornerRole?: SetPieceRole;
  directFreeKickRole?: SetPieceRole;
  indirectFreeKickRole?: SetPieceRole;
  setAt: string;
  note?: string;
}

export interface PlayerIntelligenceStore {
  players: Record<string, PlayerIntelligence>;
  battles: LineupBattle[];
  pairings: PlayerPairing[];
  penaltyHierarchies: PenaltyHierarchy[];
  updatedAt: string | null; // section 47: "ultimo aggiornamento Player Intelligence" — null until anything has ever been computed
}

export const EMPTY_INTELLIGENCE_STORE: PlayerIntelligenceStore = {
  players: {},
  battles: [],
  pairings: [],
  penaltyHierarchies: [],
  updatedAt: null,
};
