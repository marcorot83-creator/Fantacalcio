import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { AuctionSession, PlayerDatabase } from "@fanta/shared";
import type { IntelligenceRawData, SessionSummary, Store } from "./types";

const DATA_DIR = path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "fantacalcio.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
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

CREATE TABLE IF NOT EXISTS player_intelligence_raw (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const saveSessionTxn = db.transaction((session: AuctionSession) => {
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

export const sqliteStore: Store = {
  async loadPlayerDatabase() {
    const row = db.prepare("SELECT data_json FROM player_database WHERE id = 1").get() as
      | { data_json: string }
      | undefined;
    return row ? (JSON.parse(row.data_json) as PlayerDatabase) : null;
  },

  async savePlayerDatabase(pdb: PlayerDatabase) {
    db.prepare(
      `INSERT INTO player_database (id, data_json, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`
    ).run(JSON.stringify(pdb), new Date().toISOString());
  },

  async listSessions() {
    return db
      .prepare("SELECT id, name, status, created_at as createdAt, updated_at as updatedAt FROM auction_sessions ORDER BY created_at DESC")
      .all() as SessionSummary[];
  },

  async getSession(id: string) {
    const row = db.prepare("SELECT session_json FROM auction_sessions WHERE id = ?").get(id) as
      | { session_json: string }
      | undefined;
    return row ? (JSON.parse(row.session_json) as AuctionSession) : null;
  },

  async saveSession(session: AuctionSession) {
    saveSessionTxn(session);
  },

  async archiveSession(id: string) {
    const session = await this.getSession(id);
    if (!session) throw new Error("Session not found");
    session.status = "ARCHIVED";
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
  },

  async deleteSession(id: string) {
    db.prepare("DELETE FROM auction_sessions WHERE id = ?").run(id);
  },

  async loadIntelligenceRaw() {
    const row = db.prepare("SELECT data_json FROM player_intelligence_raw WHERE id = 1").get() as
      | { data_json: string }
      | undefined;
    return row ? (JSON.parse(row.data_json) as IntelligenceRawData) : null;
  },

  async saveIntelligenceRaw(data: IntelligenceRawData) {
    db.prepare(
      `INSERT INTO player_intelligence_raw (id, data_json, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`
    ).run(JSON.stringify(data), new Date().toISOString());
  },
};
