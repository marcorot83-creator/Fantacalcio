import type { AuctionSession, ManagerState, Player, ReallocationEvent, RosterSlot } from "./types";
import { uid, nowIso } from "./util";

export function getManager(session: AuctionSession, managerId: string): ManagerState {
  const m = session.managers.find((mm) => mm.id === managerId);
  if (!m) throw new Error(`Manager ${managerId} not found`);
  return m;
}

export function getMyManager(session: AuctionSession): ManagerState {
  return getManager(session, session.myManagerId);
}

/** Section 42: how much a manager could still push a bid, worst case. */
export function maxBidCapacity(manager: ManagerState): number {
  const slotsRemaining = Math.max(0, manager.slotsTotal - manager.slotsFilled);
  return manager.budgetResidual - slotsRemaining + 1;
}

/**
 * Section 20/21/22: after a purchase lands on `triggerSlotKey` at `actualCost`
 * against `targetBudgetDynamic`, spread the overspend (or reinvest the saving)
 * across still-open slots, protecting the highest-priority slots first.
 * Mutates nothing — returns the new slots array + a transparent log entry.
 */
export function reallocateBudget(
  rosterSlots: RosterSlot[],
  triggerSlotKey: string,
  triggerPlayerId: string,
  actualCost: number
): { slots: RosterSlot[]; event: ReallocationEvent } {
  const slots = rosterSlots.map((s) => ({ ...s }));
  const trigger = slots.find((s) => s.slotKey === triggerSlotKey);
  const target = trigger?.targetBudgetDynamic ?? actualCost;
  const extra = actualCost - target; // >0 overspend, <0 saving
  const cuts: { slotKey: string; delta: number }[] = [];

  const openSlots = slots.filter((s) => s.slotKey !== triggerSlotKey && s.playerId == null);

  if (Math.abs(extra) >= 1 && openSlots.length > 0) {
    if (extra > 0) {
      // Cut from least-protected (highest protectPriority number) open slots first.
      const candidates = [...openSlots].sort((a, b) => b.protectPriority - a.protectPriority);
      let remaining = extra;
      for (const slot of candidates) {
        if (remaining <= 0) break;
        const floor = 1;
        const cuttable = Math.max(0, slot.targetBudgetDynamic - floor);
        const cut = Math.min(cuttable, Math.ceil(remaining / 2) || remaining, remaining);
        if (cut > 0) {
          slot.targetBudgetDynamic -= cut;
          cuts.push({ slotKey: slot.slotKey, delta: -cut });
          remaining -= cut;
        }
      }
      // If still not fully absorbed, take the remainder evenly off everything left.
      if (remaining > 0) {
        for (const slot of candidates) {
          if (remaining <= 0) break;
          const cuttable = Math.max(0, slot.targetBudgetDynamic - 1);
          const cut = Math.min(cuttable, remaining);
          if (cut > 0) {
            slot.targetBudgetDynamic -= cut;
            const existing = cuts.find((c) => c.slotKey === slot.slotKey);
            if (existing) existing.delta -= cut; else cuts.push({ slotKey: slot.slotKey, delta: -cut });
            remaining -= cut;
          }
        }
      }
    } else {
      // Saving: reinvest into the most strategically important open slots first.
      const saving = -extra;
      const candidates = [...openSlots].sort((a, b) => a.protectPriority - b.protectPriority).slice(0, 3);
      const weights = [0.5, 0.3, 0.2];
      candidates.forEach((slot, idx) => {
        const add = Math.round(saving * (weights[idx] ?? 0));
        if (add > 0) {
          slot.targetBudgetDynamic += add;
          cuts.push({ slotKey: slot.slotKey, delta: add });
        }
      });
    }
  }

  const event: ReallocationEvent = {
    id: uid("realloc_"),
    timestamp: nowIso(),
    triggerSlotKey,
    triggerPlayerId,
    extra,
    cuts,
    note:
      extra > 0
        ? `Overspend di ${extra} su ${triggerSlotKey}. Recuperati da: ${cuts.map((c) => `${c.slotKey} (${c.delta})`).join(", ") || "nessuno slot disponibile"}.`
        : extra < 0
        ? `Saving di ${-extra} su ${triggerSlotKey}. Reinvestiti su: ${cuts.map((c) => `${c.slotKey} (+${c.delta})`).join(", ") || "nessuno"}.`
        : `${triggerSlotKey} pagato esattamente al target.`,
  };

  return { slots, event };
}

/**
 * Section 19: DynamicMax = min(OffertaMaxBase, LimiteAssolutoDiBudget, LimiteStrategicoDiRosa)
 */
export function computeDynamicMax(params: {
  offertaMaxBase: number;
  manager: ManagerState;
  slotsStillToBuy: number; // count of open roster slots excluding the one being bid on
  slot: RosterSlot | undefined;
  netSurplus: number; // savingTotal - overspendTotal accumulated so far
}): { dynamicMax: number; limiteAssolutoDiBudget: number; limiteStrategicoDiRosa: number } {
  const { offertaMaxBase, manager, slotsStillToBuy, slot, netSurplus } = params;
  const limiteAssolutoDiBudget = manager.budgetResidual - Math.max(0, slotsStillToBuy) * 1;
  const slotTarget = slot?.targetBudgetDynamic ?? offertaMaxBase;
  // Strategic buffer: how much of the accumulated net surplus can reasonably be
  // thrown at this one slot without endangering the rest of the plan.
  const strategicBuffer = Math.max(0, netSurplus) * 0.5;
  const limiteStrategicoDiRosa = Math.round(slotTarget + strategicBuffer + (offertaMaxBase - slotTarget) * 0.6);
  const dynamicMax = Math.max(1, Math.min(offertaMaxBase, limiteAssolutoDiBudget, limiteStrategicoDiRosa));
  return { dynamicMax, limiteAssolutoDiBudget, limiteStrategicoDiRosa };
}

export function netSurplus(session: AuctionSession): number {
  return session.strategyState.savingTotal - session.strategyState.overspendTotal;
}

export function slotsStillToBuy(manager: ManagerState, rosterSlots: RosterSlot[]): number {
  if (manager.isMe) return rosterSlots.filter((s) => s.playerId == null).length;
  return Math.max(0, manager.slotsTotal - manager.slotsFilled);
}
