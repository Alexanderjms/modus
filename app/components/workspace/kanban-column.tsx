"use client";

import styles from "./board.module.css";
import shared from "../workspace.module.css";

export function KanbanColumn({
  name,
  index,
}: {
  name: string;
  index: number;
}) {
  return (
    <section
      className={`${styles.column} ${styles[`column${index}`] ?? ""}`}
      aria-label={name}
      tabIndex={0}
    >
      <header>
        <b className={styles.dot} />
        <h2>{name}</h2>
        <span>0</span>
      </header>
      <button
        className={shared.addTask}
        disabled
      >
        <i aria-hidden="true" className="bi bi-plus" />
        Agregar tarea
      </button>
    </section>
  );
}
