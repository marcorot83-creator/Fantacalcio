import { Router, type Request, type Response, type NextFunction } from "express";
import type { ManualImportPayload, ManualOverride, PlayerDatabase, PlayerIntelligenceStore } from "@fanta/shared";
import { applyManualImport, buildPlayerIntelligenceStore, EMPTY_IMPORTED_DATA } from "@fanta/shared";
import { store } from "../persistence";

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

function asyncHandler(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

/**
 * Player Intelligence sections 4/45/46/47: manual import (JSON), manual
 * override (always wins), and an explicit "refresh" that recomputes
 * derived scores from currently-persisted raw inputs — never touching
 * AuctionSession/prices/event log.
 */
export function intelligenceRouter(
  getDb: () => PlayerDatabase,
  getIntelligence: () => PlayerIntelligenceStore,
  setIntelligence: (next: PlayerIntelligenceStore) => void,
  rebuild: () => Promise<PlayerIntelligenceStore>
): Router {
  const router = Router();

  router.get("/intelligence/status", (_req, res) => {
    const intel = getIntelligence();
    res.json({
      updatedAt: intel.updatedAt,
      playersWithSignal: Object.values(intel.players).filter(
        (p) => p.goalThreat.confidence !== "NONE" || p.penalty.rank != null || p.setPieces.setPieceValueScore > 0
      ).length,
      totalPlayers: Object.keys(intel.players).length,
      battles: intel.battles.length,
      pairings: intel.pairings.length,
    });
  });

  router.post(
    "/intelligence/import",
    asyncHandler(async (req, res) => {
      const payload = req.body as ManualImportPayload;
      if (!payload || (!payload.lineup && !payload.stats)) {
        return res.status(400).json({ error: "Payload vuoto: servono almeno 'lineup' o 'stats'." });
      }
      const db = getDb();
      const { resolved, unresolved } = applyManualImport(db, payload);
      const existing = await store.loadIntelligenceRaw();
      await store.saveIntelligenceRaw({ importPayload: payload, overrides: existing?.overrides ?? {} });
      const next = await rebuild();
      setIntelligence(next);
      res.json({ resolved, unresolved, updatedAt: next.updatedAt });
    })
  );

  router.post(
    "/players/:id/intelligence/override",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const player = db.players.find((p) => p.id === req.params.id);
      if (!player) return res.status(404).json({ error: "Giocatore non trovato" });
      const body = req.body as Omit<ManualOverride, "setAt">;
      const override: ManualOverride = { ...body, setAt: new Date().toISOString() };
      const existing = (await store.loadIntelligenceRaw()) ?? { importPayload: null, overrides: {} };
      existing.overrides[player.id] = override;
      await store.saveIntelligenceRaw(existing);
      const next = await rebuild();
      setIntelligence(next);
      res.json(next.players[player.id]);
    })
  );

  router.delete(
    "/players/:id/intelligence/override",
    asyncHandler(async (req, res) => {
      const existing = (await store.loadIntelligenceRaw()) ?? { importPayload: null, overrides: {} };
      delete existing.overrides[req.params.id];
      await store.saveIntelligenceRaw(existing);
      const next = await rebuild();
      setIntelligence(next);
      res.json({ ok: true });
    })
  );

  router.post(
    "/intelligence/refresh",
    asyncHandler(async (_req, res) => {
      const next = await rebuild();
      setIntelligence(next);
      res.json({ updatedAt: next.updatedAt, totalPlayers: Object.keys(next.players).length });
    })
  );

  router.get("/players/:id/intelligence", (req, res) => {
    const intel = getIntelligence().players[req.params.id];
    if (!intel) return res.status(404).json({ error: "Nessuna Player Intelligence per questo giocatore." });
    res.json(intel);
  });

  return router;
}

export async function loadAndBuildIntelligence(db: PlayerDatabase) {
  const raw = await store.loadIntelligenceRaw();
  if (!raw) return buildPlayerIntelligenceStore(db, EMPTY_IMPORTED_DATA, {});
  const imported = raw.importPayload ? applyManualImport(db, raw.importPayload).data : EMPTY_IMPORTED_DATA;
  return buildPlayerIntelligenceStore(db, imported, raw.overrides);
}
