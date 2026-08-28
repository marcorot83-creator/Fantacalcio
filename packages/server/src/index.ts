import express from "express";
import cors from "cors";
import path from "path";
import type { PlayerDatabase } from "@fanta/shared";
import { importExcelFile } from "./importExcel";
import { loadPlayerDatabase, mergePlayerDatabase, savePlayerDatabase } from "./store";
import { playersRouter } from "./routes/players";
import { sessionsRouter } from "./routes/sessions";
import { importRouter } from "./routes/importRoute";

let playerDb: PlayerDatabase;

function bootstrapDatabase(): PlayerDatabase {
  const existing = loadPlayerDatabase();
  if (existing) return existing;
  const seedPath = path.join(__dirname, "..", "seed", "strumento_asta_mantra_2026_27.xlsx");
  const fresh = importExcelFile(seedPath);
  savePlayerDatabase(fresh);
  return fresh;
}

playerDb = bootstrapDatabase();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", playersRouter(() => playerDb));
app.use("/api", sessionsRouter(() => playerDb));
app.use(
  "/api",
  importRouter((updated) => {
    playerDb = updated;
  })
);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message ?? "internal error" });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`Fantacalcio auction engine API listening on :${PORT}`);
  console.log(`Player database: ${playerDb.players.length} players, freshness ${playerDb.meta.freshnessDate}`);
});
