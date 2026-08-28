import { useEffect, useState } from "react";
import { api } from "../api";
import type { Player } from "@fanta/shared";

export default function PlayerSearch({ onSelect, disabled }: { onSelect: (p: Player) => void; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Player[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api.players({ q, limit: 10 }).then(setResults);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="search-box">
      <input
        placeholder="Cerca un giocatore…"
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
      />
      {results.length > 0 && (
        <div className="search-results">
          {results.map((p) => (
            <div
              key={p.id}
              className="item"
              onClick={() => { onSelect(p); setQ(""); setResults([]); }}
            >
              <span>{p.nome} <span style={{ color: "var(--muted)" }}>({p.squadra})</span></span>
              <span style={{ color: "var(--muted)" }}>{p.ruoloMantra} · target {p.computed.prezzoObiettivo}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
