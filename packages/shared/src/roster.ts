import type { Famiglia433, Player, RosterSlot } from "./types";
import { eligibleMantraRoles, type MantraRole } from "./mantra";
import { mantraRoleToFamiglia433 } from "./rosterStructure";

/** Backward-compat coarse grouping (section 30: superseded by eligibleMantraRoles for slot matching). */
export function eligibleFamilies(ruoloMantra: string): Famiglia433[] {
  const roles = eligibleMantraRoles(ruoloMantra);
  if (roles.length === 0) return ["Non433"];
  return [...new Set(roles.map(mantraRoleToFamiglia433))];
}

/**
 * Bipartite matching between acquired players and open roster slots, maximizing
 * coverage while preferring to spend flexible (pluriruolo) players on slots that
 * would otherwise stay uncovered — i.e. specialists fill the slots only they can
 * fill, versatile players plug whatever gap remains (section 23). Matches on the
 * fine-grained Mantra role each slot actually needs, not the coarse family.
 */
export function assignPlayersToSlots(
  players: { playerId: string; ruoloMantra: string }[],
  slots: { slotKey: string; role: MantraRole }[]
): Record<string, string | null> {
  const slotIds = slots.map((s) => s.slotKey);
  const slotRole = new Map<string, MantraRole>(slots.map((s) => [s.slotKey, s.role]));

  const eligibleSlotsFor = (ruoloMantra: string): string[] => {
    const roles = new Set(eligibleMantraRoles(ruoloMantra));
    return slotIds.filter((sid) => roles.has(slotRole.get(sid)!));
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
  return `${slot.role} ${slot.slotKey.replace(/[A-Za-z]+/, "")} — ${slot.profilo}`;
}

export function findPlayer(players: Player[], playerId: string): Player | undefined {
  return players.find((p) => p.id === playerId);
}
