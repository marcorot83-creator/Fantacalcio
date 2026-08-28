import type { Player, PlayerDatabase } from "@fanta/shared";

/**
 * Section 53: merge a freshly imported PlayerDatabase into the existing one
 * without breaking stable IDs already referenced by AuctionSessions. A player
 * is matched to its previous identity by normalized name (handling a squadra
 * change = transfer), falling back to the original Excel row id for true
 * homonyms; anything unmatched is treated as a brand-new player. Pure
 * function, no I/O — shared by every storage backend.
 */
export function mergePlayerDatabase(oldDb: PlayerDatabase | null, freshDb: PlayerDatabase): PlayerDatabase {
  if (!oldDb) return freshDb;

  const oldByName = new Map<string, Player[]>();
  for (const p of oldDb.players) {
    const list = oldByName.get(p.nomeNormalizzato) ?? [];
    list.push(p);
    oldByName.set(p.nomeNormalizzato, list);
  }

  const idRemap = new Map<string, string>(); // freshId -> stableId

  for (const p of freshDb.players) {
    const candidates = oldByName.get(p.nomeNormalizzato) ?? [];
    if (candidates.length === 0) continue;
    if (candidates.length === 1) {
      idRemap.set(p.id, candidates[0].id);
      continue;
    }
    const bySquadra = candidates.find((c) => c.squadra.toLowerCase() === p.squadra.toLowerCase());
    if (bySquadra) {
      idRemap.set(p.id, bySquadra.id);
      continue;
    }
    const byRow = candidates.find((c) => c.excelRowId != null && c.excelRowId === p.excelRowId);
    if (byRow) {
      idRemap.set(p.id, byRow.id);
    }
    // otherwise: ambiguous homonym, keep the freshly generated id untouched.
  }

  const remappedPlayers = freshDb.players.map((p) => ({ ...p, id: idRemap.get(p.id) ?? p.id }));
  const remapId = (id: string | null) => (id ? idRemap.get(id) ?? id : id);

  return {
    ...freshDb,
    players: remappedPlayers,
    graduatorie: freshDb.graduatorie.map((g) => ({ ...g, playerId: remapId(g.playerId) })),
    coppie: freshDb.coppie.map((c) => ({
      ...c,
      titolarePlayerId: remapId(c.titolarePlayerId),
      coperturaPlayerId: remapId(c.coperturaPlayerId),
    })),
    gioielli: freshDb.gioielli.map((g) => ({ ...g, playerId: remapId(g.playerId) })),
  };
}
