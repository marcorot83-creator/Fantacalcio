import type { PlayerDatabase } from "../types";
import { eligibleMantraRoles } from "../mantra";
import type {
  EditorialGoalThreatSignal, GoalThreatIntelligence, IntelligenceSource, ManualOverride,
  PenaltyHierarchy, PenaltyRank, PlayerIntelligence, PlayerIntelligenceStore,
} from "./types";
import { EMPTY_INTELLIGENCE_STORE } from "./types";
import { baseLineupIntelligence, categorizeStarterProbability } from "./lineup";
import { derivePairingsFromCoppie, deriveLineupBattles } from "./pairing";
import { buildPenaltyIntelligence, estimateTeamAttackFactor } from "./penalties";
import { buildSetPieceIntelligence } from "./setPieces";
import { computeGoalThreat, computePercentilesWithinRole, tierForPercentile, type RoleScoreEntry } from "./goalThreat";
import { computeBonusPotential } from "./bonusPotential";
import { computeStaleness } from "./freshness";
import { resolvePlayerId } from "./mapping";
import type { ManualImportPayload, ManualLineupImportRow, ManualStatsImportRow } from "./providers";

export interface ImportedIntelligenceData {
  lineupByPlayerId: Record<string, ManualLineupImportRow>;
  statsByPlayerId: Record<string, ManualStatsImportRow[]>; // most-recent season first
  importedAt: string | null;
  label: string | null;
}

export const EMPTY_IMPORTED_DATA: ImportedIntelligenceData = { lineupByPlayerId: {}, statsByPlayerId: {}, importedAt: null, label: null };

export type ManualOverrideMap = Record<string, ManualOverride>;

export interface ImportResult {
  data: ImportedIntelligenceData;
  resolved: number;
  unresolved: { nome: string; squadra?: string }[];
}

/** Section 44/47: resolves every import row to a real Player before anything downstream uses it. */
export function applyManualImport(db: PlayerDatabase, payload: ManualImportPayload): ImportResult {
  const importedAt = payload.importedAt ?? new Date().toISOString();
  const lineupByPlayerId: Record<string, ManualLineupImportRow> = {};
  const statsByPlayerId: Record<string, ManualStatsImportRow[]> = {};
  const unresolved: { nome: string; squadra?: string }[] = [];
  let resolved = 0;

  for (const row of payload.lineup ?? []) {
    const r = resolvePlayerId(db.players, { nome: row.nome, squadra: row.squadra });
    if (!r) {
      unresolved.push({ nome: row.nome, squadra: row.squadra });
      continue;
    }
    lineupByPlayerId[r.playerId] = row;
    resolved++;
  }
  for (const row of payload.stats ?? []) {
    const r = resolvePlayerId(db.players, { nome: row.nome, squadra: row.squadra });
    if (!r) {
      unresolved.push({ nome: row.nome, squadra: row.squadra });
      continue;
    }
    if (!statsByPlayerId[r.playerId]) statsByPlayerId[r.playerId] = [];
    statsByPlayerId[r.playerId].push(row);
    resolved++;
  }
  for (const list of Object.values(statsByPlayerId)) list.sort((a, b) => b.season.localeCompare(a.season));

  return { data: { lineupByPlayerId, statsByPlayerId, importedAt, label: payload.label ?? null }, resolved, unresolved };
}

function buildPenaltyHierarchies(db: PlayerDatabase, players: Record<string, PlayerIntelligence>): PenaltyHierarchy[] {
  const byTeam = new Map<string, { playerId: string; rank: PenaltyRank; confidence: number }[]>();
  for (const p of db.players) {
    const intel = players[p.id];
    if (!intel || intel.penalty.rank == null) continue;
    if (!byTeam.has(p.squadra)) byTeam.set(p.squadra, []);
    byTeam.get(p.squadra)!.push({ playerId: p.id, rank: intel.penalty.rank, confidence: intel.penalty.confidence });
  }
  const result: PenaltyHierarchy[] = [];
  for (const [team, list] of byTeam) {
    list.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    result.push({ team, players: list, updatedAt: new Date().toISOString(), sources: [] });
  }
  return result;
}

/**
 * Section 3/64: the orchestrator. Combines the Excel-derived baseline
 * (lineup category, pairings/battles from Coppie & Gioielli — real data,
 * always present) with whatever has actually been imported/overridden
 * (rigoristi, piazzati, goal-threat stats — empty until the user supplies
 * them, per section 4: no fabricated data). Manual overrides always win
 * (section 45). Nothing here touches AuctionSession/prices/event log.
 */
