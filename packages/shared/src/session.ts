import type {
  AuctionEvent, AuctionEventType, AuctionPlayerState, AuctionSession, AuctionSettings, ManagerState,
  Player, PlayerDatabase, RosterSlot,
} from "./types";
import { uid, nowIso } from "./util";
import { assignPlayersToSlots, findPlayer } from "./roster";
import { reallocateBudget } from "./budget";
import { computeMarketState } from "./market";
import { inferOpponentStyle } from "./opponents";
import { describePlayerOwnership } from "./status";

function cloneWithoutEventLog(session: AuctionSession): Omit<AuctionSession, "eventLog"> {
  const { eventLog, ...rest } = session;
  return structuredClone(rest);
}

export interface NewAuctionConfig {
  name?: string;
  settings?: Partial<AuctionSettings>;
  managerNames?: string[]; // 12 names, first is treated as "Io" unless myManagerIndex given
  myManagerIndex?: number;
}

function defaultSettings(overrides?: Partial<AuctionSettings>): AuctionSettings {
  return {
    partecipanti: 12,
    crediti: 500,
    modulo: "4-3-3",
    giocatoriMovimento: 25,
    portieri: 3,
    strategia: "BOMBER_GIOIELLI",
    ...overrides,
  };
}

function buildManagers(settings: AuctionSettings, managerNames: string[] | undefined, myIdx: number): ManagerState[] {
  const names = managerNames && managerNames.length === settings.partecipanti
    ? managerNames
    : Array.from({ length: settings.partecipanti }, (_, i) => (i === myIdx ? "Io" : `Manager ${i + 1}`));
  const slotsTotal = settings.giocatoriMovimento + settings.portieri;
  return names.map((name, i) => ({
    id: uid("mgr_"),
    name,
    isMe: i === myIdx,
    budgetInitial: settings.crediti,
    budgetResidual: settings.crediti,
    slotsTotal,
    slotsFilled: 0,
    players: [],
    style: [],
  }));
}

function buildRosterSlots(db: PlayerDatabase): RosterSlot[] {
  return db.strategyConfig.slotPlan.map((sp) => ({
    slotKey: sp.slotKey,
    famiglia: sp.famiglia,
    profilo: sp.profilo,
    targetBudgetInitial: sp.targetBudget,
    targetBudgetDynamic: sp.targetBudget,
    playerId: null,
    protectPriority: sp.protectPriority,
  }));
}

function buildPlayerStates(db: PlayerDatabase): Record<string, AuctionPlayerState> {
  const states: Record<string, AuctionPlayerState> = {};
  for (const p of db.players) {
    states[p.id] = {
      playerId: p.id,
      status: p.fuoriLista ? "UNAVAILABLE" : "AVAILABLE",
      ownerManagerId: null,
      paidPrice: null,
      currentBid: null,
      nominatedAt: null,
      notes: null,
      liveRank: null,
    };
  }
  return states;
}

/**
 * Section 81: single centralized entry point for creating a brand-new
 * AuctionSession from the permanent PlayerDatabase/StrategyConfig. Never
 * touches the database itself.
 */
export function createNewAuctionSession(db: PlayerDatabase, config: NewAuctionConfig = {}): AuctionSession {
  const settings = defaultSettings(config.settings);
  const myIdx = config.myManagerIndex ?? 0;
  const managers = buildManagers(settings, config.managerNames, myIdx);
  const now = nowIso();

  const session: AuctionSession = {
    id: uid("auction_"),
    name: config.name?.trim() || `Asta – ${new Date().toLocaleString("it-IT")}`,
    createdAt: now,
    updatedAt: now,
    status: "LIVE",
    settings,
    managers,
    myManagerId: managers[myIdx].id,
    playerStates: buildPlayerStates(db),
    rosterSlots: buildRosterSlots(db),
    strategyState: { overspendTotal: 0, savingTotal: 0, slotAdjustments: {}, reallocationLog: [] },
    marketState: { perFamiglia: {}, scarcity: {} },
    eventLog: [],
    nominationHistory: [],
    hiddenGems: [],
  };

  const initEvent: AuctionEvent = {
    id: uid("evt_"),
    seq: 1,
    timestamp: now,
    type: "SESSION_CREATED",
    playerId: null,
    price: null,
    managerId: null,
    stateBefore: null,
    stateAfter: cloneWithoutEventLog(session),
  };
  session.eventLog.push(initEvent);
  session.marketState = computeMarketState(db.players, session);
  return session;
}

