import type { AuctionSession, Famiglia433, ManagerState, Player, ReallocationEvent, RosterSlot } from "./types";
import { uid, nowIso } from "./util";
import { getFormation } from "./formations";
import { getStrategy } from "./strategies";
import { getAuctionStyle } from "./auctionStyle";
import { computeFormationFit, computeStrategyFit } from "./strategicFit";

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
 * Safe to call speculatively (section 20/43): callers that don't want to
 * persist the result just discard the returned slots.
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

export function netSurplus(session: AuctionSession): number {
  return session.strategyState.savingTotal - session.strategyState.overspendTotal;
}

export function slotsStillToBuy(manager: ManagerState, rosterSlots: RosterSlot[]): number {
  if (manager.isMe) return rosterSlots.filter((s) => s.playerId == null).length;
  return Math.max(0, manager.slotsTotal - manager.slotsFilled);
}

export interface DynamicMaxFactors {
  basePlayerMax: number;
  slotBudgetAnchor: number;
  marginalUtilityAdjustment: number; // multiplier, how much of the player's own quality leaks above the slot's plan
  formationFit: number; // multiplier
  strategyImportance: number; // multiplier
  marketAdjustment: number; // multiplier
  scarcityAdjustment: number; // multiplier
  auctionStyleAdjustment: number; // multiplier
  rosterNeedAdjustment: number; // multiplier
  concentrationAdjustment: number; // multiplier, my own overspend/saving vs plan in this famiglia
  beforeCaps: number;
  budgetFeasibilityCap: number;
  rosterCompletionCap: number;
  dynamicMax: number;
}

/**
 * Diminishing marginal utility (section 2/3/14/15 of the marginal-value
 * correction): what a player is worth is anchored on what the specific open
 * slot they'd fill is CURRENTLY planned to cost — not on the player's own
 * static market value. A slot's own plan already prices in same-role depth
 * decay (Pc1 >> Pc2 >> Pc3 — see rosterStructure.ts's per-tier geometric
 * curve) and any overspend already reallocated away from it by
 * reallocateBudget() after an earlier purchase in the same role. When no
 * open slot exists at all for this role (the need is already fully met),
 * fall back to a steep fraction of the player's own value.
 *
 * This must cut both ways. A materially better player than what the slot
 * was planned for still pulls some headroom above the plan (section 16:
 * "value opportunity" must stay reachable) — but only a modest share of
 * that gap leaks through, so the slot's own diminishing-value curve remains
 * the dominant signal rather than the player's raw market price. Symmetrically,
 * a bargain-bin player filling a slot the plan still budgets generously for
 * (e.g. a Scommessa-tier bench winger landing on a still-open "A1 TOP" slot)
 * must NOT inherit that slot's full premium budget just because nobody
 * has filled it yet — their own intrinsic market value stays the anchor,
 * with only a small pull toward the roomier plan. Anchor on whichever of
 * the two is smaller, with the same modest leak toward the larger one.
 */
function computeSlotAnchoredMax(basePlayerMax: number, slot: RosterSlot | undefined): { slotBudgetAnchor: number; marginalUtilityAdjustment: number; anchorMax: number } {
  const slotBudgetAnchor = slot ? slot.targetBudgetDynamic : Math.max(1, Math.round(basePlayerMax * 0.22));
  const floor = Math.min(basePlayerMax, slotBudgetAnchor);
  const ceiling = Math.max(basePlayerMax, slotBudgetAnchor);
  const anchorMax = floor + (ceiling - floor) * 0.18;
  const marginalUtilityAdjustment = slotBudgetAnchor > 0 ? anchorMax / slotBudgetAnchor : 1;
  return { slotBudgetAnchor, marginalUtilityAdjustment, anchorMax };
}

/**
 * Section 6/10/14: SectorInvestmentPressure — how much I MYSELF already
 * overspent (or saved) against plan on slots of this same famiglia. This is
 * distinct from the generic cross-manager market-inflation index: paying
 * 164 for a slot planned at 145 makes the NEXT purchase in that same sector
 * more sensitive, regardless of what the wider market is doing. Saving
 * instead leaves a little more room, but only mildly — it's an allowance,
 * not a rebate.
 */
function computeSectorConcentrationAdjustment(session: AuctionSession, manager: ManagerState, famiglia: Famiglia433): number {
  const filledSameFamily = session.rosterSlots.filter((s) => s.famiglia === famiglia && s.playerId != null);
  if (filledSameFamily.length === 0) return 1;
  let overspend = 0;
  for (const s of filledSameFamily) {
    const paid = manager.players.find((mp) => mp.playerId === s.playerId)?.paidPrice;
    if (paid == null) continue;
    overspend += paid - s.targetBudgetInitial;
  }
  const pct = overspend / Math.max(1, session.settings.crediti);
  return Math.min(1.15, Math.max(0.55, 1 - pct * 1.6));
}

/**
 * Section 13/51: DynamicMax = SlotAnchoredMax (see computeSlotAnchoredMax)
 * × FormationFit × StrategyImportance × MarketAdjustment × ScarcityAdjustment
 * × AuctionStyleAdjustment × RosterNeedAdjustment, then hard-capped by
 * budget feasibility and roster completion (section 12: these never bend
 * regardless of style).
 */
