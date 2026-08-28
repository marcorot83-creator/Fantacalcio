import type { AuctionSession } from "@fanta/shared";

export default function IndicatorBar({ session }: { session: AuctionSession }) {
  const me = session.managers.find((m) => m.isMe)!;
  const openSlots = session.rosterSlots.filter((s) => s.playerId == null).length;
  const pc1 = session.rosterSlots.find((s) => s.slotKey === "Pc1")?.playerId != null;
  const a1 = session.rosterSlots.find((s) => s.slotKey === "A1")?.playerId != null;
  const porCoperti = session.rosterSlots.filter((s) => s.famiglia === "Por" && s.playerId != null).length;
  const ddDsCoperti = session.rosterSlots.filter((s) => (s.slotKey === "Dd1" || s.slotKey === "Ds1") && s.playerId != null).length;
  const criticalOpen = session.rosterSlots.filter((s) => s.playerId == null && s.protectPriority <= 6).length;

  const inflation = Object.entries(session.marketState.perFamiglia);

  return (
    <div className="indicator-bar">
      <span className="ind">Budget <b>{me.budgetResidual}</b>/{me.budgetInitial}</span>
      <span className="ind">Rosa <b>{me.slotsFilled}</b>/{me.slotsTotal}</span>
      <span className="ind">Media/slot aperto <b>{openSlots > 0 ? Math.round((me.budgetResidual / openSlots) * 10) / 10 : "-"}</b></span>
      <span className="ind">Overspend <b>{session.strategyState.overspendTotal}</b> · Saving <b>{session.strategyState.savingTotal}</b></span>
      <span className="ind">Pc1 {pc1 ? "✅" : "❌"}</span>
      <span className="ind">A1 {a1 ? "✅" : "❌"}</span>
      <span className="ind">Portieri {porCoperti}/3</span>
      <span className="ind">Dd/Ds top {ddDsCoperti}/2</span>
      <span className="ind">Slot critici scoperti <b>{criticalOpen}</b></span>
      {inflation.map(([fam, stats]) =>
        stats ? (
          <span className="ind" key={fam}>
            Infl. {fam} <b>{stats.adjustedMarketIndex > 1 ? "+" : ""}{Math.round((stats.adjustedMarketIndex - 1) * 100)}%</b>
          </span>
        ) : null
      )}
      <span className="spacer" />
    </div>
  );
}