/** Section 78: reset rapido — same session id, wiped back to a fresh LIVE state. */
export function resetSessionInPlace(db: PlayerDatabase, session: AuctionSession): AuctionSession {
  const fresh = createNewAuctionSession(db, {
    name: session.name,
    settings: session.settings,
    managerNames: session.managers.map((m) => m.name),
    myManagerIndex: session.managers.findIndex((m) => m.isMe),
  });
  fresh.id = session.id;
  fresh.createdAt = session.createdAt;
  return fresh;
}

export interface ApplyEventInput {
  type: AuctionEventType;
  playerId?: string | null;
  price?: number | null;
  managerId?: string | null; // for SOLD_TO_OPPONENT, which manager bought it
  payload?: Record<string, unknown>;
}

function nextSeq(session: AuctionSession): number {
  return (session.eventLog.at(-1)?.seq ?? 0) + 1;
}

function reassignMyRoster(session: AuctionSession, players: Player[]): void {
  const myManager = session.managers.find((m) => m.isMe)!;
  const eligiblePlayers = myManager.players
    .map((mp) => findPlayer(players, mp.playerId))
    .filter((p): p is Player => !!p)
    .map((p) => ({ playerId: p.id, ruoloMantra: p.ruoloMantra }));

  const mapping = assignPlayersToSlots(eligiblePlayers, session.rosterSlots);
  for (const slot of session.rosterSlots) {
    slot.playerId = mapping[slot.slotKey] ?? null;
  }
}

function applyBudgetReallocation(session: AuctionSession, playerId: string, price: number): void {
  const slot = session.rosterSlots.find((s) => s.playerId === playerId);
  if (!slot) return;
  const { slots, event } = reallocateBudget(session.rosterSlots, slot.slotKey, playerId, price);
  session.rosterSlots = slots;
  session.strategyState.reallocationLog.push(event);
  if (event.extra > 0) session.strategyState.overspendTotal += event.extra;
  else if (event.extra < 0) session.strategyState.savingTotal += -event.extra;
}

/**
 * Applies one auction-floor event to the session (section 25/80), producing a
 * new event with a full before/after snapshot so UNDO (section 25/63) can
 * restore state exactly.
 */
