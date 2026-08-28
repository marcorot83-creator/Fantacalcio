import { useEffect, useState } from "react";
import { api } from "../api";
import type { Famiglia433, Player } from "@fanta/shared";

const FAMIGLIE: { key: Famiglia433 | ""; label: string }[] = [
  { key: "", label: "Tutti" },
  { key: "Por", label: "Por" },
  { key: "Dd", label: "Dd" },
  { key: "Ds", label: "Ds" },
  { key: "Dc", label: "Dc" },
  { key: "Jolly", label: "Jolly" },
  { key: "A", label: "A" },
  { key: "C", label: "C" },
  { key: "M", label: "M" },
  { key: "Pc", label: "Pc" },
];

const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: "indiceFanta", label: "Indice Fanta" },
  { key: "indiceAffare", label: "Indice Affare" },
  { key: "prezzoObiettivo", label: "Prezzo obiettivo" },
  { key: "offertaMax", label: "Offerta max" },
  { key: "titolarita", label: "Titolarità" },
  { key: "gemScore", label: "Gem score" },
  { key: "quot", label: "Quotazione" },
];

export default function Listone(props: {
  sessionId: string;
  onClose: () => void;
  onNominate: (player: Player) => void;
  onDetail: (playerId: string) => void;
  initialFamiglia?: Famiglia433;
  readOnly?: boolean;
}) {
  const [famiglia, setFamiglia] = useState<Famiglia433 | "">(props.initialFamiglia ?? "");
  const [sortBy, setSortBy] = useState("indiceFanta");
  const [q, setQ] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .listone(props.sessionId, { famiglia: famiglia || undefined, sortBy, order: "desc", q: q || undefined, limit: 300 })
        .then((res) => {
          if (cancelled) return;
          setPlayers(res.players);
          setCount(res.count);
        })
        .finally(() => !cancelled && setLoading(false));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [props.sessionId, famiglia, sortBy, q]);

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2>Listone — giocatori ancora liberi</h2>
          <button onClick={props.onClose}>Chiudi</button>
        </div>

        <div className="listone-tabs">
          {FAMIGLIE.map((f) => (
            <button
              key={f.key || "tutti"}
              className={famiglia === f.key ? "primary" : ""}
              onClick={() => setFamiglia(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="listone-controls">
          <input placeholder="Cerca nome…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>Ordina per {s.label}</option>
            ))}
          </select>
          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            {loading ? "Caricamento…" : `${count} disponibili`}
          </span>
        </div>

        <div className="listone-table-wrap">
          <table className="listone-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Squadra</th>
                <th>Ruolo</th>
                <th>Tit.%</th>
                <th>Fascia</th>
                <th>Tier</th>
                <th>Ind. Fanta</th>
                <th>Atteso</th>
                <th>Target</th>
                <th>Max</th>
                <th>Rischio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td className="strong">{p.nome}</td>
                  <td className="muted">{p.squadra}</td>
                  <td className="muted">{p.ruoloMantra}</td>
                  <td>{p.computed.titolarita}%</td>
                  <td>{p.computed.fascia}</td>
                  <td>{p.computed.tierGruppo}</td>
                  <td>{p.computed.indiceFanta}</td>
                  <td>{p.computed.prezzoAtteso}</td>
                  <td>{p.computed.prezzoObiettivo}</td>
                  <td>{p.computed.offertaMaxBase}</td>
                  <td className={p.rischio && p.rischio !== "BASSO" ? "warn" : "muted"}>{p.rischio || "-"}</td>
                  <td className="listone-actions">
                    <button onClick={() => props.onDetail(p.id)}>Dettagli</button>
                    <button className="primary" disabled={props.readOnly} onClick={() => props.onNominate(p)}>Chiama</button>
                  </td>
                </tr>
              ))}
              {!loading && players.length === 0 && (
                <tr>
                  <td colSpan={12} className="empty-state">Nessun giocatore trovato.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
