import type { Famiglia433, SlotPlanItem, TierEconomico } from "./types";
import type { MantraRole } from "./mantra";
import { type FormationDefinition, computeRoleScarcity } from "./formations";
import type { AuctionStrategyProfile } from "./strategies";

/** Bridge back to the market-pricing family bucket used by formulas.ts (section 29 keeps that engine formation-agnostic). */
export function mantraRoleToFamiglia433(role: MantraRole): Famiglia433 {
  switch (role) {
    case "Por": return "Por";
    case "Dd": return "Dd";
    case "Ds": return "Ds";
    case "Dc": return "Dc";
    case "Pc": return "Pc";
    case "A": return "A";
    case "M": return "M";
    case "C": return "C";
    default: return "Jolly"; // B, E, T, W — section 30: flex roles, priced like the old Jolly bucket
  }
}

const TIER_ORDER: TierEconomico[] = ["Top", "Semitop", "Starter", "Scommessa", "Low"];

/**
 * Section 3/6/8: per-role "how much this role matters" for THIS specific
 * formation+strategy combination — the single mechanism that implements
 * "combinazione modulo + strategia" instead of strategies hardcoding roles
 * that only make sense for one formation.
 */
export function computeRoleImportance(
  formation: FormationDefinition,
  strategy: AuctionStrategyProfile
): Partial<Record<MantraRole, number>> {
  const scarcity = computeRoleScarcity(formation);
  const groupRoles = new Set<MantraRole>(
    strategy.roleGroupBoost
      ? strategy.roleGroupBoost.group === "offensivePremium"
        ? formation.offensivePremiumRoles
        : strategy.roleGroupBoost.group === "midfieldCore"
          ? formation.midfieldCoreRoles
          : formation.flankRoles
      : []
  );

  const importance: Partial<Record<MantraRole, number>> = {};
  for (const slot of formation.startingEleven) {
    const role = slot.role;
    const strategyWeight = strategy.roleWeights[role] ?? 1.0;
    const groupBoost = groupRoles.has(role) && strategy.roleGroupBoost ? strategy.roleGroupBoost.multiplier : 1.0;
    const base = (scarcity[role] ?? 0.5) * strategyWeight * groupBoost;
    importance[role] = Math.round(base * slot.count * 1000) / 1000;
  }
  return importance;
}

function tierWeight(tierIndex: number, starsConcentration: number): number {
  const exponent = 1 + starsConcentration * 1.6;
  return 1 / Math.pow(tierIndex + 1, exponent);
}

function tierLabelForIndex(i: number, n: number): TierEconomico {
  if (i === 0) return "Top";
  if (i === 1 && n >= 3) return "Semitop";
  if (i === n - 1 && n >= 3) return n >= 4 ? "Low" : "Scommessa";
  if (i === n - 2 && n >= 4) return "Scommessa";
  return "Starter";
}

function profiloLabel(tier: TierEconomico, role: MantraRole, index: number, strategy: AuctionStrategyProfile): string {
  if (role === "Pc" && index === 0 && strategy.id === "BOMBER_GEMS") return "BOMBER";
  if (tier === "Top") return "TOP";
  if (tier === "Semitop") return "SEMITOP";
  if (tier === "Starter") return "TITOLARE";
  if (tier === "Scommessa") return "SCOMMESSA";
  return "LOW";
}

function distributeGeometric(totalExtra: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (totalExtra * w) / sum);
  const floored = raw.map(Math.floor);
  let remainder = totalExtra - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) floored[order[k].i]++;
  return floored;
}

/**
 * Section 3/4/8/31: the ONE generalized engine that turns a formation +
 * strategy + budget settings into a concrete target roster structure for
 * the 25 movement slots + N keeper slots — replacing the old static,
 * hand-written 4-3-3 slot plan. Guarantees the total always sums exactly
 * to `crediti` (section 31 hard requirement).
 */
