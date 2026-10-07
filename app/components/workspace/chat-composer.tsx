"use client";

import { useId } from "react";
import styles from "./chat.module.css";
import shared from "../workspace.module.css";
import { ChatDropzone } from "./chat-dropzone";
import { ChatAttachments } from "./chat-attachments";
import type { PendingAttachment } from "./use-chat-attachments";
import attachmentStyles from "./chat-attachments.module.css";

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
}) {
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
      <label className={styles.composerLabel} htmlFor={id}>Mensaje al chat</label>
      <ChatAttachments items={attachments} projectId={projectId} disabled={attachmentsDisabled} onRetry={onRetryAttachment} onCancel={onCancelAttachment} onRemove={onRemoveAttachment} />
      {attachmentError && <p className={attachmentStyles.error} role="alert">{attachmentError}</p>}
      <div>
        <button
          type="button"
          aria-label="Adjuntar archivos"
          title="Adjuntar archivos o arrastrarlos aquí (máximo 5, 10 MiB por archivo)"
          onClick={openPicker}
          disabled={attachmentsDisabled}
        >
          <i aria-hidden="true" className="bi bi-paperclip" />
        </button>
        <textarea
          id={id}
          aria-describedby={`${id}-hint`}
          placeholder="Escribe un mensaje…"
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
          aria-label={sending ? "Esperando respuesta" : "Enviar mensaje"}
          title={!canSend ? "Elige un proyecto, proveedor y modelo disponible." : undefined}
          disabled={(!draft.trim() && !readyAttachments) || !canSend || sending || attachments.some((item) => item.status !== "ready")}
        >
          <i aria-hidden="true" className={sending ? "bi bi-hourglass-split" : "bi bi-send"} />
        </button>
      </div>
      <p id={`${id}-hint`}>Enter envía · Shift+Enter añade una línea. Los archivos se guardan con el mensaje y se envían al modelo.</p>
      {!!attachments.length && <p>Quita los adjuntos del borrador para cambiar de chat.</p>}
    </form>
  )}</ChatDropzone>;
}
