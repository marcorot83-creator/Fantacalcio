import { useEffect, useState } from "react";
import { api } from "../api";
import type { PairingInfo, Player, PlayerIntelligence } from "@fanta/shared";

const LINEUP_LABELS: Record<string, string> = {
  NAILED: "Titolare inamovibile", STRONG_STARTER: "Titolare forte", FAVORITE: "Favorito",
  BALLOT: "Ballottaggio", BACKUP: "Riserva", FRINGE: "Ai margini",
};

const SET_PIECE_LABELS: Record<string, string> = { PRIMARY: "primario", SECONDARY: "secondario", OCCASIONAL: "occasionale", NONE: "nessuno" };

export default function PlayerDetailModal({
  sessionId, playerId, onClose,
}: { sessionId: string; playerId: string; onClose: () => void }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [why, setWhy] = useState<string[]>([]);
  const [pairings, setPairings] = useState<PairingInfo[]>([]);
  const [intel, setIntel] = useState<PlayerIntelligence | null>(null);

  useEffect(() => {
    api.player(playerId).then(setPlayer);
    api.why(sessionId, playerId).then((r) => setWhy(r.reasons));
    api.pairing(playerId).then(setPairings);
    setIntel(null);
    api.playerIntelligence(playerId).then(setIntel).catch(() => setIntel(null));
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

            {intel && (
              <>
                <h3>Gerarchia</h3>
                <div className="metrics">
                  <div className="metric"><div className="label">Titolarità</div><div className="value">{intel.lineup.starterProbability}%</div></div>
                  <div className="metric"><div className="label">Status</div><div className="value" style={{ fontSize: "0.95rem" }}>{LINEUP_LABELS[intel.lineup.category] ?? intel.lineup.category}</div></div>
                </div>

                {(intel.penalty.rank != null || intel.setPieces.setPieceValueScore > 0) && (
                  <>
                    <h3>Bonus</h3>
                    <div className="metrics">
                      <div className="metric"><div className="label">Rigorista</div><div className="value">{intel.penalty.rank ? `#${intel.penalty.rank}` : "—"}</div></div>
                      <div className="metric"><div className="label">Corner</div><div className="value" style={{ fontSize: "0.85rem" }}>{SET_PIECE_LABELS[intel.setPieces.cornerRole]}</div></div>
                      <div className="metric"><div className="label">Punizioni</div><div className="value" style={{ fontSize: "0.85rem" }}>{SET_PIECE_LABELS[intel.setPieces.directFreeKickRole]}</div></div>
                      <div className="metric"><div className="label">Ind. punizioni</div><div className="value" style={{ fontSize: "0.85rem" }}>{SET_PIECE_LABELS[intel.setPieces.indirectFreeKickRole]}</div></div>
                    </div>
                  </>
                )}

                <h3>Goal Threat</h3>
                <div className="metrics">
                  <div className="metric"><div className="label">Goal Threat</div><div className="value">{intel.goalThreat.confidence === "NONE" ? "n/d" : `${intel.goalThreat.index}/100`}</div></div>
                  <div className="metric"><div className="label">Percentile ruolo</div><div className="value">{intel.goalThreat.confidence === "NONE" ? "n/d" : `${intel.goalThreat.percentileWithinRole}°`}</div></div>
                  <div className="metric"><div className="label">Confidence</div><div className="value" style={{ fontSize: "0.85rem" }}>{intel.goalThreat.confidence}</div></div>
                  <div className="metric"><div className="label">Bonus Potential</div><div className="value">{intel.penalty.rank == null && intel.setPieces.setPieceValueScore === 0 && intel.goalThreat.confidence === "NONE" ? "n/d" : intel.bonusPotential.score}</div></div>
                </div>
                {intel.goalThreat.confidence === "NONE" && (
                  <p className="wizard-hint">Nessun dato importato su gol/xG per questo giocatore: nessuna conclusione forzata.</p>
                )}
                {intel.updatedAt && (
                  <p style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                    Player Intelligence aggiornata: {new Date(intel.updatedAt).toLocaleString("it-IT")} ({intel.goalThreat.staleness.toLowerCase()})
                    {intel.manualOverride && " · override manuale attivo"}
                  </p>
                )}
              </>
            )}

            {pairings.length > 0 && (
              <>
                <h3>Ballottaggio / coppia</h3>
                <ul>
                  {pairings.map((p, i) => (
                    <li key={i}>
                      {(p.tipo || "").toLowerCase().includes("ballottaggio") ? "In ballottaggio con" : "Abbinato a"}{" "}
                      <b style={{ color: "var(--text)" }}>{p.competitorName}</b>
                      {p.ruoloCompetitor ? ` (${p.ruoloCompetitor})` : ""}
                      {p.nota ? ` — ${p.nota}` : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}

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
