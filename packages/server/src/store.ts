import { db } from "./db";
import type { AuctionSession, Player, PlayerDatabase } from "@fanta/shared";

// ---------------------------------------------------------------------------
// Player & Strategy Database (permanent, section 72)
// ---------------------------------------------------------------------------

export function loadPlayerDatabase(): PlayerDatabase | null {
  const row = db.prepare("SELECT data_json FROM player_database WHERE id = 1").get() as
    | { data_json: string }
    | undefined;
  return row ? (JSON.parse(row.data_json) as PlayerDatabase) : null;
}

export function savePlayerDatabase(pdb: PlayerDatabase): void {
  db.prepare(
    `INSERT INTO player_database (id, data_json, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`
  ).run(JSON.stringify(pdb), new Date().toISOString());
}

/**
 * Section 53: merge a freshly imported PlayerDatabase into the existing one
 * without breaking stable IDs already referenced by AuctionSessions. A player
 * is matched to its previous identity by normalized name (handling a squadra
 * change = transfer), falling back to the original Excel row id for true
 * homonyms; anything unmatched is treated as a brand-new player.
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

// ---------------------------------------------------------------------------
// Auction Sessions (section 72/76)
// ---------------------------------------------------------------------------

export interface SessionSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function listSessions(): SessionSummary[] {
  const rows = db
    .prepare("SELECT id, name, status, created_at as createdAt, updated_at as updatedAt FROM auction_sessions ORDER BY created_at DESC")
    .all() as SessionSummary[];
  return rows;
}

export function getSession(id: string): AuctionSession | null {
  const row = db.prepare("SELECT session_json FROM auction_sessions WHERE id = ?").get(id) as
    | { session_json: string }
    | undefined;
  return row ? (JSON.parse(row.session_json) as AuctionSession) : null;
}

/** Atomic upsert (section 82): a session is either fully written or not at all. */
export const saveSession = db.transaction((session: AuctionSession) => {
  db.prepare(
    `INSERT INTO auction_sessions (id, name, status, created_at, updated_at, session_json)
     VALUES (@id, @name, @status, @createdAt, @updatedAt, @json)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, status = excluded.status, updated_at = excluded.updated_at, session_json = excluded.session_json`
  ).run({
    id: session.id,
    name: session.name,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    json: JSON.stringify(session),
  });
});

export function archiveSession(id: string): void {
  const session = getSession(id);
  if (!session) throw new Error("Session not found");
  session.status = "ARCHIVED";
  session.updatedAt = new Date().toISOString();
  saveSession(session);
}

export function deleteSession(id: string): void {
  db.prepare("DELETE FROM auction_sessions WHERE id = ?").run(id);
}
