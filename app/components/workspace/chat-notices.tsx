"use client";

import type { ChatProviderId } from "../../chat-contract";
import styles from "./chat.module.css";

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
  return (
    <div className={styles.settings}>
      {!providersLoading && !storageAvailable && (
        <p role="alert" className={styles.inlineError}>
          Las claves cifradas solo pueden usarse desde Windows.
        </p>
      )}
      {providersError && (
        <p role="alert" className={styles.inlineError}>
          {providersError}
          <button type="button" onClick={onReloadProviders}>Reintentar</button>
        </p>
      )}
      {!providersLoading && !providersError && configuredCount === 0 && (
        <p className={styles.inlineStatus}>
          Configura un proveedor en Perfil → Proveedores y actualiza la lista.
        </p>
      )}
      {!providersLoading && provider && !providerConfigured && (
        <p className={styles.inlineStatus}>
          {provider === "chatgpt" ? "Conecta o reconecta tu cuenta de ChatGPT desde Proveedores para enviar." : "Este chat usa un proveedor sin configurar. Elige uno configurado para enviar."}
        </p>
      )}
      {provider === "bedrock" && (
        <p className={styles.inlineStatus}>
          Usa una API key de Bedrock; no se admiten credenciales AWS.
        </p>
      )}
      {modelsError && (
        <p role="alert" className={styles.inlineError}>
          {modelsError}
          <button type="button" onClick={onReloadModels}>Reintentar</button>
        </p>
      )}
      {modelsWarning && !modelsError && (
        <p role="status" className={styles.inlineStatus}>
          {modelsWarning}{" "}
          <button type="button" onClick={onReloadModels}>Reintentar</button>
        </p>
      )}
      {!modelsLoading && !modelsError && provider && providerConfigured && modelsCount === 0 && (
        <p className={styles.inlineStatus}>Este proveedor no ofrece modelos disponibles.</p>
      )}
      {!modelsLoading && model && !hasSelectedModel && (
        <p className={styles.inlineStatus}>
          El modelo guardado no está disponible. Selecciona otro para enviar.
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
  return (
    <>
      {historyError && (
        <div className={styles.errorBox} role="alert">
          <span>{historyError}</span>
          <button type="button" disabled={busy} onClick={onRetryHistory}>
            Reintentar
          </button>
        </div>
      )}
      <p className={styles.srOnly} role="status" aria-live="polite">
        {sending
          ? "Enviando mensaje."
          : historyCount
            ? `Conversación: ${historyCount} mensajes.`
            : ""}
      </p>
      {sendError && (
        <div className={styles.errorBox} role="alert">
          <span>{sendError}</span>
          <button type="button" disabled={!ready || sending} onClick={onRetrySend}>
            Reintentar envío
          </button>
        </div>
      )}
      {saveError && (
        <div className={styles.errorBox} role="alert">
          <span>Respuesta recibida, no se pudo guardar. {saveError}</span>
          <button type="button" disabled={saving} onClick={onRetrySave}>
            Reintentar guardado
          </button>
          {saveConflict && (
            <button type="button" disabled={saving} onClick={onSaveAsNew}>
              Guardar como nuevo chat
            </button>
          )}
        </div>
      )}
      {limitError && (
        <div className={styles.errorBox} role="alert">
          <span>{limitError}</span>
        </div>
      )}
    </>
  );
}
