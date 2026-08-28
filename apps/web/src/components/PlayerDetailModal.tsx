import { useEffect, useState } from "react";
import { api } from "../api";
import type { Player } from "@fanta/shared";

export default function PlayerDetailModal({
  sessionId, playerId, onClose,
}: { sessionId: string; playerId: string; onClose: () => void }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [why, setWhy] = useState<string[]>([]);

  useEffect(() => {
    api.player(playerId).then(setPlayer);
    api.why(sessionId, playerId).then((r) => setWhy(r.reasons));
  }, [sessionId, playerId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {!player ? (
          "Caricamento…"
        ) : (
          <>
            <h2>{player.nome} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({player.squadra})</span></h2>
            <div className="tags">
              <span className="tag">{player.ruoloMantra}</span>
              <span className="tag">{player.computed.famiglia433}</span>
              <span className="tag">{player.computed.tierGruppo}</span>
              <span className="tag">Fascia {player.computed.fascia}</span>
              <span className="tag">{player.computed.miaMossa}</span>
            </div>
            <div className="metrics">
              <div className="metric"><div className="label">Titolarità</div><div className="value">{player.computed.titolarita}%</div></div>
              <div className="metric"><div className="label">Indice Fanta</div><div className="value">{player.computed.indiceFanta}</div></div>
              <div className="metric"><div className="label">Indice Affare</div><div className="value">{player.computed.indiceAffare}</div></div>
              <div className="metric"><div className="label">Rischio</div><div className="value">{player.rischio || "-"}</div></div>
              <div className="metric"><div className="label">Prezzo atteso</div><div className="value">{player.computed.prezzoAtteso}</div></div>
              <div className="metric"><div className="label">Target</div><div className="value">{player.computed.prezzoObiettivo}</div></div>
              <div className="metric"><div className="label">Walk-away cap</div><div className="value">{player.computed.offertaMaxBase}</div></div>
              <div className="metric"><div className="label">Gem score</div><div className="value">{player.computed.gemScore}</div></div>
            </div>
            <p style={{ color: "var(--muted)" }}>{player.motivoSintetico}</p>

            <h3>Perché comprarlo nella mia rosa?</h3>
            <ul>{why.map((w, i) => <li key={i}>{w}</li>)}</ul>

            {player.fontiTitolarita && (
              <p style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                Fonti: {player.fontiTitolarita.split(" | ").map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 6 }}>[{i + 1}]</a>
                ))}
              </p>
            )}

            <button className="primary" onClick={onClose} style={{ marginTop: 12 }}>Chiudi</button>
          </>
        )}
      </div>
    </div>
  );
}
