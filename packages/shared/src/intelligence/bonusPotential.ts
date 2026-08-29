import type { BonusPotential, GoalThreatIntelligence, PenaltyIntelligence, SetPieceIntelligence } from "./types";

function confidenceWeightFor(confidence: GoalThreatIntelligence["confidence"]): number {
  switch (confidence) {
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 0.85;
    case "LOW":
      return 0.6;
    case "NONE":
      return 0.4;
  }
}

/**
 * Section 27/28: NOT a replacement for Indice Fanta — describes upside from
 * bonus routes specifically (goal threat + rigori + piazzati), so two
 * players with similar overall value can be told apart by how much of that
 * value could still surprise on the upside.
 */
export function computeBonusPotential(params: {
  goalThreat: GoalThreatIntelligence;
  penalty: PenaltyIntelligence;
  setPieces: SetPieceIntelligence;
  starterProbability: number;
}): BonusPotential {
  const { goalThreat, penalty, setPieces, starterProbability } = params;
  const confidenceWeight = confidenceWeightFor(goalThreat.confidence);

  const goalTerm = goalThreat.percentileWithinRole * confidenceWeight;
  const score = Math.round(Math.min(100, goalTerm * 0.5 + penalty.penaltyValueScore * 0.3 + setPieces.setPieceValueScore * 0.2));

  // Section 50: reliable = already backed by a starting role AND confidence;
  // upside = the same signal but not (yet) backed by minutes/certainty —
  // decays slower on low confidence, since that's exactly what upside means.
  const reliabilityGate = (starterProbability / 100) * confidenceWeight;
  const reliable = Math.round(score * reliabilityGate);
  const upside = Math.round(score * (1 - reliabilityGate * 0.4));

  return { score, reliable, upside };
}
