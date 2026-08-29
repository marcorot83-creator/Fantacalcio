import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import type { PlayerDatabase, PlayerIntelligenceStore } from "@fanta/shared";
import { EMPTY_INTELLIGENCE_STORE } from "@fanta/shared";
import { importExcelFile } from "./importExcel";
import { store } from "./persistence";
import { playersRouter } from "./routes/players";
import { sessionsRouter } from "./routes/sessions";
import { importRouter } from "./routes/importRoute";
import { intelligenceRouter, loadAndBuildIntelligence } from "./routes/intelligence";

async function bootstrapDatabase(): Promise<PlayerDatabase> {
  const existing = await store.loadPlayerDatabase();
  if (existing) return existing;
  const seedPath = path.join(__dirname, "..", "seed", "strumento_asta_mantra_2026_27.xlsx");
  const fresh = importExcelFile(seedPath);
  await store.savePlayerDatabase(fresh);
  return fresh;
}

async function main() {
  let playerDb = await bootstrapDatabase();
  let intelligence: PlayerIntelligenceStore = EMPTY_INTELLIGENCE_STORE;
  try {
    intelligence = await loadAndBuildIntelligence(playerDb);
  } catch (err) {
    console.error("Player Intelligence: failed to build from persisted data, starting empty.", err);
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/api", playersRouter(() => playerDb));
  app.use("/api", sessionsRouter(() => playerDb, () => intelligence));
  app.use(
    "/api",
    importRouter((updated) => {
      playerDb = updated;
    })
  );
  app.use(
    "/api",
    intelligenceRouter(
      () => playerDb,
      () => intelligence,
      (next) => {
        intelligence = next;
      },
      () => loadAndBuildIntelligence(playerDb)
    )
  );

  // Single-service deploy: serve the built frontend (apps/web/dist) from the
  // same Express process when it exists, so hosting needs only one web
  // service (e.g. Render free tier) instead of a separate static site.
  const webDist = path.join(__dirname, "..", "..", "..", "apps", "web", "dist");
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(err.status ?? 500).json({ error: err.message ?? "internal error" });
  });

  const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
  app.listen(PORT, () => {
    console.log(`Fantacalcio auction engine API listening on :${PORT}`);
    console.log(`Storage backend: ${process.env.DATABASE_URL ? "Postgres" : "SQLite (local)"}`);
    console.log(`Player database: ${playerDb.players.length} players, freshness ${playerDb.meta.freshnessDate}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