export function buildPlayerIntelligenceStore(
  db: PlayerDatabase,
  imported: ImportedIntelligenceData = EMPTY_IMPORTED_DATA,
  overrides: ManualOverrideMap = {}
): PlayerIntelligenceStore {
  const pairings = derivePairingsFromCoppie(db);
  const battles = deriveLineupBattles(db, pairings);

  const battleByPlayer = new Map<string, string>();
  for (const b of battles) for (const pl of b.players) battleByPlayer.set(pl.playerId, b.id);

  const directCompetitorByPlayer = new Map<string, string>();
  for (const p of pairings) {
    if (p.type === "DIRECT_BACKUP" || p.type === "BALLOT_PAIR") {
      directCompetitorByPlayer.set(p.primaryPlayerId, p.secondaryPlayerId);
      directCompetitorByPlayer.set(p.secondaryPlayerId, p.primaryPlayerId);
    }
  }

  const importSource: IntelligenceSource | null = imported.importedAt
    ? { kind: "manual_import", label: imported.label || "Import manuale", fetchedAt: imported.importedAt }
    : null;

  const editorialSignalsByPlayer = new Map<string, EditorialGoalThreatSignal[]>();
  const rawGoalThreatByPlayer = new Map<string, ReturnType<typeof computeGoalThreat>>();
  for (const p of db.players) {
    const lineupRow = imported.lineupByPlayerId[p.id];
    const editorial: EditorialGoalThreatSignal[] = [];
    if (lineupRow?.editorialGoalThreatNote && importSource) {
      editorial.push({ text: lineupRow.editorialGoalThreatNote, weight: lineupRow.editorialGoalThreatWeight ?? 0.5, source: importSource });
    }
    editorialSignalsByPlayer.set(p.id, editorial);
    rawGoalThreatByPlayer.set(p.id, computeGoalThreat({ seasons: imported.statsByPlayerId[p.id] ?? [], editorialSignals: editorial }));
  }

  const roleEntries: RoleScoreEntry[] = db.players.map((p) => {
    const roles = eligibleMantraRoles(p.ruoloMantra);
    const raw = rawGoalThreatByPlayer.get(p.id)!;
    return { playerId: p.id, role: roles[0] ?? "Por", rawScore: raw.rawScore, hasData: !raw.editorialOnly };
  });
  const percentileByPlayer = computePercentilesWithinRole(roleEntries);

  const players: Record<string, PlayerIntelligence> = {};
  for (const p of db.players) {
    const override = overrides[p.id] ?? null;
    const importRow = imported.lineupByPlayerId[p.id];

    const lineup = baseLineupIntelligence(p, db.meta.importedAt);
    if (override?.starterProbability != null) {
      lineup.starterProbability = override.starterProbability;
      lineup.category = categorizeStarterProbability(override.starterProbability);
    }
    lineup.battleId = battleByPlayer.get(p.id) ?? null;
    lineup.directCompetitorId = directCompetitorByPlayer.get(p.id) ?? null;
    // A real derived battle is stronger evidence than the raw titolarita
    // split alone (which may still read as a comfortable starter) — same
    // promotion rule as the rischio-flag check in baseLineupIntelligence,
    // but keyed off the actual structured ballottaggio relationship.
    if (lineup.battleId && lineup.category !== "BACKUP" && lineup.category !== "FRINGE") {
      lineup.category = "BALLOT";
    }

    const penaltyRank: PenaltyRank = override && override.penaltyRank !== undefined ? override.penaltyRank : importRow?.penaltyRank ?? null;
    const penaltyConfidence = override && override.penaltyRank !== undefined ? 1 : importRow?.penaltyRank !== undefined ? 0.7 : 0;
    const penalty = buildPenaltyIntelligence({
      rank: penaltyRank,
      confidence: penaltyConfidence,
      starterProbability: lineup.starterProbability,
      teamAttackFactor: estimateTeamAttackFactor(db, p.squadra),
      updatedAt: override?.setAt ?? (importRow ? imported.importedAt : null),
    });

    const setPieces = buildSetPieceIntelligence({
      corner: override?.cornerRole ?? importRow?.cornerRole ?? "NONE",
      direct: override?.directFreeKickRole ?? importRow?.directFreeKickRole ?? "NONE",
      indirect: override?.indirectFreeKickRole ?? importRow?.indirectFreeKickRole ?? "NONE",
      updatedAt: override?.setAt ?? (importRow ? imported.importedAt : null),
    });

    const raw = rawGoalThreatByPlayer.get(p.id)!;
    const percentile = percentileByPlayer.get(p.id) ?? 50;
    const hasStatsOrEditorial = (imported.statsByPlayerId[p.id]?.length ?? 0) > 0 || (editorialSignalsByPlayer.get(p.id)?.length ?? 0) > 0;
    const goalThreat: GoalThreatIntelligence = {
      index: raw.rawScore,
      percentileWithinRole: percentile,
      tier: tierForPercentile(percentile),
      confidence: raw.confidence,
      sampleMinutes: raw.sampleMinutes,
      editorialSignals: editorialSignalsByPlayer.get(p.id) ?? [],
      staleness: computeStaleness(hasStatsOrEditorial ? imported.importedAt : null),
    };

    const bonusPotential = computeBonusPotential({ goalThreat, penalty, setPieces, starterProbability: lineup.starterProbability });

    const sources: IntelligenceSource[] = [{ kind: "excel", label: "Lista calciatori / Coppie & Gioielli", fetchedAt: db.meta.importedAt }];
    const hasAnyImport = !!importRow || (imported.statsByPlayerId[p.id]?.length ?? 0) > 0;
    if (hasAnyImport && importSource) sources.push(importSource);

    players[p.id] = {
      playerId: p.id,
      lineup,
      pairing: { pairings: pairings.filter((pp) => pp.primaryPlayerId === p.id || pp.secondaryPlayerId === p.id) },
      penalty,
      setPieces,
      goalThreat,
      bonusPotential,
      manualOverride: override,
      updatedAt: override?.setAt ?? (hasAnyImport ? imported.importedAt : null) ?? db.meta.importedAt,
      confidence: override ? 1 : hasAnyImport ? 0.7 : 0.5,
      sources,
    };
  }

  return {
    players,
    battles,
    pairings,
    penaltyHierarchies: buildPenaltyHierarchies(db, players),
    updatedAt: imported.importedAt ?? (Object.keys(overrides).length > 0 ? new Date().toISOString() : null),
  };
}

export { EMPTY_INTELLIGENCE_STORE };