export function computeDynamicMax(params: {
  player: Player;
  session: AuctionSession;
  manager: ManagerState;
  slotsStillToBuy: number; // count of open roster slots excluding the one being bid on
  slot: RosterSlot | undefined;
}): DynamicMaxFactors {
  const { player, session, manager, slotsStillToBuy: slotsLeft, slot } = params;
  const formation = getFormation(session.settings.primaryFormation);
  const strategy = getStrategy(session.settings.strategyProfile);
  const style = getAuctionStyle(session.settings.auctionStyle);

  const basePlayerMax = player.computed.offertaMaxBase;
  const { slotBudgetAnchor, marginalUtilityAdjustment, anchorMax } = computeSlotAnchoredMax(basePlayerMax, slot);

  const formationFitScore = computeFormationFit(player, formation);
  const formationFit = 0.8 + (formationFitScore / 100) * 0.4; // 0.8 - 1.2

  const strategyFitScore = computeStrategyFit(player, formation, strategy);
  const strategyImportance = 0.8 + (strategyFitScore / 100) * 0.4; // 0.8 - 1.2

  const marketStats = session.marketState.perFamiglia[player.computed.famiglia433];
  const marketAdjustment = marketStats ? Math.min(1.25, Math.max(0.85, marketStats.adjustedMarketIndex)) : 1.0;

  // Section 20: scarcity only matters combined WITH need (Urgency = Need ×
  // Scarcity, not Need + Scarcity) — multiplying it onto anchorMax (which
  // already collapsed once the role/slot is satisfied) means a scarce-but-
  // already-covered role no longer irrationally inflates the cap.
  const scarcityInfo = session.marketState.scarcity[player.computed.famiglia433];
  const scarcityAdjustment =
    scarcityInfo?.level === "critica" ? 1.1 :
    scarcityInfo?.level === "alta" ? 1.05 :
    scarcityInfo?.level === "bassa" ? 0.95 : 1.0;

  const auctionStyleAdjustment = style.dynamicCapMultiplier;

  const rosterNeedAdjustment = !slot ? 0.85 : slot.protectPriority <= 6 ? 1.08 : 1.0;

  const concentrationAdjustment = computeSectorConcentrationAdjustment(session, manager, player.computed.famiglia433);

  const beforeCaps = Math.round(
    anchorMax * formationFit * strategyImportance * marketAdjustment * scarcityAdjustment
      * auctionStyleAdjustment * rosterNeedAdjustment * concentrationAdjustment
  );

  // Hard caps (section 12) — never bend regardless of style.
  const budgetFeasibilityCap = manager.budgetResidual - Math.max(0, slotsLeft) * 1;
  const otherOpenSlots = session.rosterSlots.filter((s) => s.playerId == null && s.slotKey !== slot?.slotKey);
  const essentialReserve = otherOpenSlots.reduce((sum, s) => sum + Math.max(1, Math.round(s.targetBudgetDynamic * 0.12)), 0);
  const rosterCompletionCap = manager.budgetResidual - essentialReserve;

  // Sanity ceiling well above the two spec-mandated hard caps: stops a
  // pathological all-factors-at-once alignment from running away, without
  // masking the (legitimate, and much smaller) swing the style multiplier
  // alone is supposed to contribute. Scaled off anchorMax (not the player's
  // raw basePlayerMax) so a saturated slot stays capped even here.
  const sanityCeiling = anchorMax * 1.6;
  // Credits are always whole numbers in this domain — round the final value
  // rather than each intermediate term, so whichever term ends up binding
  // (sanityCeiling and the caps carry fractional player values like 172.8
  // through un-rounded) never leaks a fractional credit into the UI/reasons.
  const dynamicMax = Math.round(Math.max(1, Math.min(beforeCaps, budgetFeasibilityCap, rosterCompletionCap, sanityCeiling)));

  return {
    basePlayerMax, slotBudgetAnchor, marginalUtilityAdjustment, formationFit, strategyImportance, marketAdjustment, scarcityAdjustment,
    auctionStyleAdjustment, rosterNeedAdjustment, concentrationAdjustment, beforeCaps, budgetFeasibilityCap, rosterCompletionCap, dynamicMax,
  };
}

export interface AggressiveMaxResult {
  aggressiveMax: number;
  extra: number; // aggressiveMax - dynamicMax
  financeable: boolean;
  cuts: { slotKey: string; delta: number }[];
  note: string;
}

/**
 * Section 11/19/20: the explicit, transparent override headroom above
 * DynamicMax that AGGRESSIVE (and, to a lesser extent, MEDIO) styles allow —
 * only surfaced together with how it would actually be financed. Never
 * silently folded into DynamicMax itself.
 */
export function computeAggressiveMax(params: {
  session: AuctionSession;
  dynamicMax: number;
  slot: RosterSlot | undefined;
}): AggressiveMaxResult {
  const { session, dynamicMax, slot } = params;
  const style = getAuctionStyle(session.settings.auctionStyle);
  const extraPct = style.strategicOverridePct;
  if (extraPct <= 0 || !slot) {
    return { aggressiveMax: dynamicMax, extra: 0, financeable: false, cuts: [], note: "" };
  }
  const aggressiveMax = Math.round(dynamicMax * (1 + extraPct));
  const extra = aggressiveMax - dynamicMax;
  const { slots: afterCuts, event } = reallocateBudget(session.rosterSlots, slot.slotKey, "__hypothetical__", aggressiveMax);
  void afterCuts;
  const financeable = event.cuts.length > 0 || extra <= 0;
  return {
    aggressiveMax,
    extra,
    financeable,
    cuts: event.cuts,
    note: financeable
      ? `Gli ultimi ${extra} crediti richiedono: ${event.cuts.map((c) => `${c.slotKey} (${c.delta})`).join(", ")}.`
      : `Override non autorizzato: nessun taglio realistico identificabile per finanziare ${extra} crediti extra.`,
  };
}
