import type { Famiglia433, Player, RosterSlot } from "./types";

const TOKEN_TO_FAMILY: Record<string, Famiglia433> = {
  Por: "Por",
  Pc: "Pc",
  A: "A",
  M: "M",
  C: "C",
  Dd: "Dd",
  Ds: "Ds",
  Dc: "Dc",
  E: "Jolly",
  W: "Jolly",
  T: "Jolly",
  B: "Jolly",
};

/** All strategic families a player can plausibly cover, from the FULL R.MANTRA string (section 23). */
export function eligibleFamilies(ruoloMantra: string): Famiglia433[] {
  const tokens = (ruoloMantra || "").split("/").map((t) => t.trim());
  const fams = new Set<Famiglia433>();
  for (const t of tokens) {
    const f = TOKEN_TO_FAMILY[t];
    if (f) fams.add(f);
  }
  if (fams.size === 0) fams.add("Non433");
  return [...fams];
}

/**
 * Bipartite matching between acquired players and open roster slots, maximizing
 * coverage while preferring to spend flexible (pluriruolo) players on slots that
 * would otherwise stay uncovered — i.e. specialists fill the slots only they can
 * fill, versatile players plug whatever gap remains (section 23).
 */
export function assignPlayersToSlots(
  players: { playerId: string; ruoloMantra: string }[],
  slots: RosterSlot[]
): Record<string, string | null> {
  // Only movement/keeper slots that exist in the plan; Por handled the same way.
  const slotIds = slots.map((s) => s.slotKey);
  const slotFamily = new Map(slots.map((s) => [s.slotKey, s.famiglia]));

  const eligibleSlotsFor = (ruoloMantra: string): string[] => {
    const fams = new Set(eligibleFamilies(ruoloMantra));
    return slotIds.filter((sid) => fams.has(slotFamily.get(sid)!));
  };

  // Process specialists (fewest eligible slots) first so flexible players are
  // held back for whatever remains uncovered.
  const ordered = [...players].sort(
    (a, b) => eligibleSlotsFor(a.ruoloMantra).length - eligibleSlotsFor(b.ruoloMantra).length
  );

  const slotToPlayer = new Map<string, string>();
  const playerToSlot = new Map<string, string>();

  function tryAssign(playerId: string, ruoloMantra: string, visited: Set<string>): boolean {
    for (const slotId of eligibleSlotsFor(ruoloMantra)) {
      if (visited.has(slotId)) continue;
      visited.add(slotId);
      const occupant = slotToPlayer.get(slotId);
      if (!occupant) {
        slotToPlayer.set(slotId, playerId);
        playerToSlot.set(playerId, slotId);
        return true;
      }
      const occupantRole = players.find((p) => p.playerId === occupant)?.ruoloMantra ?? "";
      if (tryAssign(occupant, occupantRole, visited)) {
        slotToPlayer.set(slotId, playerId);
        playerToSlot.set(playerId, slotId);
        return true;
      }
    }
    return false;
  }

  for (const p of ordered) {
    tryAssign(p.playerId, p.ruoloMantra, new Set());
  }

  const result: Record<string, string | null> = {};
  for (const sid of slotIds) result[sid] = slotToPlayer.get(sid) ?? null;
  return result;
}

export function slotLabel(slot: RosterSlot): string {
  return `${slot.famiglia} ${slot.slotKey.replace(/[A-Za-z]+/, "")} — ${slot.profilo}`;
}

export function findPlayer(players: Player[], playerId: string): Player | undefined {
  return players.find((p) => p.id === playerId);
}
