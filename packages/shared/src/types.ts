import type { MantraRole } from "./mantra";
import type { FormationId } from "./formations";
import type { StrategyId } from "./strategies";
import type { AuctionStyleId } from "./auctionStyle";

// ============================================================================
// PERMANENT DATA — Player & Strategy Database (never touched by a new auction)
// ============================================================================

export type Famiglia433 =
  | "Por" | "Dd" | "Ds" | "Dc" | "Jolly" | "A" | "C" | "M" | "Pc" | "Non433";

export type TierEconomico = "Top" | "Semitop" | "Starter" | "Scommessa" | "Low";

export type Fascia = "S" | "A" | "B" | "C" | "D" | "E";

/** Raw + derived attributes for one player, sourced from "Lista calciatori". Immutable across auctions. */
export interface Player {
  id: string; // stable id: normalized(nome)+"|"+squadra
  excelRowId: number | null; // the "#" column, when present
  nome: string;
  nomeNormalizzato: string;
  fuoriLista: boolean;
  squadra: string;
  under: number | null;
  ruolo: string; // R.
  ruoloMantra: string; // R.MANTRA, full multi-role string e.g. "Dd/Ds/E"
  pgv: number | null;
  mv: number | null;
  fm: number | null;
  fvm500: number | null;
  quot: number | null;
  priorita: number | null;
  rischio: string;
  versatilita: number;
  tierSOS: string;
  affidabilita: string;
  motivoSintetico: string;
  fontiTitolarita: string;
  fontiMantra: string;
  fontiUpdate: string;

  // Helper raw inputs (H_*)
  hTitBase: number;
  hTitAdj: number;
  hSOSScore: number;
  hFVMpct: number;
  hPerf: number;
  hSeasonMatch: number;
  hSOSMatch: number;
  hCurrentMatch: number;

  // Computed baseline (section 7-21) — recomputed at import time, cached here
  computed: PlayerComputed;
}

export interface PlayerComputed {
  titolarita: number;
  classeTit: "Alta" | "Medio-alta" | "Media" | "Bassa" | "Minima";
  indiceFanta: number;
  indiceAffare: number;
  fascia: Fascia;
  miaMossa: string;
  famiglia433: Famiglia433;
  tierGruppo: TierEconomico;
  fattoreRischio: number;
  moltiplicatoreAstaStorico: number;
  prezzoAtteso: number;
  fit433: "ALTISSIMO" | "ALTO" | "MEDIO-ALTO" | "MEDIO" | "BASSO";
  strategia433: string;
  walkAwayCapRuolo: number;
  offertaMaxBase: number;
  prezzoObiettivo: number;
  gemScore: number;
}

/** One row of the curated "Graduatorie 433" ranking — the primary strategic signal. */
export interface GraduatoriaEntry {
  famiglia: Famiglia433;
  rank: number;
  nome: string;
  playerId: string | null; // resolved against Player DB
  squadra: string;
  ruoloMantra: string;
  profiloAsta: string; // TOP / SEMITOP / TITOLARE / SCOMMESSA...
  tierSOS: string;
  titolarita: number | null;
  coppiaCopertura: string | null;
  strategia: string | null;
  rischio: string;
  motivazione: string;
  fonte: string;
}

export interface CoppiaEntry {
  priorita: string;
  squadra: string;
  titolare: string;
  titolarePlayerId: string | null;
  ruoloTitolare: string;
  copertura: string;
  coperturaPlayerId: string | null;
  ruoloCopertura: string;
  tipo: string;
  budgetIndicativoMin: number;
  budgetIndicativoMax: number;
  nota: string;
  fonte: string;
}

export interface PacchettoPortieri {
  rank: number;
  squadra: string;
  titolare: string;
  titolarePlayerId: string | null;
  riserve: string;
  capPacchetto: number;
  target: number | null;
  qualita: string;
  mossa: string;
  nota: string;
}

export interface GioielloEntry {
  ruolo: string;
  nome: string;
  playerId: string | null;
  squadra: string;
  ruoloMantra: string;
  tier: string;
  titolarita: number;
  prezzoObiettivo: number;
  offertaMax: number;
  motivazione: string;
  fonte: string;
}

