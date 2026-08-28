import type { AuctionSession } from "@fanta/shared";
import type { DashboardConfig } from "../api";

// Formation structure (which roles are essential / on the flank) is computed
// server-side from @fanta/shared and passed in via `formationShape` — the
// web bundle never value-imports the shared engine package directly (its
// CJS `export *` barrel isn't statically analyzable by Rollup for named
// exports, since there's no ESM build of the shared package).
export default function IndicatorBar({ session, formationShape }: { session: AuctionSession; formationShape: DashboardConfig["formationShape"] | null }) {
  const me = session.managers.find((m) => m.isMe)!;
  const openSlots = session.rosterSlots.filter((s) => s.playerId == null).length;

  const isSlot1Filled = (role: string) => session.rosterSlots.find((s) => s.slotKey === `${role}1`)?.playerId != null;
  const essentialRoles = formationShape?.essentialRoles ?? [];
  const essentialCoperti = essentialRoles.filter(isSlot1Filled).length;
  const flankRoles = formationShape?.flankRoles ?? [];
  const flankCoperti = flankRoles.filter(isSlot1Filled).length;

  const porCoperti = session.rosterSlots.filter((s) => s.famiglia === "Por" && s.playerId != null).length;
  const criticalOpen = session.rosterSlots.filter((s) => s.playerId == null && s.protectPriority <= 6).length;

  const inflation = Object.entries(session.marketState.perFamiglia);

  return (
    <div className="indicator-bar">
      <span className="ind">Budget <b>{me.budgetResidual}</b>/{me.budgetInitial}</span>
      <span className="ind">Rosa <b>{me.slotsFilled}</b>/{me.slotsTotal}</span>
      <span className="ind">Media/slot aperto <b>{openSlots > 0 ? Math.round((me.budgetResidual / openSlots) * 10) / 10 : "-"}</b></span>
      <span className="ind">Overspend <b>{session.strategyState.overspendTotal}</b> · Saving <b>{session.strategyState.savingTotal}</b></span>
      {essentialRoles.length > 0 && <span className="ind">Ruoli chiave <b>{essentialCoperti}</b>/{essentialRoles.length}</span>}
      <span className="ind">Portieri {porCoperti}/{session.settings.portieri}</span>
      {flankRoles.length > 0 && <span className="ind">Fasce <b>{flankCoperti}</b>/{flankRoles.length}</span>}
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
