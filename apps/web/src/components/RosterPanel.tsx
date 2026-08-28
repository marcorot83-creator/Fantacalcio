import type { AuctionSession, Player } from "@fanta/shared";

// Pitch-order role grouping (Por -> Pc) so the roster reads as a structure,
// not a priority-sorted jumble. Kept local (not imported from @fanta/shared)
// since it's purely a display concern for this list.
const ROLE_ORDER = ["Por", "Dd", "Ds", "Dc", "B", "E", "M", "C", "T", "W", "A", "Pc"];

function slotSortKey(slotKey: string): number {
  const match = slotKey.match(/\d+$/);
  return match ? Number(match[0]) : 0;
}

export default function RosterPanel({
  session, playersById, onSelectPlayer,
}: { session: AuctionSession; playersById: Record<string, Player>; onSelectPlayer: (id: string) => void }) {
  const slots = [...session.rosterSlots].sort((a, b) => {
    const roleDiff = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
    if (roleDiff !== 0) return roleDiff;
    return slotSortKey(a.slotKey) - slotSortKey(b.slotKey);
  });
  const me = session.managers.find((m) => m.isMe)!;

  return (
    <>
      <h3>Mia rosa ({me.slotsFilled}/{me.slotsTotal})</h3>
      {slots.map((slot) => {
        const player = slot.playerId ? playersById[slot.playerId] : null;
        const paid = player ? me.players.find((p) => p.playerId === player.id)?.paidPrice : null;
        return (
          <div key={slot.slotKey} className={`slot-row ${player ? "filled" : ""}`} onClick={() => player && onSelectPlayer(player.id)}>
            <span className="slot-name">{slot.slotKey} · {slot.profilo}</span>
            {player ? (
              <span className="player-name">{player.nome} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({paid})</span></span>
            ) : (
              <span style={{ color: "var(--muted)" }}>target {slot.targetBudgetDynamic}</span>
            )}
          </div>
        );
      })}
    </>
  );
}