export interface WalkAwayCapRow {
  top: number; semitop: number; starter: number; scommessa: number; low: number;
}

export interface FinancingRule {
  evento: string;
  extraVsTarget: number;
  recuperoSuggerito: string;
  principio: string;
}

/** Static configuration derived from "Strategia 433" — permanent, shared by every AuctionSession. */
export interface StrategyConfig {
  budgetTotale: number;
  partecipanti: number;
  movimento: number;
  portieri: number;
  slotComplessivi: number;
  walkAwayCap: Record<Famiglia433, WalkAwayCapRow>;
  moltiplicatoreLega: Record<Famiglia433, number>;
  budgetReparto: Record<Famiglia433, number>;
  slotPlan: SlotPlanItem[];
  financingRules: FinancingRule[];
  pacchettiPortieri: PacchettoPortieri[];
}

export interface SlotPlanItem {
  slotKey: string; // "Dd1", "Pc2", ...
  famiglia: Famiglia433;
  /** Fine-grained Mantra role this slot actually needs (section 2/30) — the authoritative field for eligibility matching. */
  role: MantraRole;
  profilo: string; // TOP / TITOLARE / SCOMMESSA / SEMITOP / LOW / BOMBER / VALUE / JOLLY...
  targetBudget: number;
  regola: string;
  protectPriority: number; // section 22: lower = protect first, higher = cut first
}

export interface DatasetMeta {
  importedAt: string;
  sourceFileName: string;
  freshnessDate: string; // "28/08/2026" style, from Fonti & Metodo
  marketCloseDate: string;
  playerCount: number;
}

/** Everything permanent, produced once at import time. */
export interface PlayerDatabase {
  meta: DatasetMeta;
  players: Player[];
  graduatorie: GraduatoriaEntry[];
  coppie: CoppiaEntry[];
  gioielli: GioielloEntry[];
  strategyConfig: StrategyConfig;
}

// ============================================================================
// AUCTION SESSION — everything tied to one specific auction (section 72-87)
// ============================================================================

export type AuctionStatus = "SETUP" | "LIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";

export type PlayerAuctionStatus =
  | "AVAILABLE" | "NOMINATED" | "IN_BID" | "WON_BY_ME" | "WON_BY_OPPONENT"
  | "PASSED" | "UNSOLD" | "UNAVAILABLE";

export interface ManagerState {
  id: string;
  name: string;
  isMe: boolean;
  budgetInitial: number;
  budgetResidual: number;
  slotsTotal: number;
  slotsFilled: number;
  players: ManagerPlayer[];
  style: OpponentStyleGuess[];
}

export interface ManagerPlayer {
  playerId: string;
  paidPrice: number;
  acquiredAt: string;
}

export interface OpponentStyleGuess {
  label: string; // "aggressivo" | "prudente" | "value hunter" | ...
  confidence: number; // 0-1, probabilistic inference, never a fact
}

export interface AuctionPlayerState {
  playerId: string;
  status: PlayerAuctionStatus;
  ownerManagerId: string | null;
  paidPrice: number | null;
  currentBid: number | null;
  nominatedAt: string | null;
  notes: string | null;
  liveRank: number | null; // vs baseline graduatoria rank
}

export interface RosterSlot {
  slotKey: string;
  famiglia: Famiglia433;
  role: MantraRole;
  profilo: string;
  targetBudgetInitial: number;
  targetBudgetDynamic: number;
  playerId: string | null;
  protectPriority: number;
}

export interface StrategyState {
  overspendTotal: number;
  savingTotal: number;
  slotAdjustments: Record<string, number>; // slotKey -> delta applied by reallocation engine
  reallocationLog: ReallocationEvent[];
}

export interface ReallocationEvent {
  id: string;
  timestamp: string;
  triggerSlotKey: string;
  triggerPlayerId: string;
  extra: number; // positive = overspend, negative = saving reinvested
  cuts: { slotKey: string; delta: number }[];
  note: string;
}

export interface MarketFamilyStats {
  famiglia: Famiglia433;
  observations: number;
  medianMarketRatio: number; // observed paid / prezzoAtteso baseline
  confidence: number;
  adjustedMarketIndex: number;
}

