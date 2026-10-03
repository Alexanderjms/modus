"use client";

import type { FormEvent } from "react";
import styles from "./board.module.css";
import shared from "../workspace.module.css";

export function NewTaskForm({
  title,
  onTitle,
  onSubmit,
  onCancel,
}: {
  title: string;
  onTitle: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form className={styles.newTask} onSubmit={onSubmit}>
      <input
        autoFocus
        aria-label="Nombre de la tarea"
        placeholder="Nombre de la tarea"
        required
        maxLength={300}
        value={title}
        onChange={(event) => onTitle(event.target.value)}
      />
      <button className={shared.primary}>Agregar</button>
      <button type="button" onClick={onCancel}>
        Cancelar
      </button>
    </form>
  );
}
