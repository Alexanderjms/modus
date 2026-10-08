"use client";

import { useId } from "react";
import styles from "./chat.module.css";
import shared from "../workspace.module.css";
import { ChatDropzone } from "./chat-dropzone";
import { ChatAttachments } from "./chat-attachments";
import { ChatTaskRefs } from "./chat-task-refs";
import type { PendingAttachment } from "./use-chat-attachments";
import attachmentStyles from "./chat-attachments.module.css";
import { useT } from "../../i18n/provider";

export function ChatComposer({
  draft,
  onDraftChange,
  onSend,
  sending,
  canSend,
  attachmentsDisabled,
  attachments,
  attachmentError,
  projectId,
  onFiles,
  onRetryAttachment,
  onCancelAttachment,
  onRemoveAttachment,
  taskRefs,
  onRemoveTask,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  canSend: boolean;
  attachmentsDisabled: boolean;
  attachments: PendingAttachment[];
  attachmentError: string;
  projectId?: number;
  onFiles: (files: File[]) => void;
  onRetryAttachment: (key: string) => void;
  onCancelAttachment: (key: string) => void;
  onRemoveAttachment: (key: string) => void;
  taskRefs: { id: number; title: string }[];
  onRemoveTask: (id: number) => void;
}) {
  const t = useT();
  const id = useId();

  const readyAttachments = attachments.filter((item) => item.status === "ready" && item.attachment).length;
  return <ChatDropzone disabled={attachmentsDisabled} onFiles={onFiles}>{(openPicker) => (
    <form
      className={`${styles.composer} ${shared.composer}`}
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <label className={styles.composerLabel} htmlFor={id}>{t("Mensaje al chat")}</label>
      <ChatAttachments items={attachments} projectId={projectId} disabled={attachmentsDisabled} onRetry={onRetryAttachment} onCancel={onCancelAttachment} onRemove={onRemoveAttachment} />
      <ChatTaskRefs items={taskRefs} disabled={sending} onRemove={onRemoveTask} />
      {attachmentError && <p className={attachmentStyles.error} role="alert">{t(attachmentError)}</p>}
      <div>
        <button
          type="button"
          aria-label={t("Adjuntar archivos")}
          title={t("Adjuntar archivos o arrastrarlos aquí (máximo 5, 10 MiB por archivo)")}
          onClick={openPicker}
          disabled={attachmentsDisabled}
        >
          <i aria-hidden="true" className="bi bi-paperclip" />
        </button>
        <textarea
          id={id}
          aria-describedby={`${id}-hint`}
          placeholder={t("Escribe un mensaje…")}
          rows={1}
          maxLength={4000}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.nativeEvent.keyCode !== 229
            ) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <button
          type="submit"
          className={styles.send}
          aria-label={sending ? t("Esperando respuesta") : t("Enviar mensaje")}
          title={!canSend ? t("Elige un proyecto, proveedor y modelo disponible.") : undefined}
          disabled={(!draft.trim() && !readyAttachments && !taskRefs.length) || !canSend || sending || attachments.some((item) => item.status !== "ready")}
        >
          <i aria-hidden="true" className={sending ? "bi bi-hourglass-split" : "bi bi-send"} />
        </button>
      </div>
      <p id={`${id}-hint`}>{t("Enter envía · Shift+Enter añade una línea. Los archivos se guardan con el mensaje y se envían al modelo. Arrastra tareas del tablero para dárselas al chat.")}</p>
      {!!attachments.length && <p>{t("Quita los adjuntos del borrador para cambiar de chat.")}</p>}
    </form>
  )}</ChatDropzone>;
}
