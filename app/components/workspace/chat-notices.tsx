"use client";

import type { ChatProviderId } from "../../chat-contract";
import styles from "./chat.module.css";
import { useT } from "../../i18n/provider";

export function ChatNotices({
  providersLoading,
  storageAvailable,
  providersError,
  configuredCount,
  provider,
  providerConfigured,
  modelsLoading,
  modelsError,
  modelsWarning,
  modelsCount,
  model,
  hasSelectedModel,
  onReloadProviders,
  onReloadModels,
}: {
  providersLoading: boolean;
  storageAvailable: boolean;
  providersError: string;
  configuredCount: number;
  provider: ChatProviderId | "";
  providerConfigured: boolean;
  modelsLoading: boolean;
  modelsError: string;
  modelsWarning: string;
  modelsCount: number;
  model: string;
  hasSelectedModel: boolean;
  onReloadProviders: () => void;
  onReloadModels: () => void;
}) {
  const t = useT();
  return (
    <div className={styles.settings}>
      {!providersLoading && !storageAvailable && (
        <p role="alert" className={styles.inlineError}>
          {t("Las claves cifradas solo pueden usarse desde Windows.")}
        </p>
      )}
      {providersError && (
        <p role="alert" className={styles.inlineError}>
          {t(providersError)}
          <button type="button" onClick={onReloadProviders}>{t("Reintentar")}</button>
        </p>
      )}
      {!providersLoading && !providersError && configuredCount === 0 && (
        <p className={styles.inlineStatus}>
          {t("Configura un proveedor en Perfil → Proveedores y actualiza la lista.")}
        </p>
      )}
      {!providersLoading && provider && !providerConfigured && (
        <p className={styles.inlineStatus}>
          {provider === "chatgpt" ? t("Conecta o reconecta tu cuenta de ChatGPT desde Proveedores para enviar.") : t("Este chat usa un proveedor sin configurar. Elige uno configurado para enviar.")}
        </p>
      )}
      {provider === "bedrock" && (
        <p className={styles.inlineStatus}>
          {t("Usa una API key de Bedrock; no se admiten credenciales AWS.")}
        </p>
      )}
      {modelsError && (
        <p role="alert" className={styles.inlineError}>
          {t(modelsError)}
          <button type="button" onClick={onReloadModels}>{t("Reintentar")}</button>
        </p>
      )}
      {modelsWarning && !modelsError && (
        <p role="status" className={styles.inlineStatus}>
          {t(modelsWarning)}{" "}
          <button type="button" onClick={onReloadModels}>{t("Reintentar")}</button>
        </p>
      )}
      {!modelsLoading && !modelsError && provider && providerConfigured && modelsCount === 0 && (
        <p className={styles.inlineStatus}>{t("Este proveedor no ofrece modelos disponibles.")}</p>
      )}
      {!modelsLoading && model && !hasSelectedModel && (
        <p className={styles.inlineStatus}>
          {t("El modelo guardado no está disponible. Selecciona otro para enviar.")}
        </p>
      )}
    </div>
  );
}

export function ChatErrors({
  historyError,
  busy,
  onRetryHistory,
  sending,
  historyCount,
  sendError,
  ready,
  onRetrySend,
  saveError,
  saving,
  saveConflict,
  onRetrySave,
  onSaveAsNew,
  limitError,
}: {
  historyError: string;
  busy: boolean;
  onRetryHistory: () => void;
  sending: boolean;
  historyCount: number;
  sendError: string;
  ready: boolean;
  onRetrySend: () => void;
  saveError: string;
  saving: boolean;
  saveConflict: boolean;
  onRetrySave: () => void;
  onSaveAsNew: () => void;
  limitError: string;
}) {
  const t = useT();
  return (
    <>
      {historyError && (
        <div className={styles.errorBox} role="alert">
          <span>{t(historyError)}</span>
          <button type="button" disabled={busy} onClick={onRetryHistory}>
            {t("Reintentar")}
          </button>
        </div>
      )}
      <p className={styles.srOnly} role="status" aria-live="polite">
        {sending
          ? t("Enviando mensaje.")
          : historyCount
            ? t("Conversación: {0} mensajes.", historyCount)
            : ""}
      </p>
      {sendError && (
        <div className={styles.errorBox} role="alert">
          <span>{t(sendError)}</span>
          <button type="button" disabled={!ready || sending} onClick={onRetrySend}>
            {t("Reintentar envío")}
          </button>
        </div>
      )}
      {saveError && (
        <div className={styles.errorBox} role="alert">
          <span>{t("Respuesta recibida, no se pudo guardar.")} {t(saveError)}</span>
          <button type="button" disabled={saving} onClick={onRetrySave}>
            {t("Reintentar guardado")}
          </button>
          {saveConflict && (
            <button type="button" disabled={saving} onClick={onSaveAsNew}>
              {t("Guardar como nuevo chat")}
            </button>
          )}
        </div>
      )}
      {limitError && (
        <div className={styles.errorBox} role="alert">
          <span>{t(limitError)}</span>
        </div>
      )}
    </>
  );
}
