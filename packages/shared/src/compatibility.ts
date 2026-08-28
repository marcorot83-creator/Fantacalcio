import type { AuctionSession, PlayerDatabase } from "./types";
import { type FormationDefinition, type FormationId, FORMATIONS, getFormation } from "./formations";
import { assignPlayersToSlots, findPlayer } from "./roster";

function expandVirtualSlots(formation: FormationDefinition): { slotKey: string; role: ReturnType<typeof getFormation>["startingEleven"][number]["role"] }[] {
  const slots: { slotKey: string; role: any }[] = [];
  for (const s of formation.startingEleven) {
    for (let i = 0; i < s.count; i++) slots.push({ slotKey: `${s.role}${i + 1}`, role: s.role });
  }
  return slots;
}

/** What fraction of a formation's starting XI my current roster could actually fill. */
export function computeFormationCoverage(
  ownedPlayers: { playerId: string; ruoloMantra: string }[],
  formation: FormationDefinition
): number {
  const virtualSlots = expandVirtualSlots(formation);
  if (virtualSlots.length === 0) return 0;
  const mapping = assignPlayersToSlots(ownedPlayers, virtualSlots);
  const filled = Object.values(mapping).filter(Boolean).length;
  return Math.round((filled / virtualSlots.length) * 100);
}

/**
 * Section 5: the primary formation is where the auction is built around, but
 * a roster full of pluriruolo can end up highly compatible with other
 * formations too. Computed live from the roster actually assembled so far.
 */
export function computeSecondaryFormationCompatibility(
  session: AuctionSession,
  db: PlayerDatabase
): { formationId: FormationId; pct: number }[] {
  const myManager = session.managers.find((m) => m.isMe);
  if (!myManager || myManager.players.length === 0) return [];

  const ownedPlayers = myManager.players
    .map((mp) => findPlayer(db.players, mp.playerId))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ playerId: p.id, ruoloMantra: p.ruoloMantra }));

  const primary = session.settings.primaryFormation;
  return Object.values(FORMATIONS)
    .filter((f) => f.id !== primary)
    .map((f) => ({ formationId: f.id, pct: computeFormationCoverage(ownedPlayers, f) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);
}
