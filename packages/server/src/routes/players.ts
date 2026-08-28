import { Router } from "express";
import type { PlayerDatabase } from "@fanta/shared";
import { fuzzyFind, findPairingInfo } from "@fanta/shared";

export function playersRouter(getDb: () => PlayerDatabase): Router {
  const router = Router();

  router.get("/meta", (_req, res) => {
    res.json(getDb().meta);
  });

  router.get("/strategy-config", (_req, res) => {
    res.json(getDb().strategyConfig);
  });

  router.get("/players", (req, res) => {
    const db = getDb();
    const { q, famiglia, tier, maxPrice, limit } = req.query as Record<string, string | undefined>;
    let players = db.players;
    if (famiglia) players = players.filter((p) => p.computed.famiglia433 === famiglia);
    if (tier) players = players.filter((p) => p.computed.tierGruppo === tier);
    if (maxPrice) players = players.filter((p) => p.computed.prezzoObiettivo <= Number(maxPrice));
    if (q) {
      const matches = fuzzyFind(q, players, (p) => p.nome).filter((m) => m.score >= 0.6);
      players = matches.map((m) => m.item);
    } else {
      players = [...players].sort((a, b) => b.computed.indiceFanta - a.computed.indiceFanta);
    }
    const lim = limit ? Number(limit) : 50;
    res.json(players.slice(0, lim));
  });

  router.get("/players/:id", (req, res) => {
    const player = getDb().players.find((p) => p.id === req.params.id);
    if (!player) return res.status(404).json({ error: "not found" });
    res.json(player);
  });

  router.get("/players/:id/pairing", (req, res) => {
    const player = getDb().players.find((p) => p.id === req.params.id);
    if (!player) return res.status(404).json({ error: "not found" });
    res.json(findPairingInfo(getDb(), player.id));
  });

  router.get("/graduatorie/:famiglia", (req, res) => {
    const db = getDb();
    const entries = db.graduatorie
      .filter((g) => g.famiglia === req.params.famiglia)
      .sort((a, b) => a.rank - b.rank)
      .map((g) => {
        const player = g.playerId ? db.players.find((p) => p.id === g.playerId) : undefined;
        return { ...g, live: player ? { prezzoObiettivo: player.computed.prezzoObiettivo, offertaMax: player.computed.offertaMaxBase, strategia: player.computed.strategia433, indiceFanta: player.computed.indiceFanta } : null };
      });
    res.json(entries);
  });

  router.get("/coppie", (_req, res) => res.json(getDb().coppie));
  router.get("/gioielli", (req, res) => {
    const db = getDb();
    const { famiglia } = req.query as Record<string, string | undefined>;
    let list = db.gioielli;
    if (famiglia) list = list.filter((g) => g.playerId && db.players.find((p) => p.id === g.playerId)?.computed.famiglia433 === famiglia);
    res.json(list);
  });
  router.get("/portieri-pacchetti", (_req, res) => res.json(getDb().strategyConfig.pacchettiPortieri));

  return router;
}
