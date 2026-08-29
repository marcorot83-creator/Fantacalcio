import type { Player } from "../types";
import { playerStableId, fuzzyFind } from "../util";

export interface ExternalPlayerRef {
  nome: string;
  squadra?: string;
}

export interface ResolvedPlayer {
  playerId: string;
  confidence: number; // 0-1
}

/**
 * Section 44: names differ across sources ("L. Martinez" / "Lautaro
 * Martinez" / "Lautaro"). Reuses the same normalizedName+team scheme the
 * Player database itself is keyed by (playerStableId) instead of building a
 * parallel identity system — an exact stable-id hit is tried first, then a
 * fuzzy match narrowed to the same team when one is given.
 */
export function resolvePlayerId(players: Player[], ref: ExternalPlayerRef): ResolvedPlayer | null {
  if (ref.squadra) {
    const exactId = playerStableId(ref.nome, ref.squadra);
    const exact = players.find((p) => p.id === exactId);
    if (exact) return { playerId: exact.id, confidence: 1 };
  }
  const pool = ref.squadra ? players.filter((p) => p.squadra.toLowerCase() === ref.squadra!.toLowerCase()) : players;
  const searchPool = pool.length > 0 ? pool : players;
  const matches = fuzzyFind(ref.nome, searchPool, (p) => p.nome);
  const best = matches[0];
  if (!best || best.score < 0.6) return null;
  return { playerId: best.item.id, confidence: best.score };
}
