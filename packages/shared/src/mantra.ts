/**
 * Fine-grained Mantra roles, as they actually appear in R.MANTRA (section 2/30).
 * This is the tactical layer used by formations/strategies; it deliberately
 * does NOT collapse B/E/T/W into a "Jolly" bucket the way Famiglia433 does —
 * that collapsing is kept only for the market-pricing calibration in
 * formulas.ts, which is formation-agnostic by design (section 29).
 */
export type MantraRole = "Por" | "Dd" | "Ds" | "Dc" | "B" | "E" | "M" | "C" | "T" | "W" | "A" | "Pc";

export const ALL_MANTRA_ROLES: MantraRole[] = ["Por", "Dd", "Ds", "Dc", "B", "E", "M", "C", "T", "W", "A", "Pc"];

const VALID_ROLES = new Set<string>(ALL_MANTRA_ROLES);

/** Every Mantra role a player can be fielded in, straight from the full R.MANTRA string. */
export function eligibleMantraRoles(ruoloMantra: string): MantraRole[] {
  const tokens = (ruoloMantra || "").split("/").map((t) => t.trim());
  const roles = new Set<MantraRole>();
  for (const t of tokens) {
    if (VALID_ROLES.has(t)) roles.add(t as MantraRole);
  }
  return [...roles];
}

/**
 * Section 30: replaces the old static "Jolly" concept. A continuous score
 * (0-100) for how much tactical flexibility a player brings — more roles,
 * and roles that span structurally different zones of the pitch (not just
 * two near-identical ones), score higher.
 */
export function computeFlexibilityScore(ruoloMantra: string): number {
  const roles = eligibleMantraRoles(ruoloMantra);
  if (roles.length <= 1) return 0;
  const zoneOf = (r: MantraRole): "gk" | "def" | "wide" | "mid" | "att" => {
    if (r === "Por") return "gk";
    if (r === "Dd" || r === "Ds" || r === "Dc") return "def";
    if (r === "B" || r === "E" || r === "W") return "wide";
    if (r === "M" || r === "C") return "mid";
    return "att"; // T, A, Pc
  };
  const zones = new Set(roles.map(zoneOf));
  const roleBonus = Math.min(40, (roles.length - 1) * 18);
  const zoneBonus = Math.min(60, (zones.size - 1) * 30);
  return Math.round(Math.min(100, roleBonus + zoneBonus));
}
