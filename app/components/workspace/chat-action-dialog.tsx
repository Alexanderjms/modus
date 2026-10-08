"use client";

import type { RefObject } from "react";
import styles from "./chat.module.css";
import { useT } from "../../i18n/provider";

export type ChatAction = "rename" | "delete";

export function ChatActionDialog({
  dialogRef,
  renameInputRef,
  action,
  actionTitleId,
  renameValue,
  actionError,
  pending,
  chatTitle,
  onClose,
  onDialogClose,
  onRenameValueChange,
  onSubmit,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  renameInputRef: RefObject<HTMLInputElement | null>;
  action: ChatAction | null;
  actionTitleId: string;
  renameValue: string;
  actionError: string;
  pending: boolean;
  chatTitle: string | undefined;
  onClose: () => void;
  onDialogClose: () => void;
  onRenameValueChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const t = useT();
  return (
    <dialog
      ref={dialogRef}
      className={styles.chatActionDialog}
      aria-labelledby={actionTitleId}
      onClose={onDialogClose}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} aria-busy={pending || undefined}>
        <header>
          <div>
            <h2 id={actionTitleId}>{action === "rename" ? t("Renombrar chat") : t("Eliminar chat")}</h2>
            <p>{action === "rename" ? t("El nuevo nombre se conservará en este proyecto.") : t("Esta acción no se puede deshacer.")}</p>
          </div>
          <button type="button" aria-label={t("Cerrar")} disabled={pending} onClick={onClose}>
            <i aria-hidden="true" className="bi bi-x-lg" />
          </button>
        </header>
        <div className={styles.chatActionBody}>
          {action === "rename" ? (
            <label className={styles.chatActionField}>
              <span>{t("Nombre del chat")}</span>
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                maxLength={80}
                required
                disabled={pending}
                aria-invalid={!!actionError || undefined}
                onChange={(event) => onRenameValueChange(event.target.value)}
              />
              <small>{renameValue.length}/80</small>
            </label>
          ) : (
            <p className={styles.deleteWarning}>
              {t("¿Eliminar")} <strong>{chatTitle}</strong>{t("? Se perderán este chat y todos sus mensajes.")}
            </p>
          )}
          {actionError && <p className={styles.chatActionError} role="alert">{t(actionError)}</p>}
        </div>
        <footer>
          <button type="button" disabled={pending} onClick={onClose}>{t("Cancelar")}</button>
          <button
            type="submit"
            className={action === "delete" ? styles.dangerButton : ""}
            disabled={pending || (action === "rename" &&
              (!renameValue.trim() || renameValue.trim().length > 80 || /[\x00-\x1F\x7F]/.test(renameValue.trim())))}
          >
            {pending ? action === "rename" ? t("Guardando…") : t("Eliminando…")
              : action === "rename" ? t("Guardar nombre") : t("Eliminar chat")}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
