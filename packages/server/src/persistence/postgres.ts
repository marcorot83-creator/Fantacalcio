import { Pool } from "pg";
import type { AuctionSession, PlayerDatabase } from "@fanta/shared";
import type { SessionSummary, Store } from "./types";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Hosted Postgres providers (Supabase, Render, etc.) sit behind a pooler
  // with a cert node-postgres won't validate by default; skip validation.
  // Set PGSSL=disable for a plain local Postgres (e.g. during development).
  ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
});

const ready = pool.query(`
CREATE TABLE IF NOT EXISTS player_database (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auction_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  session_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON auction_sessions(status);
`);

export const postgresStore: Store = {
  async loadPlayerDatabase() {
    await ready;
    const { rows } = await pool.query<{ data_json: string }>("SELECT data_json FROM player_database WHERE id = 1");
    return rows[0] ? (JSON.parse(rows[0].data_json) as PlayerDatabase) : null;
  },

  async savePlayerDatabase(pdb: PlayerDatabase) {
    await ready;
    await pool.query(
      `INSERT INTO player_database (id, data_json, updated_at) VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = EXCLUDED.updated_at`,
      [JSON.stringify(pdb), new Date().toISOString()]
    );
  },

  async listSessions() {
    await ready;
    const { rows } = await pool.query<SessionSummary>(
      `SELECT id, name, status, created_at as "createdAt", updated_at as "updatedAt"
       FROM auction_sessions ORDER BY created_at DESC`
    );
    return rows;
  },

  async getSession(id: string) {
    await ready;
    const { rows } = await pool.query<{ session_json: string }>(
      "SELECT session_json FROM auction_sessions WHERE id = $1",
      [id]
    );
    return rows[0] ? (JSON.parse(rows[0].session_json) as AuctionSession) : null;
  },

  async saveSession(session: AuctionSession) {
    await ready;
    // Single-statement upsert: atomic (section 82) without needing an explicit transaction.
    await pool.query(
      `INSERT INTO auction_sessions (id, name, status, created_at, updated_at, session_json)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at, session_json = EXCLUDED.session_json`,
      [session.id, session.name, session.status, session.createdAt, session.updatedAt, JSON.stringify(session)]
    );
  },

  async archiveSession(id: string) {
    const session = await this.getSession(id);
    if (!session) throw new Error("Session not found");
    session.status = "ARCHIVED";
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
  },

  async deleteSession(id: string) {
    await ready;
    await pool.query("DELETE FROM auction_sessions WHERE id = $1", [id]);
  },
};
