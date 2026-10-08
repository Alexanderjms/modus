"use client";

import styles from "./context.module.css";
import stateStyles from "./context-load-save.module.css";
import shared from "../workspace.module.css";
import { useT } from "../../i18n/provider";

export function ContextSaveStatus({
  saving,
  saved,
  hasPendingChanges,
  ruleDraftPending,
  resourceDraftActive,
  saveError,
  valid,
  onRetry,
}: {
  saving: boolean;
  saved: boolean;
  hasPendingChanges: boolean;
  ruleDraftPending: boolean;
  resourceDraftActive: boolean;
  saveError: string;
  valid: boolean;
  onRetry: () => void;
}) {
  const t = useT();
  return (
    <div className={stateStyles.saveActions}>
      {saving && <p className={stateStyles.saveStatus} role="status">{t("Guardando…")}</p>}
      {!saving && saved && !hasPendingChanges && !ruleDraftPending && !resourceDraftActive && (
        <p className={stateStyles.savedMessage} role="status">{t("Guardado")}</p>
      )}
      {(ruleDraftPending || resourceDraftActive) && (
        <p className={styles.fieldHint} role="status">
          {t("Confirma o cancela la edición para guardar los cambios.")}
        </p>
      )}
      {saveError && (
        <div className={stateStyles.saveError}>
          <p className={styles.errorMessage} role="alert">{t(saveError)}</p>
          <button type="button" className={shared.textButton} disabled={saving || !valid} onClick={onRetry}>
            {t("Reintentar")}
          </button>
        </div>
      )}
    </div>
  );
}
