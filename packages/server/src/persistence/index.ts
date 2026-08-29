import type { Store } from "./types";

// Postgres (e.g. a free Supabase project) when DATABASE_URL is set — needed
// for cloud hosts without a persistent disk (Render's free tier). Falls back
// to local-first SQLite otherwise, so `npm run dev` needs zero setup.
export const store: Store = process.env.DATABASE_URL
  ? (require("./postgres").postgresStore as Store)
  : (require("./sqlite").sqliteStore as Store);

export type { SessionSummary, Store, IntelligenceRawData } from "./types";
export { mergePlayerDatabase } from "./merge";
