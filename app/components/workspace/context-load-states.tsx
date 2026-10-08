"use client";

import { Skeleton } from "../skeleton";
import styles from "./context.module.css";
import stateStyles from "./context-load-save.module.css";
import shared from "../workspace.module.css";
import { useT } from "../../i18n/provider";

export function ContextSkeleton() {
  const t = useT();
  return (
    <>
      <p className={styles.srOnly} role="status">
        {t("Cargando contexto del proyecto…")}
      </p>
      <section className={styles.contextSection}>
        <header className={stateStyles.skeletonHeader}>
          <Skeleton variant="text" width={116} height={8} />
        </header>
        <Skeleton variant="rounded" width="100%" height={84} />
        <div className={stateStyles.skeletonHint}>
          <Skeleton variant="text" width={72} height={8} />
        </div>
      </section>
      <section className={styles.contextSection}>
        <header className={stateStyles.skeletonHeader}>
          <Skeleton variant="text" width={92} height={8} />
        </header>
        <ul className={styles.editableList}>
          {[0, 1, 2].map((key) => (
            <li className={stateStyles.skeletonRuleRow} key={key}>
              <Skeleton variant="rounded" width="100%" height={32} />
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.contextSection}>
        <header className={stateStyles.skeletonHeader}>
          <Skeleton variant="text" width={68} height={8} />
        </header>
        <ul className={styles.editableList}>
          {[0, 1].map((key) => (
            <li className={stateStyles.skeletonResourceRow} key={key}>
              <Skeleton variant="rounded" width="100%" height={32} />
              <Skeleton variant="rounded" width="100%" height={32} />
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
  const t = useT();
  if (kind === "no-project") {
    return (
      <p className={stateStyles.panelMessage} role="status">
        {t("Selecciona un proyecto para editar su contexto.")}
      </p>
    );
  }

  return (
    <div className={stateStyles.panelMessage} role="alert">
      <p>{message || t("No se pudo cargar el contexto.")}</p>
      <button type="button" className={shared.textButton} onClick={onRetry}>
        {t("Reintentar")}
      </button>
    </div>
  );
}
