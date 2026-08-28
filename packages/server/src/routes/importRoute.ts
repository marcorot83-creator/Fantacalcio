import { Router } from "express";
import multer from "multer";
import fs from "fs";
import type { PlayerDatabase } from "@fanta/shared";
import { importExcelFile } from "../importExcel";
import { store, mergePlayerDatabase } from "../persistence";

const upload = multer({ dest: "/tmp/fanta-uploads/" });

export function importRouter(onUpdated: (db: PlayerDatabase) => void): Router {
  const router = Router();

  router.post("/import", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "file richiesto (multipart field 'file')" });
    try {
      const fresh = importExcelFile(req.file.path);
      const merged = mergePlayerDatabase(await store.loadPlayerDatabase(), fresh);
      await store.savePlayerDatabase(merged);
      onUpdated(merged);
      res.json({ ok: true, meta: merged.meta, playerCount: merged.players.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally {
      fs.unlink(req.file.path, () => {});
    }
  });

  return router;
}
