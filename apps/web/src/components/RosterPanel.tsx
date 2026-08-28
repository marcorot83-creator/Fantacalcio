import type { AuctionSession, Player } from "@fanta/shared";

export default function RosterPanel({
  session, playersById, onSelectPlayer,
}: { session: AuctionSession; playersById: Record<string, Player>; onSelectPlayer: (id: string) => void }) {
  const slots = [...session.rosterSlots].sort((a, b) => a.protectPriority - b.protectPriority);
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
