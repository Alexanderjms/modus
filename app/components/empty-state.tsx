"use client";

import { useId } from "react";
import styles from "./empty-state.module.css";
import { useT } from "../i18n/provider";

export function EmptyState({
  icon,
  title,
  description,
  onCreate,
}: {
  icon: string;
  title: string;
  description: string;
  onCreate?: () => void;
}) {
  const t = useT();
  const headingId = useId();
  return (
    <section className={styles.emptyState} aria-labelledby={headingId}>
      <span className={styles.icon}>
        <i aria-hidden="true" className={`bi bi-${icon}`} />
      </span>
      <h2 id={headingId}>{title}</h2>
      <p>{description}</p>
      <button
        className={styles.primary}
        onClick={onCreate}
        title={onCreate ? undefined : t("Esta función aún no está integrada.")}
        disabled={!onCreate}
      >
        <i aria-hidden="true" className="bi bi-plus" />
        {t("Nuevo proyecto")}
      </button>
    </section>
  );
}
