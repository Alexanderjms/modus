"use client";

import { useState, type FormEvent } from "react";
import styles from "./chat.module.css";
import shared from "../workspace.module.css";

export function ChatComposer({ onSend }: { onSend: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft("");
  }
  return (
    <form className={`${styles.composer} ${shared.composer}`} onSubmit={submit}>
      <div>
        <button
          type="button"
          aria-label="Adjuntar archivo"
          title="Los adjuntos aún no están integrados."
          disabled
        >
          <i aria-hidden="true" className="bi bi-paperclip" />
        </button>
        <textarea
          aria-label="Mensaje al chat"
          placeholder="Escribe un mensaje…"
          rows={1}
          maxLength={4000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          className={styles.send}
          aria-label="Enviar mensaje"
          disabled={!draft.trim()}
        >
          <i aria-hidden="true" className="bi bi-send" />
        </button>
      </div>
      <p>Enter para enviar · Shift+Enter para salto de línea</p>
    </form>
  );
}