export function buildTargetRosterStructure(
  formation: FormationDefinition,
  strategy: AuctionStrategyProfile,
  settings: { crediti: number; giocatoriMovimento: number; portieri: number }
): SlotPlanItem[] {
  const { crediti, giocatoriMovimento, portieri } = settings;

  // ---- Keeper slots ----
  const keeperBudget = Math.round(crediti * 0.104);
  const keeperWeightsAll = [0.6, 0.25, 0.15, 0.08, 0.05, 0.03];
  const keeperWeights = keeperWeightsAll.slice(0, portieri);
  const keeperBudgets = distributeGeometric(keeperBudget, keeperWeights.length ? keeperWeights : [1]);
  const slots: SlotPlanItem[] = [];
  for (let i = 0; i < portieri; i++) {
    const tier: TierEconomico = i === 0 ? "Top" : i === 1 ? "Semitop" : "Starter";
    slots.push({
      slotKey: `Por${i + 1}`, famiglia: "Por", role: "Por", profilo: i === 0 ? "TITOLARE" : i === 1 ? "RISERVA" : "TERZO",
      targetBudget: Math.max(1, keeperBudgets[i] ?? 1), regola: "pacchetto portiere",
      protectPriority: i === 0 ? 3 : 10 + i,
    });
  }

  // ---- Movement slots ----
  const movementBudget = crediti - keeperBudget;
  const movementSlotsTotal = giocatoriMovimento;
  const roleImportance = computeRoleImportance(formation, strategy);
  const roles = formation.startingEleven;

  const baseCount = roles.reduce((s, r) => s + r.count, 0);
  const extraDepth = Math.max(0, movementSlotsTotal - baseCount);
  const importanceWeights = roles.map((r) => roleImportance[r.role] ?? 0.5);
  const extraPerRole = distributeGeometric(extraDepth, importanceWeights);

  // Total movement budget split across roles proportional to role importance
  // weighted by how many slots (starters + depth) that role ends up with.
  const slotsPerRole = roles.map((r, i) => r.count + extraPerRole[i]);
  const roleBudgetWeights = roles.map((r, i) => (roleImportance[r.role] ?? 0.5) * Math.sqrt(slotsPerRole[i]));
  const roleBudgets = distributeGeometric(movementBudget, roleBudgetWeights);

  let protectRank: { role: MantraRole; index: number; importance: number; tierIdx: number }[] = [];

  roles.forEach((roleSlot, ri) => {
    const n = slotsPerRole[ri];
    const budgetForRole = roleBudgets[ri];
    const weights = Array.from({ length: n }, (_, i) => tierWeight(i, strategy.starsConcentration));
    const tierAdjusted = weights.map((w, i) => {
      const tier = tierLabelForIndex(i, n);
      const tierKey = tier === "Top" ? "top" : tier === "Semitop" ? "semitop" : tier === "Starter" ? "starter" : tier === "Scommessa" ? "scommessa" : "low";
      return w * strategy.tierPreference[tierKey];
    });
    const budgets = distributeGeometric(budgetForRole, tierAdjusted);

    for (let i = 0; i < n; i++) {
      const tier = tierLabelForIndex(i, n);
      const slotKey = `${roleSlot.role}${i + 1}`;
      slots.push({
        slotKey,
        famiglia: mantraRoleToFamiglia433(roleSlot.role),
        role: roleSlot.role,
        profilo: profiloLabel(tier, roleSlot.role, i, strategy),
        targetBudget: Math.max(1, budgets[i]),
        regola: i === 0 ? `slot primario ${roleSlot.role}` : `profondità ${roleSlot.role}`,
        protectPriority: 0, // assigned below
      });
      protectRank.push({ role: roleSlot.role, index: i, importance: (roleImportance[roleSlot.role] ?? 0.5) * tierWeight(i, strategy.starsConcentration), tierIdx: TIER_ORDER.indexOf(tier) });
    }
  });

  // protectPriority: higher combined importance -> lower number -> protected longer.
  protectRank.sort((a, b) => b.importance - a.importance);
  const priorityBySlotKey = new Map<string, number>();
  protectRank.forEach((r, idx) => priorityBySlotKey.set(`${r.role}${r.index + 1}`, idx + 4)); // +4 to sit after keeper priorities (1-3)
  for (const s of slots) {
    if (s.famiglia !== "Por") s.protectPriority = priorityBySlotKey.get(s.slotKey) ?? 20;
  }

  // ---- Reconcile to exactly `crediti` (section 31) ----
  const currentTotal = slots.reduce((s, sl) => s + sl.targetBudget, 0);
  let diff = crediti - currentTotal;
  if (diff !== 0) {
    // Adjust the single highest-value slot (least likely to go below 1, most
    // visible place for a +/-1 rounding correction to land).
    const target = [...slots].sort((a, b) => b.targetBudget - a.targetBudget)[0];
    target.targetBudget = Math.max(1, target.targetBudget + diff);
  }

  return slots;
}
