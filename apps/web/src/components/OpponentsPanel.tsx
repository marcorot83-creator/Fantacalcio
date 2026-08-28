import { useEffect, useState } from "react";
import { api } from "../api";
import type { OpponentReport } from "@fanta/shared";

export default function OpponentsPanel({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [reports, setReports] = useState<OpponentReport[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api.opponents(sessionId).then(setReports);
  }, [sessionId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2>Avversari</h2>
          <button onClick={onClose}>Chiudi</button>
        </div>

        {!reports ? (
          "Caricamento…"
        ) : (
          <div className="opponents-list">
            {reports.map((r) => {
              const spentPct = Math.round(((r.budgetInitial - r.budgetResidual) / Math.max(1, r.budgetInitial)) * 100);
              const isOpen = openId === r.managerId;
              return (
                <div className="opponent-card" key={r.managerId}>
                  <div className="opponent-head" onClick={() => setOpenId(isOpen ? null : r.managerId)}>
                    <div className="opponent-name">{r.name}</div>
                    <div className="opponent-budget">
                      <div className="budget-bar"><div className="budget-bar-fill" style={{ width: `${spentPct}%` }} /></div>
                      <span className="muted">{r.budgetResidual}/{r.budgetInitial} · {r.slotsFilled}/{r.slotsTotal} giocatori</span>
                    </div>
                    <div className="opponent-tags">
                      {r.style.length === 0 && <span className="tag muted">stile non ancora chiaro</span>}
                      {r.style.map((s, i) => (
                        <span className="tag" key={i} title={`confidenza ${Math.round(s.confidence * 100)}%`}>{s.label}</span>
                      ))}
                    </div>
                    <button className="opponent-toggle">{isOpen ? "Nascondi rosa" : "Vedi rosa"}</button>
                  </div>
                  {isOpen && (
                    <div className="opponent-roster">
                      {r.players.length === 0 ? (
                        <div className="muted" style={{ padding: "8px 0" }}>Nessun acquisto ancora.</div>
                      ) : (
                        <table className="listone-table">
                          <thead>
                            <tr><th>Giocatore</th><th>Squadra</th><th>Ruolo</th><th>Prezzo</th></tr>
                          </thead>
                          <tbody>
                            {r.players.map((p) => (
                              <tr key={p.playerId}>
                                <td className="strong">{p.nome}</td>
                                <td className="muted">{p.squadra}</td>
                                <td className="muted">{p.famiglia}</td>
                                <td>{p.paidPrice}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: 14 }}>
          Lo stile è una stima probabilistica basata sui prezzi osservati, non un dato certo (sezione 41).
        </p>
      </div>
    </div>
  );
}
