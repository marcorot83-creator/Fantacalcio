import { useState } from "react";
import { api, type SessionSummary } from "./../api";

export default function Home(props: {
  sessions: SessionSummary[];
  onNewAuction: () => void;
  onOpen: (id: string) => void;
  onRefresh: () => Promise<SessionSummary[]>;
}) {
  const { sessions, onNewAuction, onOpen, onRefresh } = props;
  const [confirming, setConfirming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const liveSession = sessions.find((s) => s.status === "LIVE");

  function requestNewAuction() {
    if (liveSession) setConfirming(true);
    else onNewAuction();
  }

  async function handleSalvaEInizia() {
    if (liveSession) await api.archiveSession(liveSession.id);
    setConfirming(false);
    onNewAuction();
  }

  async function handleEsportaEInizia() {
    if (liveSession) {
      const full = await api.session(liveSession.id);
      const blob = new Blob([JSON.stringify(full, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${full.name.replace(/\s+/g, "_")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await api.archiveSession(liveSession.id);
    }
    setConfirming(false);
    onNewAuction();
  }

  async function handleEliminaEInizia() {
    if (liveSession) await api.deleteSession(liveSession.id);
    setConfirming(false);
    onNewAuction();
  }

  async function handleDeleteArchived(id: string) {
    await api.deleteSession(id);
    setConfirmingDelete(null);
    onRefresh();
  }

  return (
    <div className="home">
      <h1>Asta Mantra 4-3-3 — Copilota</h1>
      <div className="sub">Database giocatori, graduatorie e strategia sono permanenti: ogni asta è una sessione indipendente.</div>

      <button className="primary big" style={{ width: "100%" }} onClick={requestNewAuction}>
        INIZIA NUOVA ASTA
      </button>

      {confirming && (
        <div className="modal-backdrop" onClick={() => setConfirming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Vuoi iniziare una nuova asta?</h2>
            <p style={{ color: "var(--muted)" }}>
              La sessione corrente ({liveSession?.name}) verrà chiusa e ne verrà creata una nuova. Database
              giocatori, graduatorie e strategia non verranno modificati.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
              <button className="primary" onClick={handleSalvaEInizia}>SALVA E INIZIA NUOVA ASTA</button>
              <button onClick={handleEsportaEInizia}>ESPORTA E INIZIA NUOVA ASTA</button>
              <button className="danger" onClick={handleEliminaEInizia}>ELIMINA E INIZIA NUOVA ASTA</button>
              <button onClick={() => setConfirming(false)}>ANNULLA</button>
            </div>
          </div>
        </div>
      )}

      <h3 className="home-archive-title">Archivio aste</h3>
      <div className="session-list">
        {sessions.length === 0 && <div className="empty-state">Nessuna asta ancora. Comincia con "Inizia nuova asta".</div>}
        {sessions.map((s) => (
          <div className="session-row" key={s.id}>
            <div>
              <div className="name">{s.name}</div>
              <div className="meta">{new Date(s.createdAt).toLocaleString("it-IT")}</div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className={`badge ${s.status === "LIVE" ? "live" : "archived"}`}>{s.status}</span>
              <button onClick={() => onOpen(s.id)}>{s.status === "LIVE" ? "Continua" : "Apri (sola lettura)"}</button>
              {s.status !== "LIVE" &&
                (confirmingDelete === s.id ? (
                  <button className="danger" onClick={() => handleDeleteArchived(s.id)}>Conferma elimina</button>
                ) : (
                  <button onClick={() => setConfirmingDelete(s.id)}>Elimina</button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
