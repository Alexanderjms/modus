"use client";

import { useState } from "react";
import styles from "./suggestion-bulk-bar.module.css";

export function SuggestionBulkBar({
  count,
  disabled,
  onAcceptAll,
}: {
  count: number;
  disabled: boolean;
  onAcceptAll: () => Promise<string | null>;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    const failure = await onAcceptAll();
    if (failure) setError(failure);
    setRunning(false);
  }

  return (
    <div className={styles.bar} role="group" aria-label="Acciones para todas las propuestas">
      <span className={styles.label}>
        <i aria-hidden="true" className="bi bi-stars" />
        {count} propuestas pendientes
      </span>
      <button type="button" disabled={disabled || running} aria-busy={running || undefined} onClick={() => void run()}>
        {running ? "Aplicando…" : "Aceptar todo"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
