import type { AuctionSession, ManualImportPayload, ManualOverride, PlayerDatabase } from "@fanta/shared";

export interface SessionSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Player Intelligence section 45/46: raw inputs the derived store is rebuilt from on every read — never the derived scores themselves. */
export interface IntelligenceRawData {
  importPayload: ManualImportPayload | null;
  overrides: Record<string, ManualOverride>;
}

/**
 * Storage backend contract. Two implementations exist: SQLite (default,
 * local-first — used when no DATABASE_URL is set) and Postgres (used in
 * cloud deploys without a persistent disk, e.g. Render free tier + a
 * hosted Postgres like Supabase). The rest of the app only depends on
 * this interface, never on the concrete backend.
 */
export interface Store {
  loadPlayerDatabase(): Promise<PlayerDatabase | null>;
  savePlayerDatabase(db: PlayerDatabase): Promise<void>;

  listSessions(): Promise<SessionSummary[]>;
  getSession(id: string): Promise<AuctionSession | null>;
  /** Atomic upsert (section 82): a session is either fully written or not at all. */
  saveSession(session: AuctionSession): Promise<void>;
  archiveSession(id: string): Promise<void>;
  deleteSession(id: string): Promise<void>;

  loadIntelligenceRaw(): Promise<IntelligenceRawData | null>;
  saveIntelligenceRaw(data: IntelligenceRawData): Promise<void>;
}
