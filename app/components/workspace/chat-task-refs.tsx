"use client";

import styles from "./chat-attachments.module.css";

export function ChatTaskRefs({ items, disabled, onRemove }: {
  items: { id: number; title: string }[]; disabled: boolean; onRemove: (id: number) => void;
}) {
  if (!items.length) return null;
  return <ul className={styles.list} aria-label="Tareas adjuntas">
    {items.map((item) => <li className={styles.item} key={item.id}>
      <span className={styles.icon} aria-hidden="true"><i className="bi bi-check2-square" /></span>
      <div className={styles.info}>
        <span className={styles.name} title={item.title}>{item.title}</span>
        <span className={styles.meta}>Tarea del tablero · se enviará con su información completa</span>
      </div>
      <div className={styles.actions}>
        <button type="button" disabled={disabled} aria-label={`Quitar la tarea ${item.title}`} onClick={() => onRemove(item.id)}>
          <i aria-hidden="true" className="bi bi-x-lg" />
        </button>
      </div>
    </li>)}
  </ul>;
}
