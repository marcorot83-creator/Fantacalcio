import { useEffect, useState } from "react";
import { api } from "../api";
import type { AlternativeSuggestion } from "@fanta/shared";

export default function AlternativesPanel({
  sessionId, playerId, onSelect,
}: { sessionId: string; playerId: string; onSelect: (id: string) => void }) {
  const [alts, setAlts] = useState<AlternativeSuggestion[]>([]);

  useEffect(() => {
    api.alternatives(sessionId, playerId, 5).then(setAlts);
  }, [sessionId, playerId]);

  return (
    <>
      <h3>Alternative</h3>
      {alts.length === 0 && <div className="empty-state">Nessuna alternativa disponibile.</div>}
      {alts.map((a) => (
        <div className="alt-item" key={a.playerId} onClick={() => onSelect(a.playerId)}>
          <div className="top"><span>{a.nome}</span><span>{a.score}</span></div>
          <div className="sub">{a.squadra} · target {a.prezzoObiettivo} · max {a.offertaMax} · {a.rischio}</div>
          <div className="sub">{a.note}</div>
        </div>
      ))}
    </>
  );
}
