import type { SetPieceIntelligence, SetPieceRole } from "./types";
import { computeStaleness } from "./freshness";

function roleScore(role: SetPieceRole): number {
  switch (role) {
    case "PRIMARY":
      return 100;
    case "SECONDARY":
      return 55;
    case "OCCASIONAL":
      return 25;
    case "NONE":
      return 0;
  }
}

/** Section 15/16: direct free kicks weigh most (most valuable set piece), corners least but still count — assist/bonus potential, not just goals. */
export function buildSetPieceIntelligence(params: {
  corner: SetPieceRole;
  direct: SetPieceRole;
  indirect: SetPieceRole;
  updatedAt: string | null;
}): SetPieceIntelligence {
  const setPieceValueScore = Math.round(roleScore(params.corner) * 0.3 + roleScore(params.direct) * 0.45 + roleScore(params.indirect) * 0.25);
  return {
    cornerRole: params.corner,
    directFreeKickRole: params.direct,
    indirectFreeKickRole: params.indirect,
    setPieceValueScore,
    staleness: computeStaleness(params.updatedAt),
  };
}

export const NO_SET_PIECES: SetPieceIntelligence = {
  cornerRole: "NONE",
  directFreeKickRole: "NONE",
  indirectFreeKickRole: "NONE",
  setPieceValueScore: 0,
  staleness: "UNKNOWN",
};
