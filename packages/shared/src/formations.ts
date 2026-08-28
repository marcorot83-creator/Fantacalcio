import type { MantraRole } from "./mantra";

export type FormationId =
  | "3-4-3" | "3-4-1-2" | "3-4-2-1" | "3-5-2" | "3-5-1-1"
  | "4-3-3" | "4-3-1-2" | "4-4-2" | "4-1-4-1" | "4-4-1-1" | "4-2-3-1";

export interface TacticalSlot {
  role: MantraRole;
  count: number;
  /** No real redundancy elsewhere in the XI for this role — losing it hurts. */
  essential: boolean;
}

export interface FormationDefinition {
  id: FormationId;
  name: string;
  /** The 10 outfield roles of the starting XI (goalkeeper handled separately — always 1 Por). */
  startingEleven: TacticalSlot[];
  /** Roles this formation leans on for bonus/goals (section 6, "offensive premium slots"). */
  offensivePremiumRoles: MantraRole[];
  /** Central roles this formation depends on structurally (section 6, "Centrocampo di Ferro"). */
  midfieldCoreRoles: MantraRole[];
  /** Wide roles this formation depends on (section 6, "Fasce Premium"). */
  flankRoles: MantraRole[];
}

/**
 * Standard Mantra role convention per formation. Domain-standard mapping,
 * not pulled from the Excel (section 29: for anything other than 4-3-3 there
 * is no curated static graduatoria — the mapping below is the tactical
 * skeleton the dynamic engine builds on).
 */
