"use client";

import styles from "./board.module.css";

export function BoardFilter({
  priority,
  onPriority,
}: {
  priority: string;
  onPriority: (value: string) => void;
}) {
  return (
    <details className={styles.filter}>
      <summary>
        <i aria-hidden="true" className="bi bi-funnel" />
        Filtrar
      </summary>
      <label>
        Prioridad
        <select
          aria-label="Filtrar por prioridad"
          value={priority}
          onChange={(event) => onPriority(event.target.value)}
        >
          <option value="">Todas</option>
          {["alta", "media", "baja"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
    </details>
  );
}
