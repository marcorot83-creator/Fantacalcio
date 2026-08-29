import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../api";
import type { AuctionSession, BidRecommendation, Player } from "@fanta/shared";
import type { DashboardConfig } from "../api";
import IndicatorBar from "./IndicatorBar";
import RosterPanel from "./RosterPanel";
import AlternativesPanel from "./AlternativesPanel";
import Chat, { type ChatMsg } from "./Chat";
import PlayerSearch from "./PlayerSearch";
import PlayerDetailModal from "./PlayerDetailModal";
import Listone from "./Listone";
import OpponentsPanel from "./OpponentsPanel";
import SettingsPanel from "./SettingsPanel";
import BidInput from "./BidInput";
import { computeSemaforoClient } from "../semaforo";

export default function Live(props: { sessionId: string; onHome: () => void }) {
  const { sessionId, onHome } = props;
  const [session, setSession] = useState<AuctionSession | null>(null);
  const [playersById, setPlayersById] = useState<Record<string, Player>>({});
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [currentBid, setCurrentBid] = useState<number>(0);
  const [recommendation, setRecommendation] = useState<BidRecommendation | null>(null);
  const [chatLog, setChatLog] = useState<ChatMsg[]>([]);
  const [detailPlayerId, setDetailPlayerId] = useState<string | null>(null);
  const [showListone, setShowListone] = useState(false);
  const [showOpponents, setShowOpponents] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sellManagerId, setSellManagerId] = useState<string>("");
  const readOnly = session?.status !== "LIVE";

  const loadSession = useCallback(async () => {
    const s = await api.session(sessionId);
    setSession(s);
    return s;
  }, [sessionId]);

  const loadDashboardConfig = useCallback(() => {
    api.dashboardConfig(sessionId).then(setDashboardConfig);
  }, [sessionId]);

  useEffect(() => {
    loadSession();
    loadDashboardConfig();
    api.players({ limit: 1000 }).then((list) => {
      const map: Record<string, Player> = {};
      for (const p of list) map[p.id] = p;
      setPlayersById(map);
    });
  }, [loadSession, loadDashboardConfig]);

  const activePlayer = activePlayerId ? playersById[activePlayerId] : null;

  const refreshRecommendation = useCallback(
    async (playerId: string, bid: number) => {
      const rec = await api.recommendation(sessionId, playerId, bid);
      setRecommendation(rec);
    },
    [sessionId]
  );

  useEffect(() => {
    if (activePlayerId && currentBid > 0) refreshRecommendation(activePlayerId, currentBid);
  }, [activePlayerId, currentBid, refreshRecommendation]);

  function selectPlayer(p: Player) {
    setActivePlayerId(p.id);
    setCurrentBid(p.computed.prezzoObiettivo);
    if (session?.status === "LIVE") {
      api.event(sessionId, { type: "PLAYER_NOMINATED", playerId: p.id, price: p.computed.prezzoObiettivo }).then(({ session: s }) => setSession(s));
    }
  }

  async function handleRilancia() {
    setCurrentBid((b) => b + 1);
  }

  async function handlePassa() {
    if (activePlayerId && session?.status === "LIVE") {
      const { session: s } = await api.event(sessionId, { type: "PLAYER_PASSED", playerId: activePlayerId });
      setSession(s);
    }
    setActivePlayerId(null);
    setRecommendation(null);
  }

  async function handlePreso() {
    if (!activePlayerId || session?.status !== "LIVE") return;
    const { session: s } = await api.event(sessionId, { type: "PLAYER_WON_BY_ME", playerId: activePlayerId, price: currentBid });
    setSession(s);
    const player = playersById[activePlayerId];
    const reallocLog = s.strategyState.reallocationLog.at(-1);
    setChatLog((log) => [
      ...log,
      { role: "bot", text: `ACQUISTO REGISTRATO: ${player?.nome} a ${currentBid}.\n${reallocLog?.note ?? ""}\nBudget residuo: ${s.managers.find((m) => m.isMe)?.budgetResidual}.` },
    ]);
    setActivePlayerId(null);
    setRecommendation(null);
  }

  async function handleVendutoAdAltro() {
    if (!activePlayerId || !sellManagerId || session?.status !== "LIVE") return;
    const { session: s } = await api.event(sessionId, { type: "PLAYER_SOLD_TO_OPPONENT", playerId: activePlayerId, price: currentBid, managerId: sellManagerId });
    setSession(s);
    const player = playersById[activePlayerId];
    const alts = await api.alternatives(sessionId, activePlayerId, 4).catch(() => []);
    setChatLog((log) => [
      ...log,
      {
        role: "bot",
        text: `${player?.nome} perso a ${currentBid} (${s.managers.find((m) => m.id === sellManagerId)?.name}).\nAlternative: ${alts.map((a) => a.nome).join(", ") || "nessuna"}.`,
      },
    ]);
    setActivePlayerId(null);
    setRecommendation(null);
    setSellManagerId("");
  }

  async function handleUndo() {
    const { session: s } = await api.undo(sessionId);
    setSession(s);
    setActivePlayerId(null);
    setRecommendation(null);
  }

  async function handleCloseAuction() {
    if (!confirmClose) {
      setConfirmClose(true);
      return;
    }
    const s = await api.closeSession(sessionId);
    setSession(s);
    setConfirmClose(false);
  }

  async function handleDeleteAuction() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await api.deleteSession(sessionId);
    onHome();
  }

  async function handleChatSend(text: string) {
    setChatLog((log) => [...log, { role: "user", text }]);
    const res = await api.chat(sessionId, text);
    setChatLog((log) => [...log, { role: "bot", text: res.reply, pendingEvent: res.pendingEvent }]);
    if (res.session) {
      setSession(res.session);
      if (res.parsed?.playerId && res.parsed.playerId === activePlayerId) {
        setActivePlayerId(null);
        setRecommendation(null);
      }
    }
    if (res.parsed?.intent === "NOMINATE" && res.recommendation) {
      setActivePlayerId(res.recommendation.player.id);
      setCurrentBid(res.recommendation.currentBid);
      setRecommendation(res.recommendation);
      if (session?.status === "LIVE") {
        api.event(sessionId, { type: "PLAYER_NOMINATED", playerId: res.recommendation.player.id, price: res.recommendation.currentBid }).then(({ session: s }) => setSession(s));
      }
    } else if ((res.parsed?.intent === "BID_UPDATE" || res.parsed?.intent === "RILANCIA_QUERY") && res.recommendation) {
      setActivePlayerId(res.recommendation.player.id);
      setCurrentBid(res.recommendation.currentBid);
      setRecommendation(res.recommendation);
    }
  }

  async function confirmPendingEvent(pending: any) {
    const { session: s } = await api.event(sessionId, pending);
    setSession(s);
    setChatLog((log) => [...log, { role: "bot", text: "Fatto." }]);
  }

  const graduatoriaFamily = activePlayer?.computed.famiglia433;

  if (!session) return <div className="empty-state">Caricamento sessione…</div>;

  const me = session.managers.find((m) => m.isMe)!;

  return (
    <div className="live-shell">
      <div className="top-bar">
        <button onClick={onHome}>← Home</button>
        <div className="session-name">{session.name}</div>
        {session.status === "ARCHIVED" && <span className="badge archived">SOLA LETTURA (archiviata)</span>}
        {session.status === "COMPLETED" && <span className="badge archived">ASTA CHIUSA</span>}
        {dashboardConfig && (
          <button className="badge" onClick={() => setShowSettings(true)} title="Configurazione asta">
            {dashboardConfig.formation.name} · {dashboardConfig.strategy.name} · {dashboardConfig.style.name}
          </button>
        )}
        <div className="spacer" />
        <button onClick={() => { setShowOpponents(false); setShowListone(true); }}>Listone</button>
        <button onClick={() => { setShowListone(false); setShowOpponents(true); }}>Avversari</button>
        <button onClick={handleUndo} disabled={readOnly}>UNDO</button>
        {session.status === "LIVE" && (
          <button onClick={handleCloseAuction}>{confirmClose ? "Confermi chiusura?" : "Chiudi asta"}</button>
        )}
        <button className="danger" onClick={handleDeleteAuction}>{confirmDelete ? "Confermi eliminazione?" : "Elimina asta"}</button>
      </div>

      <IndicatorBar session={session} formationShape={dashboardConfig?.formationShape ?? null} />

      <div className="live-main">
        <div className="col">
          <RosterPanel session={session} playersById={playersById} onSelectPlayer={(id) => setDetailPlayerId(id)} />
        </div>

        <div className="center-col">
          {!activePlayer ? (
            <>
              <h3>Chiama un giocatore</h3>
              <PlayerSearch onSelect={selectPlayer} disabled={readOnly} />
              <div className="empty-state">Cerca un nome per iniziare, oppure usa la chat qui sotto ("Chiamano Malen").</div>
            </>
          ) : (
            <div className="player-card">
              <div className="title">
                <h2>
                  <span className={`semaforo ${recommendation ? computeSemaforoClient(currentBid, recommendation) : ""}`} />
                  {activePlayer.nome}
                </h2>
                <span className="team">{activePlayer.squadra}</span>
              </div>
              <div className="tags">
                <span className="tag">{activePlayer.ruoloMantra}</span>
                <span className="tag">{activePlayer.computed.tierGruppo}</span>
                <span className="tag">Tit. {activePlayer.computed.titolarita}%</span>
                <span className="tag">Fascia {activePlayer.computed.fascia}</span>
                {activePlayer.rischio && activePlayer.rischio !== "BASSO" && <span className="tag" style={{ color: "var(--orange)" }}>{activePlayer.rischio}</span>}
                <button style={{ marginLeft: "auto" }} onClick={() => setDetailPlayerId(activePlayer.id)}>Dettagli</button>
              </div>

              <div className="metrics">
                <div className="metric"><div className="label">Target</div><div className="value">{recommendation?.prezzoObiettivo ?? activePlayer.computed.prezzoObiettivo}</div></div>
                <div className="metric"><div className="label">Base max</div><div className="value">{recommendation?.offertaMaxBase ?? activePlayer.computed.offertaMaxBase}</div></div>
                <div className="metric"><div className="label">Dynamic max</div><div className="value">{recommendation?.dynamicMax ?? "…"}</div></div>
                <div className="metric"><div className="label">Budget residuo</div><div className="value">{me.budgetResidual}</div></div>
              </div>

              {recommendation && (
                <div className="metrics">
                  <div className="metric">
                    <div className="label">Aggressive max</div>
                    <div className="value">{recommendation.aggressiveMax}</div>
                  </div>
                  <div className="metric"><div className="label">Fit modulo+strategia</div><div className="value">{recommendation.strategicFitScore}/100</div></div>
                  <div className="metric" style={{ gridColumn: "span 2" }}>
                    <div className="label">Finanziabilità override</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 4 }}>{recommendation.aggressiveMaxNote ?? "—"}</div>
                  </div>
                </div>
              )}

              <div className="bid-controls">
                <label>Prezzo attuale</label>
                <BidInput key={activePlayer.id} value={currentBid} onCommit={setCurrentBid} disabled={readOnly} autoFocus />
              </div>

              {recommendation && (
                <>
                  <div className={`headline ${recommendation.action}`}>{recommendation.headline}</div>
                  <ul className="reasons">
                    {recommendation.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </>
              )}

              <div className="big-buttons">
                <button className="big primary" onClick={handleRilancia} disabled={readOnly}>RILANCIA</button>
                <button className="big" onClick={handlePassa} disabled={readOnly}>PASSA</button>
                <button className="big" style={{ background: "var(--green)", borderColor: "var(--green)" }} onClick={handlePreso} disabled={readOnly}>PRESO</button>
                <button className="big danger" onClick={() => setDetailPlayerId("__sell__")} disabled={readOnly}>VENDUTO AD ALTRO</button>
              </div>

              {detailPlayerId === "__sell__" && (
                <div className="pending-confirm" style={{ marginTop: 12 }}>
                  <select value={sellManagerId} onChange={(e) => setSellManagerId(e.target.value)}>
                    <option value="">A chi?</option>
                    {session.managers.filter((m) => !m.isMe).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <button className="primary" disabled={!sellManagerId} onClick={() => { handleVendutoAdAltro(); setDetailPlayerId(null); }}>Conferma</button>
                  <button onClick={() => setDetailPlayerId(null)}>Annulla</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="col">
          {activePlayer && graduatoriaFamily ? (
            <AlternativesPanel sessionId={sessionId} playerId={activePlayer.id} onSelect={(id) => playersById[id] && selectPlayer(playersById[id])} />
          ) : (
            <div className="empty-state">Le alternative appariranno qui quando chiami un giocatore.</div>
          )}
        </div>
      </div>

      <Chat log={chatLog} onSend={handleChatSend} onConfirmPending={confirmPendingEvent} />

      {showListone && (
        <Listone
          sessionId={sessionId}
          readOnly={readOnly}
          onClose={() => setShowListone(false)}
          onDetail={(id) => setDetailPlayerId(id)}
          onNominate={(p) => {
            setShowListone(false);
            selectPlayer(p);
          }}
        />
      )}

      {showOpponents && <OpponentsPanel sessionId={sessionId} onClose={() => setShowOpponents(false)} />}

      {showSettings && (
        <SettingsPanel
          sessionId={sessionId}
          readOnly={readOnly}
          onClose={() => { setShowSettings(false); loadDashboardConfig(); }}
          onSessionUpdated={(s) => setSession(s)}
        />
      )}

      {/* Rendered last so it stacks above Listone/Avversari when opened from within them. */}
      {detailPlayerId && detailPlayerId !== "__sell__" && (
        <PlayerDetailModal sessionId={sessionId} playerId={detailPlayerId} onClose={() => setDetailPlayerId(null)} />
      )}
    </div>
  );
}