export function applyAuctionEvent(
  session: AuctionSession,
  db: PlayerDatabase,
  input: ApplyEventInput
): { session: AuctionSession; event: AuctionEvent } {
  const s: AuctionSession = structuredClone(session);
  const stateBefore = cloneWithoutEventLog(s);
  const now = nowIso();

  if (input.type === "UNDO") {
    const lastReal = [...s.eventLog].reverse().find((e) => e.type !== "UNDO");
    if (!lastReal) {
      throw new Error("Nessun evento da annullare.");
    }
    const restored = lastReal.stateBefore as Omit<AuctionSession, "eventLog"> | null;
    if (!restored) {
      throw new Error("Impossibile annullare: evento iniziale.");
    }
    Object.assign(s, restored);
    const event: AuctionEvent = {
      id: uid("evt_"), seq: nextSeq(s), timestamp: now, type: "UNDO",
      playerId: lastReal.playerId, price: lastReal.price, managerId: lastReal.managerId,
      stateBefore, stateAfter: cloneWithoutEventLog(s),
    };
    s.eventLog = [...session.eventLog, event];
    s.updatedAt = now;
    return { session: s, event };
  }

  const playerId = input.playerId ?? null;
  const player = playerId ? findPlayer(db.players, playerId) : undefined;
  const myManager = s.managers.find((m) => m.isMe)!;

  switch (input.type) {
    case "PLAYER_NOMINATED": {
      if (!playerId) throw new Error("playerId richiesto");
      s.playerStates[playerId] = {
        ...s.playerStates[playerId],
        status: "NOMINATED",
        nominatedAt: now,
        currentBid: input.price ?? null,
      };
      if (!s.nominationHistory.includes(playerId)) s.nominationHistory.push(playerId);
      break;
    }
    case "BID_UPDATED": {
      if (!playerId) throw new Error("playerId richiesto");
      s.playerStates[playerId] = { ...s.playerStates[playerId], status: "IN_BID", currentBid: input.price ?? null };
      break;
    }
    case "PLAYER_WON_BY_ME": {
      if (!playerId || input.price == null || !player) throw new Error("playerId e price richiesti");
      const ownedWonByMe = describePlayerOwnership(s, playerId);
      if (ownedWonByMe) throw new Error(`${player.nome} è già ${ownedWonByMe}.`);
      s.playerStates[playerId] = {
        ...s.playerStates[playerId], status: "WON_BY_ME", ownerManagerId: myManager.id,
        paidPrice: input.price, currentBid: input.price,
      };
      myManager.budgetResidual -= input.price;
      myManager.slotsFilled += 1;
      myManager.players.push({ playerId, paidPrice: input.price, acquiredAt: now });
      reassignMyRoster(s, db.players);
      applyBudgetReallocation(s, playerId, input.price);
      break;
    }
    case "PLAYER_SOLD_TO_OPPONENT": {
      if (!playerId || input.price == null || !input.managerId) throw new Error("playerId, price, managerId richiesti");
      const mgr = s.managers.find((m) => m.id === input.managerId);
      if (!mgr) throw new Error(`Manager ${input.managerId} non trovato`);
      const ownedSold = describePlayerOwnership(s, playerId);
      if (ownedSold) throw new Error(`${player?.nome ?? playerId} è già ${ownedSold}.`);
      s.playerStates[playerId] = {
        ...s.playerStates[playerId], status: "WON_BY_OPPONENT", ownerManagerId: mgr.id,
        paidPrice: input.price, currentBid: input.price,
      };
      mgr.budgetResidual -= input.price;
      mgr.slotsFilled += 1;
      mgr.players.push({ playerId, paidPrice: input.price, acquiredAt: now });
      mgr.style = inferOpponentStyle(mgr, db.players);
      break;
    }
    case "PLAYER_UNSOLD": {
      if (!playerId) throw new Error("playerId richiesto");
      s.playerStates[playerId] = { ...s.playerStates[playerId], status: "AVAILABLE", currentBid: null, nominatedAt: null };
      break;
    }
    case "PLAYER_PASSED": {
      if (!playerId) throw new Error("playerId richiesto");
      const current = s.playerStates[playerId];
      if (current.status === "NOMINATED" || current.status === "IN_BID") {
        s.playerStates[playerId] = { ...current, status: "AVAILABLE", currentBid: null, nominatedAt: null };
      }
      break;
    }
    case "MANUAL_CORRECTION": {
      if (!playerId) throw new Error("playerId richiesto");
      s.playerStates[playerId] = { ...s.playerStates[playerId], ...(input.payload ?? {}) } as AuctionPlayerState;
      break;
    }
    default:
      throw new Error(`Tipo evento non gestito: ${input.type}`);
  }

  s.marketState = computeMarketState(db.players, s);
  s.updatedAt = now;

  const event: AuctionEvent = {
    id: uid("evt_"), seq: nextSeq(s), timestamp: now, type: input.type,
    playerId, price: input.price ?? null, managerId: input.managerId ?? (input.type === "PLAYER_WON_BY_ME" ? myManager.id : null),
    stateBefore, stateAfter: cloneWithoutEventLog(s), payload: input.payload,
  };
  s.eventLog = [...session.eventLog, event];
  return { session: s, event };
}
