import { Router } from "express";
import multer from "multer";
import fs from "fs";
import type { PlayerDatabase } from "@fanta/shared";
import { importExcelFile } from "../importExcel";
import { loadPlayerDatabase, mergePlayerDatabase, savePlayerDatabase } from "../store";

const upload = multer({ dest: "/tmp/fanta-uploads/" });

export function importRouter(onUpdated: (db: PlayerDatabase) => void): Router {
  const router = Router();

  router.post("/import", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "file richiesto (multipart field 'file')" });
    try {
      const fresh = importExcelFile(req.file.path);
      const merged = mergePlayerDatabase(loadPlayerDatabase(), fresh);
      savePlayerDatabase(merged);
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
