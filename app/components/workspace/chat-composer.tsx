"use client";

import { useId } from "react";
import styles from "./chat.module.css";
import shared from "../workspace.module.css";

export function ChatComposer({
  draft,
  onDraftChange,
  onSend,
  sending,
  canSend,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  canSend: boolean;
}) {
  const id = useId();

  return (
    <form
      className={`${styles.composer} ${shared.composer}`}
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <label className={styles.composerLabel} htmlFor={id}>Mensaje al chat</label>
      <div>
        <button
          type="button"
          aria-label="Adjuntar archivo (no disponible)"
          title="Los adjuntos aún no están integrados."
          disabled
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
          disabled={!draft.trim() || !canSend || sending}
        >
          <i aria-hidden="true" className={sending ? "bi bi-hourglass-split" : "bi bi-send"} />
        </button>
      </div>
      <p id={`${id}-hint`}>Enter envía · Shift+Enter añade una línea. Adjuntos pendientes.</p>
    </form>
  );
}
