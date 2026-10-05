import { useId } from "react";
import styles from "./empty-state.module.css";

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
        title={onCreate ? undefined : "Esta función aún no está integrada."}
        disabled={!onCreate}
      >
        <i aria-hidden="true" className="bi bi-plus" />
        Nuevo proyecto
      </button>
    </section>
  );
}
