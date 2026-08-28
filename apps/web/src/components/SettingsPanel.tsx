import { useEffect, useState } from "react";
import { api, type DashboardConfig, type FormationSimulation, type SetupOptions } from "../api";
import type { AuctionSession, FormationId, StrategyId, AuctionStyleId } from "@fanta/shared";

export default function SettingsPanel({
  sessionId, readOnly, onClose, onSessionUpdated,
}: { sessionId: string; readOnly: boolean; onClose: () => void; onSessionUpdated: (s: AuctionSession) => void }) {
  const [options, setOptions] = useState<SetupOptions | null>(null);
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingFormation, setPendingFormation] = useState<FormationId | null>(null);
  const [formationPreview, setFormationPreview] = useState<FormationSimulation | null>(null);

  function load() {
    api.setupOptions().then(setOptions);
    api.dashboardConfig(sessionId).then(setConfig);
  }

  useEffect(load, [sessionId]);

  async function handleStrategyChange(strategyProfile: StrategyId) {
    if (readOnly || busy) return;
    setBusy(true);
    try {
      const s = await api.setStrategy(sessionId, strategyProfile);
      onSessionUpdated(s);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleStyleChange(auctionStyle: AuctionStyleId) {
    if (readOnly || busy) return;
    setBusy(true);
    try {
      const s = await api.setStyle(sessionId, auctionStyle);
      onSessionUpdated(s);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleFormationClick(formationId: FormationId) {
    if (readOnly || busy || formationId === config?.formation.id) return;
    setBusy(true);
    try {
      const preview = await api.simulateFormation(sessionId, formationId);
      setPendingFormation(formationId);
      setFormationPreview(preview);
    } finally {
      setBusy(false);
    }
  }

  async function confirmFormationChange() {
    if (!pendingFormation) return;
    setBusy(true);
    try {
      const s = await api.setFormation(sessionId, pendingFormation);
      onSessionUpdated(s);
      setPendingFormation(null);
      setFormationPreview(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Configurazione asta</h2>
        {!config || !options ? (
          "Caricamento…"
        ) : (
          <>
            <div className="summary-config">
              <div><span className="label">MODULO</span>{config.formation.name}</div>
              <div><span className="label">STRATEGIA</span>{config.strategy.name} <span style={{ color: "var(--muted)" }}>— {config.strategy.description}</span></div>
              <div><span className="label">STILE</span>{config.style.name} <span style={{ color: "var(--muted)" }}>— {config.style.description}</span></div>
            </div>

            {readOnly && <p className="wizard-hint">Asta non in corso: i cambi di configurazione sono disattivati.</p>}

            <h3>Modulo Mantra</h3>
            <p className="wizard-hint">Cambiare modulo ristruttura i target di rosa: richiede conferma.</p>
            <div className="formation-grid">
              {options.formations.map((f) => (
                <button
                  key={f.id}
                  className={`formation-card ${config.formation.id === f.id ? "selected" : ""}`}
                  disabled={readOnly || busy}
                  onClick={() => handleFormationClick(f.id)}
                >
                  {f.name}
                </button>
              ))}
            </div>

            {formationPreview && pendingFormation && (
              <div className="pending-confirm" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <div>{formationPreview.summary}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="primary" disabled={busy} onClick={confirmFormationChange}>Applica cambio modulo</button>
                  <button disabled={busy} onClick={() => { setPendingFormation(null); setFormationPreview(null); }}>Annulla</button>
                </div>
              </div>
            )}

            <h3>Strategia di costruzione</h3>
            <div className="strategy-cards">
              {options.strategies.map((s) => (
                <button
                  key={s.id}
                  className={`strategy-card ${config.strategy.id === s.id ? "selected" : ""}`}
                  disabled={readOnly || busy}
                  onClick={() => handleStrategyChange(s.id)}
                >
                  <div className="strategy-card-name">{s.name}</div>
                  <div className="strategy-card-desc">{s.description}</div>
                </button>
              ))}
            </div>

            <h3>Stile d'asta</h3>
            <div className="style-cards">
              {options.styles.map((s) => (
                <button
                  key={s.id}
                  className={`style-card ${config.style.id === s.id ? "selected" : ""}`}
                  disabled={readOnly || busy}
                  onClick={() => handleStyleChange(s.id)}
                >
                  <div className="strategy-card-name">{s.name}</div>
                  <div className="strategy-card-desc">{s.description}</div>
                </button>
              ))}
            </div>

            {config.secondaryFormationCompatibility.length > 0 && (
              <>
                <h3>Compatibilità rosa con altri moduli</h3>
                <div className="priorities">
                  {config.secondaryFormationCompatibility.map((c) => (
                    <div key={c.formationId} className="priority-row">
                      <span className="priority-role">{options.formations.find((f) => f.id === c.formationId)?.name ?? c.formationId}</span>
                      <span>{c.pct}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        <button onClick={onClose} style={{ marginTop: 16 }}>Chiudi</button>
      </div>
    </div>
  );
}
