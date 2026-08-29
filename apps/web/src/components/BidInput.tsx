import { useEffect, useRef, useState } from "react";

/**
 * Section 39-42 of the marginal-value correction: a real free-text numeric
 * input for "Prezzo attuale" during a live auction — type over the whole
 * value, Enter/blur to commit, no spinner-driven workflow required.
 *
 * Keeps a local editing buffer so an external recompute (a new
 * recommendation, another player selected) never overwrites what the user
 * is mid-typing: the buffer only re-syncs from `value` while the field is
 * not focused.
 */
export default function BidInput({
  value, onCommit, disabled, autoFocus,
}: { value: number; onCommit: (n: number) => void; disabled?: boolean; autoFocus?: boolean }) {
  const [draft, setDraft] = useState(String(value));
  const editingRef = useRef(false);

  useEffect(() => {
    if (!editingRef.current) setDraft(String(value));
  }, [value]);

  function commit() {
    editingRef.current = false;
    const n = Math.max(0, Math.floor(Number(draft) || 0));
    setDraft(String(n));
    if (n !== value) onCommit(n);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoFocus={autoFocus}
      value={draft}
      disabled={disabled}
      onFocus={(e) => {
        editingRef.current = true;
        e.target.select();
      }}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || /^\d+$/.test(v)) setDraft(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      onBlur={commit}
    />
  );
}
