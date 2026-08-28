import { useEffect, useRef, useState } from "react";

export interface ChatMsg { role: "user" | "bot"; text: string; pendingEvent?: any }

export default function Chat({
  log, onSend, onConfirmPending,
}: { log: ChatMsg[]; onSend: (text: string) => void; onConfirmPending: (pending: any) => void }) {
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  function submit() {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  }

  return (
    <div className="chat-footer">
      <div className="chat-log" ref={logRef}>
        {log.length === 0 && (
          <div className="chat-msg bot">
            Dimmi chi viene chiamato. Esempi: "Chiamano Malen", "Siamo a 137", "Preso Hojlund a 140", "Chi chiamo?",
            "Quanto posso spendere per Orsolini?"
          </div>
        )}
        {log.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <b>{m.role === "user" ? "Tu" : "Copilota"}:</b> {m.text}
            {m.pendingEvent && (
              <div className="pending-confirm">
                <span>Confermi?</span>
                <span>
                  <button className="primary" onClick={() => onConfirmPending(m.pendingEvent)}>Conferma</button>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder='Scrivi qui (es. "Malen è a 145" oppure "/rosa")'
        />
        <button className="primary" onClick={submit}>Invia</button>
      </div>
    </div>
  );
}