export const FORMATIONS: Record<FormationId, FormationDefinition> = {
  "3-4-3": {
    id: "3-4-3", name: "3-4-3",
    startingEleven: [
      { role: "Dc", count: 3, essential: true },
      { role: "E", count: 2, essential: true },
      { role: "C", count: 2, essential: false },
      { role: "W", count: 2, essential: false },
      { role: "Pc", count: 1, essential: true },
    ],
    offensivePremiumRoles: ["W", "Pc", "A"],
    midfieldCoreRoles: ["C", "M"],
    flankRoles: ["E", "W"],
  },
  "3-4-1-2": {
    id: "3-4-1-2", name: "3-4-1-2",
    startingEleven: [
      { role: "Dc", count: 3, essential: true },
      { role: "E", count: 2, essential: true },
      { role: "M", count: 2, essential: false },
      { role: "T", count: 1, essential: true },
      { role: "Pc", count: 2, essential: true },
    ],
    offensivePremiumRoles: ["T", "Pc", "A"],
    midfieldCoreRoles: ["M", "T"],
    flankRoles: ["E"],
  },
  "3-4-2-1": {
    id: "3-4-2-1", name: "3-4-2-1",
    startingEleven: [
      { role: "Dc", count: 3, essential: true },
      { role: "E", count: 2, essential: true },
      { role: "C", count: 2, essential: false },
      { role: "T", count: 2, essential: true },
      { role: "Pc", count: 1, essential: true },
    ],
    offensivePremiumRoles: ["T", "Pc", "A"],
    midfieldCoreRoles: ["C", "T"],
    flankRoles: ["E"],
  },
  "3-5-2": {
    id: "3-5-2", name: "3-5-2",
    startingEleven: [
      { role: "Dc", count: 3, essential: true },
      { role: "E", count: 2, essential: true },
      { role: "M", count: 2, essential: false },
      { role: "C", count: 1, essential: false },
      { role: "Pc", count: 2, essential: true },
    ],
    offensivePremiumRoles: ["Pc", "A"],
    midfieldCoreRoles: ["M", "C"],
    flankRoles: ["E"],
  },
  "3-5-1-1": {
    id: "3-5-1-1", name: "3-5-1-1",
    startingEleven: [
      { role: "Dc", count: 3, essential: true },
      { role: "E", count: 2, essential: true },
      { role: "M", count: 2, essential: false },
      { role: "C", count: 1, essential: false },
      { role: "T", count: 1, essential: true },
      { role: "Pc", count: 1, essential: true },
    ],
    offensivePremiumRoles: ["T", "Pc", "A"],
    midfieldCoreRoles: ["M", "C"],
    flankRoles: ["E"],
  },
  "4-3-3": {
    id: "4-3-3", name: "4-3-3",
    startingEleven: [
      { role: "Dd", count: 1, essential: true },
      { role: "Ds", count: 1, essential: true },
      { role: "Dc", count: 2, essential: false },
      { role: "M", count: 1, essential: true },
      { role: "C", count: 2, essential: false },
      { role: "A", count: 2, essential: true },
      { role: "Pc", count: 1, essential: true },
    ],
    offensivePremiumRoles: ["Pc", "A", "W"],
    midfieldCoreRoles: ["M", "C"],
    flankRoles: ["Dd", "Ds", "A"],
  },
  "4-3-1-2": {
    id: "4-3-1-2", name: "4-3-1-2",
    startingEleven: [
      { role: "Dd", count: 1, essential: true },
      { role: "Ds", count: 1, essential: true },
      { role: "Dc", count: 2, essential: false },
      { role: "M", count: 2, essential: false },
      { role: "C", count: 1, essential: false },
      { role: "T", count: 1, essential: true },
      { role: "Pc", count: 2, essential: true },
    ],
    offensivePremiumRoles: ["Pc", "A", "T"],
    midfieldCoreRoles: ["M", "C", "T"],
    flankRoles: ["Dd", "Ds"],
  },
  "4-4-2": {
    id: "4-4-2", name: "4-4-2",
    startingEleven: [
      { role: "Dd", count: 1, essential: true },
      { role: "Ds", count: 1, essential: true },
      { role: "Dc", count: 2, essential: false },
      { role: "E", count: 2, essential: false },
      { role: "M", count: 1, essential: false },
      { role: "C", count: 1, essential: false },
      { role: "Pc", count: 2, essential: true },
    ],
    offensivePremiumRoles: ["Pc", "A"],
    midfieldCoreRoles: ["M", "C"],
    flankRoles: ["Dd", "Ds", "E"],
  },
  "4-1-4-1": {
    id: "4-1-4-1", name: "4-1-4-1",
    startingEleven: [
      { role: "Dd", count: 1, essential: true },
      { role: "Ds", count: 1, essential: true },
      { role: "Dc", count: 2, essential: false },
      { role: "M", count: 1, essential: true },
      { role: "E", count: 2, essential: false },
      { role: "C", count: 2, essential: false },
      { role: "Pc", count: 1, essential: true },
    ],
    offensivePremiumRoles: ["Pc", "A"],
    midfieldCoreRoles: ["M", "C"],
    flankRoles: ["Dd", "Ds", "E"],
  },
  "4-4-1-1": {
    id: "4-4-1-1", name: "4-4-1-1",
    startingEleven: [
      { role: "Dd", count: 1, essential: true },
      { role: "Ds", count: 1, essential: true },
      { role: "Dc", count: 2, essential: false },
      { role: "E", count: 2, essential: false },
      { role: "C", count: 2, essential: false },
      { role: "T", count: 1, essential: true },
      { role: "Pc", count: 1, essential: true },
    ],
    offensivePremiumRoles: ["Pc", "A", "T"],
    midfieldCoreRoles: ["C", "T"],
    flankRoles: ["Dd", "Ds", "E"],
  },
  "4-2-3-1": {
    id: "4-2-3-1", name: "4-2-3-1",
    startingEleven: [
      { role: "Dd", count: 1, essential: true },
      { role: "Ds", count: 1, essential: true },
      { role: "Dc", count: 2, essential: false },
      { role: "M", count: 2, essential: true },
      { role: "W", count: 2, essential: false },
      { role: "T", count: 1, essential: true },
      { role: "Pc", count: 1, essential: true },
    ],
    offensivePremiumRoles: ["W", "T", "A", "Pc"],
    midfieldCoreRoles: ["M", "T"],
    flankRoles: ["Dd", "Ds", "W"],
  },
};

export function getFormation(id: FormationId): FormationDefinition {
  return FORMATIONS[id] ?? FORMATIONS["4-3-3"];
}

/**
 * Section 3: structural scarcity per role — a role with fewer starting
 * slots (and no redundancy) is harder to cover and should be prioritized
 * higher during the auction. Computed from the formation data itself
 * instead of being hand-tuned per formation.
 */
export function computeRoleScarcity(formation: FormationDefinition): Partial<Record<MantraRole, number>> {
  const scarcity: Partial<Record<MantraRole, number>> = {};
  for (const slot of formation.startingEleven) {
    const base = 1 / slot.count; // fewer slots -> scarcer
    const essentialBonus = slot.essential ? 0.15 : 0;
    scarcity[slot.role] = Math.min(1, Math.round((base * 0.7 + 0.3 + essentialBonus) * 100) / 100);
  }
  return scarcity;
}

/** Roles this formation doesn't field at all in its starting XI. */
export function unusedRoles(formation: FormationDefinition): MantraRole[] {
  const used = new Set(formation.startingEleven.map((s) => s.role));
  const all: MantraRole[] = ["Dd", "Ds", "Dc", "B", "E", "M", "C", "T", "W", "A", "Pc"];
  return all.filter((r) => !used.has(r));
}
