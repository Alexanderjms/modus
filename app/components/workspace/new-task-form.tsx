"use client";

import type { FormEvent } from "react";
import styles from "./board.module.css";
import shared from "../workspace.module.css";
import { useT } from "../../i18n/provider";

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
  const t = useT();
  return (
    <form className={styles.newTask} onSubmit={onSubmit}>
      <input
        autoFocus
        aria-label={t("Nombre de la tarea")}
        placeholder={t("Nombre de la tarea")}
        required
        maxLength={300}
        value={title}
        onChange={(event) => onTitle(event.target.value)}
      />
      <button className={shared.primary}>{t("Agregar")}</button>
      <button type="button" onClick={onCancel}>
        {t("Cancelar")}
      </button>
    </form>
  );
}
