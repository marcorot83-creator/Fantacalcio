import type { MantraRole } from "../mantra";
import type { EditorialGoalThreatSignal, GoalThreatConfidence, GoalThreatStatSeason, GoalThreatTier } from "./types";

const SEASON_WEIGHTS = [0.5, 0.35, 0.15]; // section 23: current/previous/previous-2

// Rough reference ceilings used only to squash raw per-90 rates onto a 0-100
// scale before weighting. Deliberately generous (tuned so an elite
// nonPenaltyXG/90 ~0.6 lands near the top rather than clipping) — these are
// approximations, not a claim of precision the source stats don't carry.
const REF = { xg90: 0.6, shots90: 3.5, shotsBox90: 2.2, goals90: 0.5, setPieceXg90: 0.15 };

function per90(value: number | undefined, minutes: number): number {
  if (!value || minutes <= 0) return 0;
  return (value / minutes) * 90;
}

function squash(value: number, ref: number): number {
  return Math.max(0, Math.min(100, (value / ref) * 100));
}

export interface GoalThreatRawResult {
  rawScore: number; // 0-100, NOT yet role-normalized
  sampleMinutes: number; // current-season minutes actually observed
  confidence: GoalThreatConfidence;
  editorialOnly: boolean;
}

/**
 * Section 18-25: combines gol/xG/tiri/storico/editoriale instead of raw
 * goals, blends up to 3 seasons with recency weighting, and gates confidence
 * on sample size so a hot streak in a handful of minutes can't produce an
 * extreme, high-confidence index (section 24/48/59).
 */
export function computeGoalThreat(params: {
  seasons: GoalThreatStatSeason[]; // most recent season first
  editorialSignals?: EditorialGoalThreatSignal[];
}): GoalThreatRawResult {
  const { seasons, editorialSignals = [] } = params;
  const withData = seasons.filter((s) => s.minutes > 0).slice(0, 3);

  let wXg = 0, wShots = 0, wShotsBox = 0, wGoals = 0, wSetPiece = 0, weightSum = 0;
  withData.forEach((s, i) => {
    const w = SEASON_WEIGHTS[i] ?? 0;
    wXg += squash(per90(s.nonPenaltyXG, s.minutes), REF.xg90) * w;
    wShots += squash(per90(s.shots, s.minutes), REF.shots90) * w;
    wShotsBox += squash(per90(s.shotsInBox, s.minutes), REF.shotsBox90) * w;
    wGoals += squash(per90(s.nonPenaltyGoals, s.minutes), REF.goals90) * w;
    wSetPiece += squash(per90(s.setPieceXG, s.minutes), REF.setPieceXg90) * w;
    weightSum += w;
  });

  const editorialScore = editorialSignals.length
    ? Math.min(100, (editorialSignals.reduce((s, e) => s + e.weight, 0) / editorialSignals.length) * 100)
    : 0;

  const hasQuantData = weightSum > 0;
  let rawScore: number;
  if (hasQuantData) {
    const norm = 1 / weightSum;
    rawScore =
      wXg * norm * 0.35 +
      wShots * norm * 0.2 +
      wShotsBox * norm * 0.15 +
      wGoals * norm * 0.1 +
      wSetPiece * norm * 0.1 +
      editorialScore * 0.1;
  } else if (editorialSignals.length) {
    // Editorial-only: a modest, capped lift above neutral — never a substitute for quant data (section 25).
    rawScore = 40 + editorialScore * 0.3;
  } else {
    rawScore = 50; // truly unknown -> neutral, never penalized
  }

  const currentSeasonMinutes = withData[0]?.minutes ?? 0;
  const totalSampleMinutes = withData.reduce((s, x) => s + x.minutes, 0);
  let confidence: GoalThreatConfidence;
  if (!hasQuantData) confidence = editorialSignals.length ? "LOW" : "NONE";
  else if (totalSampleMinutes < 270) confidence = "LOW";
  else if (currentSeasonMinutes < 450 && withData.length < 2) confidence = "LOW";
  else if (totalSampleMinutes < 1350) confidence = "MEDIUM";
  else confidence = "HIGH";

  return {
    rawScore: Math.round(Math.max(0, Math.min(100, rawScore))),
    sampleMinutes: currentSeasonMinutes,
    confidence,
    editorialOnly: !hasQuantData,
  };
}

export function tierForPercentile(pct: number): GoalThreatTier {
  if (pct >= 90) return "ECCEZIONALE";
  if (pct >= 75) return "ALTO";
  if (pct >= 55) return "BUONO";
  if (pct >= 35) return "MEDIO";
  if (pct >= 15) return "BASSO";
  return "MINIMO";
}

export interface RoleScoreEntry {
  playerId: string;
  role: MantraRole;
  rawScore: number;
  hasData: boolean;
}

/**
 * Section 20: "quanto pericoloso rispetto agli altri dello stesso ruolo",
 * never a raw cross-role comparison (Dc vs Pc). Ranked only among peers who
 * actually have data — a sea of "no data" players would otherwise dilute
 * the percentile into meaninglessness. Players with no data get a neutral
 * default (50), same principle as the raw score itself.
 */
export function computePercentilesWithinRole(entries: RoleScoreEntry[]): Map<string, number> {
  const byRole = new Map<MantraRole, number[]>();
  for (const e of entries) {
    if (!e.hasData) continue;
    if (!byRole.has(e.role)) byRole.set(e.role, []);
    byRole.get(e.role)!.push(e.rawScore);
  }
  for (const arr of byRole.values()) arr.sort((a, b) => a - b);

  const result = new Map<string, number>();
  for (const e of entries) {
    if (!e.hasData) {
      result.set(e.playerId, 50);
      continue;
    }
    const arr = byRole.get(e.role)!;
    if (arr.length <= 1) {
      result.set(e.playerId, 50);
      continue;
    }
    const below = arr.filter((v) => v < e.rawScore).length;
    result.set(e.playerId, Math.round((below / (arr.length - 1)) * 100));
  }
  return result;
}