export interface MarketState {
  perFamiglia: Partial<Record<Famiglia433, MarketFamilyStats>>;
  scarcity: Partial<Record<Famiglia433, ScarcityInfo>>;
}

export interface ScarcityInfo {
  famiglia: Famiglia433;
  qualitaResidua: number;
  slotResiduiStimati: number;
  scarcityIndex: number;
  level: "bassa" | "media" | "alta" | "critica";
}

export type AuctionEventType =
  | "PLAYER_NOMINATED" | "BID_UPDATED" | "PLAYER_WON_BY_ME" | "PLAYER_SOLD_TO_OPPONENT"
  | "PLAYER_UNSOLD" | "PLAYER_PASSED" | "MANUAL_CORRECTION" | "UNDO"
  | "SESSION_CREATED" | "SESSION_RESET"
  | "STRATEGY_CHANGED" | "STYLE_CHANGED" | "FORMATION_CHANGED";

export interface AuctionEvent {
  id: string;
  seq: number;
  timestamp: string;
  type: AuctionEventType;
  playerId: string | null;
  price: number | null;
  managerId: string | null;
  stateBefore: unknown;
  stateAfter: unknown;
  payload?: Record<string, unknown>;
}

export interface AuctionSettings {
  partecipanti: number;
  crediti: number;
  giocatoriMovimento: number;
  portieri: number;
  /** Section 1: the tactical formation the roster is primarily built around. */
  primaryFormation: FormationId;
  /** Section 7: where capital concentrates. */
  strategyProfile: StrategyId;
  /** Section 9: how aggressively DynamicMax is pushed. */
  auctionStyle: AuctionStyleId;
}

export interface AuctionSession {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: AuctionStatus;
  settings: AuctionSettings;
  managers: ManagerState[];
  myManagerId: string;
  playerStates: Record<string, AuctionPlayerState>;
  rosterSlots: RosterSlot[];
  strategyState: StrategyState;
  marketState: MarketState;
  eventLog: AuctionEvent[];
  nominationHistory: string[]; // playerIds already nominated, in order
  hiddenGems: string[]; // gem playerIds deliberately not yet nominated
  /** Section 5: live-computed compatibility of the roster-so-far with other formations. */
  secondaryFormationCompatibility: { formationId: FormationId; pct: number }[];
}

// ============================================================================
// Decision engine outputs
// ============================================================================

export type BidRecommendationAction = "ATTACCA" | "RILANCIA" | "COMPRA" | "MOLLA";

export interface BidRecommendation {
  action: BidRecommendationAction;
  headline: string;
  player: { id: string; nome: string; squadra: string; ruoloMantra: string };
  currentBid: number;
  prezzoObiettivo: number;
  offertaMaxBase: number;
  dynamicMax: number;
  /** Section 19/20: explicit, financed-only override ceiling above dynamicMax. */
  aggressiveMax: number;
  aggressiveMaxNote: string | null;
  strategicFitScore: number;
  budgetResiduo: number;
  slot: string | null;
  scarcity: ScarcityInfo | null;
  reasons: string[];
  alternatives: AlternativeSuggestion[];
  /** Player Intelligence section 28/35 — null when nothing is known about this player yet. */
  intelligence: BidRecommendationIntelligence | null;
}

export interface BidRecommendationIntelligence {
  lineupCategory: string;
  starterProbability: number;
  battleId: string | null;
  penaltyRank: 1 | 2 | 3 | null;
  goalThreatPercentile: number | null;
  goalThreatTier: string | null;
  goalThreatConfidence: string;
  bonusPotential: number;
  setPieceValueScore: number;
}

export interface AlternativeSuggestion {
  playerId: string;
  nome: string;
  squadra: string;
  score: number;
  prezzoObiettivo: number;
  offertaMax: number;
  rischio: string;
  note: string;
}

export interface WhatIfResult {
  playerId: string;
  hypotheticalPrice: number;
  feasible: boolean;
  newBudgetResiduo: number;
  requiredCuts: { slotKey: string; from: number; to: number }[];
  risks: string[];
  summary: string;
}
