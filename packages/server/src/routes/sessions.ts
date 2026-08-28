import { Router, type Request, type Response, type NextFunction } from "express";
import type { AuctionEventType, AuctionSession, PlayerDatabase, Player } from "@fanta/shared";
import {
  createNewAuctionSession, resetSessionInPlace, applyAuctionEvent, computeBidRecommendation,
  findAlternatives, simulateWhatIf, suggestNomination, buildAllOpponentReports, buildOpponentReport,
  runFeasibilityChecks, buildStatusSummary, renderStatusText, explainWhyForMyRoster, parseCommand,
  getMyManager, computeDynamicMax, netSurplus, slotsStillToBuy, findOpenSlotForFamily, fuzzyFind,
  describePlayerOwnership, findPairingInfo, describePairing,
} from "@fanta/shared";
import { store } from "../persistence";

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

function asyncHandler(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

export function sessionsRouter(getDb: () => PlayerDatabase): Router {
  const router = Router();

  async function requireSession(id: string): Promise<AuctionSession> {
    const session = await store.getSession(id);
    if (!session) {
      const err: any = new Error("Sessione non trovata");
      err.status = 404;
      throw err;
    }
    return session;
  }

  router.get("/sessions", asyncHandler(async (_req, res) => {
    res.json(await store.listSessions());
  }));

  router.get("/sessions/:id", asyncHandler(async (req, res) => {
    res.json(await requireSession(req.params.id));
  }));

  // Section 77: wizard -> create session.
  router.post("/sessions", asyncHandler(async (req, res) => {
    const { name, settings, managerNames, myManagerIndex } = req.body ?? {};
    const session = createNewAuctionSession(getDb(), { name, settings, managerNames, myManagerIndex });
    await store.saveSession(session);
    res.status(201).json(session);
  }));

  // Section 78: reset rapido — same id, wiped state.
  router.post("/sessions/:id/reset", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    const fresh = resetSessionInPlace(getDb(), session);
    await store.saveSession(fresh);
    res.json(fresh);
  }));

  router.post("/sessions/:id/archive", asyncHandler(async (req, res) => {
    await store.archiveSession(req.params.id);
    res.json({ ok: true });
  }));

  // "Chiudi asta": the auction itself is over (all rosters done, or you're
  // just done with it) — becomes read-only but stays in the archive as
  // COMPLETED rather than ARCHIVED (which is reserved for "superseded by a
  // new auction"). Distinct from delete, which is permanent.
  router.post("/sessions/:id/close", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    session.status = "COMPLETED";
    session.updatedAt = new Date().toISOString();
    await store.saveSession(session);
    res.json(session);
  }));

  router.delete("/sessions/:id", asyncHandler(async (req, res) => {
    await store.deleteSession(req.params.id);
    res.json({ ok: true });
  }));

  router.get("/sessions/:id/status", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    const summary = buildStatusSummary(session);
    res.json({ summary, text: renderStatusText(summary) });
  }));

  router.get("/sessions/:id/feasibility", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    res.json(runFeasibilityChecks(session, getDb().players));
  }));

  router.get("/sessions/:id/opponents", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    res.json(buildAllOpponentReports(session, getDb().players));
  }));

  router.get("/sessions/:id/opponents/:managerId", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    const mgr = session.managers.find((m) => m.id === req.params.managerId);
    if (!mgr) return res.status(404).json({ error: "manager not found" });
    res.json(buildOpponentReport(mgr, getDb().players));
  }));

  // --------------------- Listone: browse remaining players by role ---------------------
  const LISTONE_SORT_KEYS: Record<string, (p: Player) => number> = {
    indiceFanta: (p) => p.computed.indiceFanta,
    indiceAffare: (p) => p.computed.indiceAffare,
    prezzoObiettivo: (p) => p.computed.prezzoObiettivo,
    offertaMax: (p) => p.computed.offertaMaxBase,
    titolarita: (p) => p.computed.titolarita,
    quot: (p) => p.quot ?? 0,
    gemScore: (p) => p.computed.gemScore,
  };
  const TAKEN_STATUSES = new Set(["WON_BY_ME", "WON_BY_OPPONENT", "UNAVAILABLE"]);

  router.get("/sessions/:id/listone", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    const db = getDb();
    const { famiglia, q, sortBy = "indiceFanta", order = "desc", limit } = req.query as Record<string, string | undefined>;

    let players = db.players.filter((p) => {
      const st = session.playerStates[p.id];
      return !st || !TAKEN_STATUSES.has(st.status);
    });
    if (famiglia) players = players.filter((p) => p.computed.famiglia433 === famiglia);
    if (q) {
      players = fuzzyFind(q, players, (p) => p.nome).filter((m) => m.score >= 0.4).map((m) => m.item);
    }

    const accessor = LISTONE_SORT_KEYS[sortBy ?? ""] ?? LISTONE_SORT_KEYS.indiceFanta;
    const dir = order === "asc" ? 1 : -1;
    players = [...players].sort((a, b) => (accessor(a) - accessor(b)) * dir);

    res.json({
      count: players.length,
      players: players.slice(0, limit ? Number(limit) : 200),
    });
  }));

  // --------------------- Events (section 25) ---------------------
  router.post("/sessions/:id/events", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    const { type, playerId, price, managerId, payload } = req.body ?? {};
    try {
      const { session: next, event } = applyAuctionEvent(session, getDb(), {
        type: type as AuctionEventType, playerId, price, managerId, payload,
      });
      await store.saveSession(next);
      res.status(201).json({ session: next, event });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }));

  router.post("/sessions/:id/undo", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    try {
      const { session: next, event } = applyAuctionEvent(session, getDb(), { type: "UNDO" });
      await store.saveSession(next);
      res.json({ session: next, event });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }));

  // --------------------- Recommendation engine (section 29/30) ---------------------
  router.get("/sessions/:id/recommendation/:playerId", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    const db = getDb();
    const player = db.players.find((p) => p.id === req.params.playerId);
    if (!player) return res.status(404).json({ error: "player not found" });
    const currentBid = Number(req.query.currentBid ?? player.computed.prezzoObiettivo);
    const rec = computeBidRecommendation({ player, currentBid, players: db.players, graduatorie: db.graduatorie, session, marketState: session.marketState });
    res.json(rec);
  }));

  router.get("/sessions/:id/alternatives/:playerId", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    const db = getDb();
    const player = db.players.find((p) => p.id === req.params.playerId);
    if (!player) return res.status(404).json({ error: "player not found" });
    const scarcity = session.marketState.scarcity[player.computed.famiglia433];
    const myManager = getMyManager(session);
    const alts = findAlternatives({
      players: db.players, graduatorie: db.graduatorie, session, famiglia: player.computed.famiglia433,
      excludePlayerId: player.id, budgetResiduo: myManager.budgetResidual, scarcityIndex: scarcity?.scarcityIndex ?? 0,
      limit: req.query.limit ? Number(req.query.limit) : 5,
    });
    res.json(alts);
  }));

  router.get("/sessions/:id/whatif", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    const db = getDb();
    const player = db.players.find((p) => p.id === req.query.playerId);
    if (!player) return res.status(404).json({ error: "player not found" });
    const price = Number(req.query.price ?? 0);
    res.json(simulateWhatIf({ player, hypotheticalPrice: price, session }));
  }));

  router.get("/sessions/:id/nomination", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    const db = getDb();
    res.json(suggestNomination({ players: db.players, graduatorie: db.graduatorie, session }));
  }));

  router.get("/sessions/:id/players/:playerId/why", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    const db = getDb();
    const player = db.players.find((p) => p.id === req.params.playerId);
    if (!player) return res.status(404).json({ error: "player not found" });
    res.json({ reasons: explainWhyForMyRoster({ player, session, graduatorie: db.graduatorie }) });
  }));

  // --------------------- Conversational layer (section 26/60-61) ---------------------
  // Unambiguous "closes the loop" commands are applied immediately (no extra
  // confirmation step), matching the direct "ACQUISTO REGISTRATO" style from
  // sections 60/61/71 — the parser already refuses to guess when ambiguous.
  router.post("/sessions/:id/chat", asyncHandler(async (req, res) => {
    const session = await requireSession(req.params.id);
    const db = getDb();
    const { text } = req.body ?? {};
    if (!text || typeof text !== "string") return res.status(400).json({ error: "text richiesto" });

    const managers = session.managers.map((m) => ({ id: m.id, name: m.name }));
    const parsed = parseCommand(text, { players: db.players, managers });

    if (!(parsed.playerAmbiguous && parsed.playerAmbiguous.length > 1)) {
      if (parsed.intent === "WON_BY_ME" && parsed.playerId && parsed.price != null) {
        const player = db.players.find((p) => p.id === parsed.playerId)!;
        const owned = describePlayerOwnership(session, player.id);
        if (owned) return res.json({ parsed, reply: `${player.nome} è già ${owned}.` });
        try {
          const { session: next, event } = applyAuctionEvent(session, db, { type: "PLAYER_WON_BY_ME", playerId: player.id, price: parsed.price });
          await store.saveSession(next);
          return res.json({ parsed, session: next, event, reply: renderWonByMeReply(next, player) });
        } catch (e: any) {
          return res.json({ parsed, reply: e.message });
        }
      }
      if (parsed.intent === "SOLD_TO_OPPONENT" && parsed.playerId && parsed.price != null && parsed.managerId) {
        const player = db.players.find((p) => p.id === parsed.playerId)!;
        const owned = describePlayerOwnership(session, player.id);
        if (owned) return res.json({ parsed, reply: `${player.nome} è già ${owned}.` });
        try {
          const { session: next, event } = applyAuctionEvent(session, db, { type: "PLAYER_SOLD_TO_OPPONENT", playerId: player.id, price: parsed.price, managerId: parsed.managerId });
          await store.saveSession(next);
          return res.json({ parsed, session: next, event, reply: renderLostReply(next, db, player, parsed.price, parsed.managerId) });
        } catch (e: any) {
          return res.json({ parsed, reply: e.message });
        }
      }
      if (parsed.intent === "UNDO") {
        try {
          const { session: next, event } = applyAuctionEvent(session, db, { type: "UNDO" });
          await store.saveSession(next);
          return res.json({ parsed, session: next, event, reply: "Ultimo evento annullato." });
        } catch (e: any) {
          return res.json({ parsed, reply: e.message });
        }
      }
    }

    res.json(buildChatResponse(parsed, session, db));
  }));

  function renderWonByMeReply(session: AuctionSession, player: Player): string {
    const myManager = getMyManager(session);
    const realloc = session.strategyState.reallocationLog.at(-1);
    const slot = session.rosterSlots.find((s) => s.playerId === player.id);
    const lines: string[] = [];
    if (realloc && realloc.triggerPlayerId === player.id) {
      lines.push(realloc.extra > 0 ? `ACQUISTO REGISTRATO. +${realloc.extra} CREDITI VS TARGET.` : realloc.extra < 0 ? `ACQUISTO REGISTRATO. -${-realloc.extra} CREDITI VS TARGET (RISPARMIO).` : "ACQUISTO REGISTRATO. Esatto al target.");
      if (realloc.cuts.length) lines.push(realloc.note);
    } else {
      lines.push("ACQUISTO REGISTRATO.");
    }
    if (slot) lines.push(`${slot.slotKey} coperto.`);
    const nextSlot = [...session.rosterSlots].filter((s) => s.playerId == null).sort((a, b) => a.protectPriority - b.protectPriority)[0];
    if (nextSlot) lines.push(`Prossima priorità: ${nextSlot.slotKey} (${nextSlot.profilo}).`);
    lines.push(`Budget residuo: ${myManager.budgetResidual}.`);
    return lines.join("\n");
  }

  function renderLostReply(session: AuctionSession, db: PlayerDatabase, player: Player, price: number, managerId: string): string {
    const managerName = session.managers.find((m) => m.id === managerId)?.name ?? managerId;
    const scarcity = session.marketState.scarcity[player.computed.famiglia433];
    const myManager = getMyManager(session);
    const alts = findAlternatives({
      players: db.players, graduatorie: db.graduatorie, session, famiglia: player.computed.famiglia433,
      excludePlayerId: player.id, budgetResiduo: myManager.budgetResidual, scarcityIndex: scarcity?.scarcityIndex ?? 0, limit: 3,
    });
    const inflation = session.marketState.perFamiglia[player.computed.famiglia433];
    const lines = [`${player.nome} perso a ${price} (${managerName}).`];
    lines.push(alts.length ? `Alternative ancora disponibili: ${alts.map((a) => a.nome).join(", ")}.` : "Nessuna alternativa diretta ancora libera.");
    if (inflation) lines.push(`Inflazione ${player.computed.famiglia433}: ${inflation.adjustedMarketIndex > 1 ? "+" : ""}${Math.round((inflation.adjustedMarketIndex - 1) * 100)}%.`);
    return lines.join("\n");
  }

  function buildChatResponse(parsed: ReturnType<typeof parseCommand>, session: AuctionSession, db: PlayerDatabase) {
    if (parsed.playerAmbiguous && parsed.playerAmbiguous.length > 1) {
      return {
        parsed,
        reply: `Non sono sicuro a chi ti riferisci. Intendevi: ${parsed.playerAmbiguous.slice(0, 5).map((m) => m.item.nome).join(", ")}?`,
        needsClarification: true,
      };
    }
    const player = parsed.playerId ? db.players.find((p) => p.id === parsed.playerId) : undefined;

    switch (parsed.intent) {
      case "NOMINATE":
      case "BID_UPDATE":
      case "RILANCIA_QUERY": {
        if (!player) return { parsed, reply: "Non ho capito quale giocatore. Puoi ripetere il nome?" };
        const ownedNominate = describePlayerOwnership(session, player.id);
        if (ownedNominate) return { parsed, reply: `${player.nome} è già ${ownedNominate}.` };
        const currentBid = parsed.price ?? player.computed.prezzoObiettivo;
        const rec = computeBidRecommendation({ player, currentBid, players: db.players, graduatorie: db.graduatorie, session, marketState: session.marketState });
        return { parsed, recommendation: rec, reply: `${rec.headline}\n${rec.reasons.join("\n")}` };
      }
      case "MAX_SPEND": {
        if (!player) return { parsed, reply: "Quale giocatore?" };
        const myManager = getMyManager(session);
        const slot = findOpenSlotForFamily(session.rosterSlots, player.computed.famiglia433);
        const { dynamicMax } = computeDynamicMax({
          offertaMaxBase: player.computed.offertaMaxBase, manager: myManager,
          slotsStillToBuy: slotsStillToBuy(myManager, session.rosterSlots) - (slot ? 1 : 0), slot, netSurplus: netSurplus(session),
        });
        return { parsed, reply: `Puoi arrivare fino a ${dynamicMax} per ${player.nome} (target ${player.computed.prezzoObiettivo}, cap file ${player.computed.offertaMaxBase}, budget residuo ${myManager.budgetResidual}).`, dynamicMax };
      }
      case "ALTERNATIVES": {
        if (!player) return { parsed, reply: "Alternative a chi?" };
        const scarcity = session.marketState.scarcity[player.computed.famiglia433];
        const myManager = getMyManager(session);
        const alts = findAlternatives({
          players: db.players, graduatorie: db.graduatorie, session, famiglia: player.computed.famiglia433,
          excludePlayerId: player.id, budgetResiduo: myManager.budgetResidual, scarcityIndex: scarcity?.scarcityIndex ?? 0,
          limit: parsed.count ?? 5,
        });
        return { parsed, alternatives: alts, reply: alts.map((a) => `${a.nome} (${a.squadra}) — target ${a.prezzoObiettivo}, max ${a.offertaMax}`).join("\n") };
      }
      case "WHATIF": {
        if (!player || parsed.price == null) return { parsed, reply: "Chi e a quale prezzo ipotetico?" };
        const result = simulateWhatIf({ player, hypotheticalPrice: parsed.price, session });
        return { parsed, whatif: result, reply: result.summary + (result.risks.length ? `\n${result.risks.join("\n")}` : "") };
      }
      case "WON_BY_ME": {
        if (!player || parsed.price == null) return { parsed, reply: `Prezzo pagato per ${player?.nome ?? "questo giocatore"}?` };
        return { parsed, pendingEvent: { type: "PLAYER_WON_BY_ME", playerId: player.id, price: parsed.price }, reply: `Registro ${player.nome} preso a ${parsed.price}?` };
      }
      case "SOLD_TO_OPPONENT": {
        if (!player) return { parsed, reply: "Quale giocatore è stato venduto?" };
        if (parsed.price == null || !parsed.managerId) {
          return { parsed, reply: `A chi e a quanto è andato ${player.nome}?` };
        }
        return { parsed, pendingEvent: { type: "PLAYER_SOLD_TO_OPPONENT", playerId: player.id, price: parsed.price, managerId: parsed.managerId }, reply: `Registro ${player.nome} venduto a ${session.managers.find((m) => m.id === parsed.managerId)?.name} per ${parsed.price}?` };
      }
      case "LOST_UNKNOWN": {
        if (!player) return { parsed, reply: "Chi hai perso?" };
        return { parsed, reply: `Segnato: ${player.nome} non è più disponibile per te. A chi e a quanto è andato (se lo sai)?` };
      }
      case "STATUS_QUERY_PLAYER": {
        if (!player) return { parsed, reply: "Non trovo questo giocatore." };
        const st = session.playerStates[player.id];
        const owned = describePlayerOwnership(session, player.id);
        let reply = owned
          ? `${player.nome} è già ${owned}.`
          : `${player.nome} (${player.squadra}, ${player.ruoloMantra}) — stato: ${st?.status ?? "AVAILABLE"}. Target ${player.computed.prezzoObiettivo}, max ${player.computed.offertaMaxBase}.`;
        if (!owned && player.rischio?.toUpperCase().includes("BALLOTTAGGIO")) {
          const pairings = findPairingInfo(db, player.id);
          if (pairings.length) reply += `\n${describePairing(player.nome, pairings)}`;
        }
        return { parsed, player, playerState: st, reply };
      }
      case "BALLOTTAGGIO_QUERY":
      case "PAIR_QUERY": {
        if (!player) return { parsed, reply: "Di chi vuoi sapere il ballottaggio/coppia?" };
        const pairings = findPairingInfo(db, player.id);
        return { parsed, pairings, reply: describePairing(player.nome, pairings) };
      }
      case "RECOMMEND_ROLE":
      case "NEED_UNDER_PRICE": {
        const fam = parsed.family;
        if (!fam) return { parsed, reply: "Per quale ruolo?" };
        let list = db.graduatorie.filter((g) => g.famiglia === fam).sort((a, b) => a.rank - b.rank);
        if (parsed.intent === "NEED_UNDER_PRICE" && parsed.price != null) {
          list = list.filter((g) => {
            const p = g.playerId ? db.players.find((pp) => pp.id === g.playerId) : undefined;
            return p ? p.computed.prezzoObiettivo <= parsed.price! : false;
          });
        }
        list = list.filter((g) => !g.playerId || session.playerStates[g.playerId]?.status === "AVAILABLE" || !session.playerStates[g.playerId]);
        return { parsed, list: list.slice(0, 8), reply: list.slice(0, 8).map((g) => g.nome).join(", ") || "Nessun candidato trovato." };
      }
      case "GEMS_QUERY": {
        let gems = db.gioielli;
        if (parsed.family) gems = gems.filter((g) => g.playerId && db.players.find((p) => p.id === g.playerId)?.computed.famiglia433 === parsed.family);
        gems = gems.filter((g) => !g.playerId || session.playerStates[g.playerId]?.status === "AVAILABLE" || !session.playerStates[g.playerId]);
        return { parsed, gems: gems.slice(0, 10), reply: gems.slice(0, 10).map((g) => `${g.nome} (${g.squadra}) — target ${g.prezzoObiettivo}`).join("\n") || "Nessun gioiello libero al momento." };
      }
      case "WHO_TO_CALL": {
        const suggestion = suggestNomination({ players: db.players, graduatorie: db.graduatorie, session });
        return { parsed, nomination: suggestion, reply: `CHIAMA ${suggestion.nome}.\n${suggestion.reason}` };
      }
      case "OPPONENTS_NEED": {
        const reports = buildAllOpponentReports(session, db.players);
        return { parsed, reply: `Dati sugli avversari disponibili in /avversari (spesa per reparto stimata).`, opponents: reports };
      }
      case "OPPONENTS_AVG_SPEND": {
        const reports = buildAllOpponentReports(session, db.players);
        const fam = parsed.family;
        const values = reports.map((r) => (fam ? r.spesaPerFamiglia[fam] ?? 0 : r.prezzoMedio)).filter((v) => v > 0);
        const avg = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0;
        return { parsed, reply: `Spesa media avversari${fam ? ` su ${fam}` : ""}: ${avg} crediti.` };
      }
      case "OVERSPEND_QUERY": {
        const summary = buildStatusSummary(session);
        const verdict = summary.overspendTotal > summary.savingTotal + 10 ? "Sì, un po'." : "No, sei in linea col piano.";
        return { parsed, reply: `${verdict} Overspend totale ${summary.overspendTotal}, saving ${summary.savingTotal}, netto ${summary.netSurplus}.` };
      }
      case "RECALC_STRATEGY": {
        return { parsed, reply: "Strategia ricalcolata sui dati correnti: vedi budget dinamico e alternative aggiornate in dashboard." };
      }
      case "STATUS": {
        const summary = buildStatusSummary(session);
        return { parsed, summary, reply: renderStatusText(summary) };
      }
      case "AUTO_ON": return { parsed, reply: "Modalità automatica attivata: ti dirò RILANCIA/MOLLA senza chiedere conferma. Dì \"STOP AUTO\" per tornare al copilota." };
      case "AUTO_OFF": return { parsed, reply: "Modalità automatica disattivata." };
      case "UNDO": return { parsed, pendingEvent: { type: "UNDO" }, reply: "Annullo l'ultimo evento?" };
      case "NEW_AUCTION": return { parsed, reply: "Vuoi iniziare una nuova asta? La sessione corrente verrà archiviata. Conferma dalla schermata Home." };
      default:
        return { parsed, reply: "Non ho capito. Prova con un nome di giocatore, un prezzo, o /stato, /rosa, /budget, /avversari, /nomina." };
    }
  }

  return router;
}
