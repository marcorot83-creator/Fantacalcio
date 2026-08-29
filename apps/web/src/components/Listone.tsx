import { useEffect, useState } from "react";
import { api, type ListonePlayer } from "../api";
import type { MantraRole, Player } from "@fanta/shared";

// Full fine-grained Mantra role set, pitch order — not the coarse
// Famiglia433 taxonomy (which collapses B/E/T/W into a single "Jolly"
// bucket and so can't isolate them). Kept as plain literals here rather
// than importing a value from @fanta/shared (its CJS barrel isn't
// statically analyzable by Rollup for named-export bundling).
const RUOLI: { key: MantraRole | ""; label: string; title?: string }[] = [
  { key: "", label: "Tutti" },
  { key: "Por", label: "Por" },
  { key: "Dd", label: "Dd" },
  { key: "Ds", label: "Ds" },
  { key: "Dc", label: "Dc" },
  { key: "B", label: "B", title: "Braccetto" },
  { key: "E", label: "E", title: "Esterno" },
  { key: "M", label: "M" },
  { key: "C", label: "C" },
  { key: "T", label: "T", title: "Trequartista" },
  { key: "W", label: "W", title: "Ala" },
  { key: "A", label: "A" },
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
  initialRuolo?: MantraRole;
  readOnly?: boolean;
}) {
  const [ruolo, setRuolo] = useState<MantraRole | "">(props.initialRuolo ?? "");
  const [squadra, setSquadra] = useState("");
  const [teams, setTeams] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("indiceFanta");
  const [q, setQ] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [players, setPlayers] = useState<ListonePlayer[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.teams().then(setTeams);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .listone(props.sessionId, {
          ruolo: ruolo || undefined, squadra: squadra || undefined, sortBy, order: "desc", q: q || undefined, limit: 300,
          onlyAvailable: onlyAvailable ? "true" : undefined,
        })
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
  }, [props.sessionId, ruolo, squadra, sortBy, q, onlyAvailable]);

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2>Listone</h2>
          <button onClick={props.onClose}>Chiudi</button>
        </div>

        <div className="listone-tabs">
          {RUOLI.map((f) => (
            <button
              key={f.key || "tutti"}
              className={ruolo === f.key ? "primary" : ""}
              title={f.title}
              onClick={() => setRuolo(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="listone-controls">
          <input placeholder="Cerca nome…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={squadra} onChange={(e) => setSquadra(e.target.value)}>
            <option value="">Tutte le squadre</option>
            {teams.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>Ordina per {s.label}</option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "var(--muted)" }}>
            <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
            solo disponibili
          </label>
          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            {loading ? "Caricamento…" : `${count} giocatori`}
          </span>
          <span className="listone-legend">
            <span className="legend-dot legend-me" /> presi da te
            <span className="legend-dot legend-other" /> presi da altri
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
              {players.map((p) => {
                const taken = !!p.ownership;
                const rowClass = p.ownership ? (p.ownership.byMe ? "listone-row-me" : "listone-row-other") : "";
                return (
                  <tr key={p.id} className={rowClass}>
                    <td className="strong">
                      {p.nome}
                      {p.ownership && (
                        <div className="listone-owner">
                          {p.ownership.byMe ? "tua" : p.ownership.managerName ?? "altro manager"}
                          {p.ownership.paidPrice != null ? ` · ${p.ownership.paidPrice}` : ""}
                        </div>
                      )}
                    </td>
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
                      <button className="primary" disabled={props.readOnly || taken} onClick={() => props.onNominate(p)}>Chiama</button>
                    </td>
                  </tr>
                );
              })}
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
