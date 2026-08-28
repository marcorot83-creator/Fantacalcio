import { useEffect, useState } from "react";
import { api, type SetupOptions, type SetupPreview } from "../api";
import type { AuctionSession, FormationId, StrategyId, AuctionStyleId } from "@fanta/shared";

const STEP_TITLES = ["Configurazione", "Modulo", "Strategia", "Stile", "Partecipanti", "Riepilogo"];

export default function Wizard(props: { onCreated: (session: AuctionSession) => void; onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [partecipanti, setPartecipanti] = useState(12);
  const [crediti, setCrediti] = useState(500);
  const [giocatoriMovimento, setGiocatoriMovimento] = useState(25);
  const [portieri, setPortieri] = useState(3);
  const [managerNames, setManagerNames] = useState<string[]>(["Io", ...Array.from({ length: 11 }, (_, i) => `Manager ${i + 2}`)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [options, setOptions] = useState<SetupOptions | null>(null);
  const [primaryFormation, setPrimaryFormation] = useState<FormationId>("4-3-3");
  const [strategyProfile, setStrategyProfile] = useState<StrategyId>("BOMBER_GEMS");
  const [auctionStyle, setAuctionStyle] = useState<AuctionStyleId>("MEDIUM");
  const [preview, setPreview] = useState<SetupPreview | null>(null);

  useEffect(() => {
    api.setupOptions().then(setOptions);
  }, []);

  useEffect(() => {
    if (step !== 5) return;
    api.setupPreview({ formation: primaryFormation, strategy: strategyProfile, crediti, giocatoriMovimento, portieri }).then(setPreview);
  }, [step, primaryFormation, strategyProfile, crediti, giocatoriMovimento, portieri]);

  function updateManagerCount(n: number) {
    setPartecipanti(n);
    setManagerNames((prev) => {
      const next = [...prev];
      while (next.length < n) next.push(`Manager ${next.length + 1}`);
      return next.slice(0, n);
    });
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const session = await api.createSession({
        name: name || undefined,
        settings: { partecipanti, crediti, giocatoriMovimento, portieri, primaryFormation, strategyProfile, auctionStyle },
        managerNames,
        myManagerIndex: 0,
      });
      props.onCreated(session);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const selectedStyle = options?.styles.find((s) => s.id === auctionStyle);
  const selectedStrategy = options?.strategies.find((s) => s.id === strategyProfile);

  return (
    <div className="wizard wizard-wide">
      <div className="steps">
        {STEP_TITLES.map((_, i) => <div key={i} className={i <= step ? "active" : ""} />)}
      </div>
      <div className="wizard-step-label">{STEP_TITLES[step]}</div>

      {step === 0 && (
        <>
          <h2>Configurazione</h2>
          <div className="field">
            <label>Nome asta (facoltativo)</label>
            <input placeholder={`Asta – ${new Date().toLocaleString("it-IT")}`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="row3">
            <div className="field">
              <label>Partecipanti</label>
              <input type="number" value={partecipanti} onChange={(e) => updateManagerCount(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Crediti</label>
              <input type="number" value={crediti} onChange={(e) => setCrediti(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Giocatori movimento</label>
              <input type="number" value={giocatoriMovimento} onChange={(e) => setGiocatoriMovimento(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Portieri</label>
              <input type="number" value={portieri} onChange={(e) => setPortieri(Number(e.target.value))} />
            </div>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h2>Modulo Mantra</h2>
          <p className="wizard-hint">Il modulo principale attorno a cui costruire l'asta: determina di quali ruoli hai davvero bisogno.</p>
          <div className="formation-grid">
            {(options?.formations ?? []).map((f) => (
              <button
                key={f.id}
                className={`formation-card ${primaryFormation === f.id ? "selected" : ""}`}
                onClick={() => setPrimaryFormation(f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h2>Strategia di costruzione</h2>
          <p className="wizard-hint">Dove concentrare il valore della rosa.</p>
          <div className="strategy-cards">
            {(options?.strategies ?? []).map((s) => (
              <button
                key={s.id}
                className={`strategy-card ${strategyProfile === s.id ? "selected" : ""}`}
                onClick={() => setStrategyProfile(s.id)}
              >
                <div className="strategy-card-name">{s.name}</div>
                <div className="strategy-card-desc">{s.description}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h2>Stile d'asta</h2>
          <p className="wizard-hint">Quanto sei disposto a spingerti economicamente per i tuoi obiettivi.</p>
          <div className="style-cards">
            {(options?.styles ?? []).map((s) => (
              <button
                key={s.id}
                className={`style-card ${auctionStyle === s.id ? "selected" : ""}`}
                onClick={() => setAuctionStyle(s.id)}
              >
                <div className="strategy-card-name">{s.name}</div>
                <div className="strategy-card-desc">{s.description}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <h2>Partecipanti</h2>
          <p className="wizard-hint">Il primo nome è la tua squadra. I nomi verranno riconosciuti dalla chat.</p>
          <div className="managers">
            {managerNames.map((n, i) => (
              <input
                key={i}
                value={n}
                onChange={(e) => setManagerNames((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))}
                placeholder={i === 0 ? "Io" : `Manager ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}

      {step === 5 && (
        <>
          <h2>Riepilogo</h2>
          <div className="summary-config">
            <div><span className="label">MODULO</span>{options?.formations.find((f) => f.id === primaryFormation)?.name}</div>
            <div><span className="label">STRATEGIA</span>{selectedStrategy?.name}</div>
            <div><span className="label">STILE</span>{selectedStyle?.name}</div>
          </div>

          {preview && (
            <>
              <h3>Priorità principali</h3>
              <div className="priorities">
                {preview.priorities.map((p) => (
                  <div key={p.role} className="priority-row">
                    <span className="priority-role">{p.role}</span>
                    <span className="priority-stars">{"★".repeat(p.stars)}{"☆".repeat(5 - p.stars)}</span>
                  </div>
                ))}
              </div>

              <h3>Distribuzione indicativa dei {preview.totalBudget} crediti</h3>
              <div className="budget-breakdown">
                {Object.entries(preview.perFamiglia).map(([fam, val]) => (
                  <div key={fam} className="budget-row">
                    <span>{fam}</span>
                    <div className="budget-row-bar"><div style={{ width: `${(val / preview.totalBudget) * 100}%` }} /></div>
                    <span>{val}</span>
                  </div>
                ))}
              </div>

              <h3>Filosofia</h3>
              <p className="wizard-hint">{selectedStrategy?.description}</p>
            </>
          )}
          {error && <p style={{ color: "var(--red)" }}>{error}</p>}
        </>
      )}

      <div className="actions">
        <button onClick={step === 0 ? props.onCancel : () => setStep((s) => s - 1)}>
          {step === 0 ? "Annulla" : "Indietro"}
        </button>
        {step < 5 ? (
          <button className="primary" onClick={() => setStep((s) => s + 1)}>Avanti</button>
        ) : (
          <button className="primary" disabled={busy} onClick={handleCreate}>
            {busy ? "Creazione…" : "INIZIA ASTA"}
          </button>
        )}
      </div>
    </div>
  );
}
