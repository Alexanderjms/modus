import { Skeleton } from "../skeleton";
import styles from "./context.module.css";
import shared from "../workspace.module.css";

export function ContextSkeleton() {
  return (
    <>
      <p className={styles.srOnly} role="status">
        Cargando contexto del proyecto…
      </p>
      <section className={styles.contextSection}>
        <header className={styles.skeletonHeader}>
          <Skeleton variant="text" width={116} height={8} />
          <Skeleton variant="rounded" width={24} height={24} />
        </header>
        <Skeleton variant="rounded" width="100%" height={84} />
        <div className={`${styles.skeletonField} ${styles.skeletonHint}`}>
          <Skeleton variant="text" width={72} height={8} />
        </div>
      </section>
      <section className={styles.contextSection}>
        <header className={styles.skeletonHeader}>
          <Skeleton variant="text" width={92} height={8} />
          <Skeleton variant="rounded" width={24} height={24} />
        </header>
        <ul className={styles.editableList}>
          {[0, 1, 2].map((key) => (
            <li key={key}>
              <Skeleton variant="rounded" width="100%" height={32} />
              <Skeleton variant="rounded" width={28} height={28} />
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.contextSection}>
        <header className={styles.skeletonHeader}>
          <Skeleton variant="text" width={68} height={8} />
          <Skeleton variant="rounded" width={24} height={24} />
        </header>
        <ul className={styles.editableList}>
          {[0, 1].map((key) => (
            <li className={styles.skeletonResourceRow} key={key}>
              <Skeleton variant="rounded" width="100%" height={32} />
              <Skeleton variant="rounded" width="100%" height={32} />
              <Skeleton variant="rounded" width={28} height={28} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function ContextLoadMessage({
  kind,
  message,
  onRetry,
}: {
  kind: "error" | "no-project";
  message: string;
  onRetry: () => void;
}) {
  if (kind === "no-project") {
    return (
      <p className={styles.panelMessage} role="status">
        Selecciona un proyecto para editar su contexto.
      </p>
    );
  }

  return (
    <div className={styles.panelMessage} role="alert">
      <p>{message || "No se pudo cargar el contexto."}</p>
      <button type="button" className={shared.textButton} onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}
