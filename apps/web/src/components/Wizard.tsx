import { useState } from "react";
import { api } from "../api";
import type { AuctionSession } from "@fanta/shared";

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
        settings: { partecipanti, crediti, giocatoriMovimento, portieri, modulo: "4-3-3", strategia: "BOMBER_GIOIELLI" },
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

  return (
    <div className="wizard">
      <div className="steps">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className={i <= step ? "active" : ""} />)}
      </div>

      {step === 0 && (
        <>
          <h2>Nome asta</h2>
          <div className="field">
            <label>Nome (facoltativo)</label>
            <input placeholder={`Asta – ${new Date().toLocaleString("it-IT")}`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h2>Configurazione</h2>
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
              <label>Modulo</label>
              <input value="4-3-3" disabled />
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

      {step === 2 && (
        <>
          <h2>Partecipanti</h2>
          <p style={{ color: "var(--muted)" }}>Il primo nome è la tua squadra. I nomi verranno riconosciuti dalla chat.</p>
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

      {step === 3 && (
        <>
          <h2>Strategia</h2>
          <div className="field">
            <label>Strategia di asta</label>
            <select disabled value="BOMBER_GIOIELLI">
              <option value="BOMBER_GIOIELLI">Bomber + Gioielli</option>
            </select>
          </div>
          <p style={{ color: "var(--muted)" }}>
            Concentra budget su pochi giocatori differenziali (bomber/A top) e recupera crediti con titolari di
            provincia, coppie e scommesse low cost. Altre strategie arriveranno in una versione futura.
          </p>
        </>
      )}

      {step === 4 && (
        <>
          <h2>Pronti</h2>
          <p style={{ color: "var(--muted)" }}>
            {partecipanti} partecipanti, {crediti} crediti, {giocatoriMovimento + portieri} giocatori a rosa. Strategia
            Bomber + Gioielli. Database giocatori e graduatorie sono già caricati.
          </p>
          {error && <p style={{ color: "var(--red)" }}>{error}</p>}
        </>
      )}

      <div className="actions">
        <button onClick={step === 0 ? props.onCancel : () => setStep((s) => s - 1)}>
          {step === 0 ? "Annulla" : "Indietro"}
        </button>
        {step < 4 ? (
          <button className="primary" onClick={() => setStep((s) => s + 1)}>Avanti</button>
        ) : (
          <button className="primary" disabled={busy} onClick={handleCreate}>
            {busy ? "Creazione…" : "ENTRA NELL'ASTA"}
          </button>
        )}
      </div>
    </div>
  );
}
