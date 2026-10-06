"use client";

import type { ChatMessage } from "../../chat-contract";
import { Skeleton } from "../skeleton";
import styles from "./chat.module.css";
import { ThinkingOrb } from "./thinking-orb";

export function ChatTranscript({
  messages,
  loading,
  saving,
  pendingMessage,
  hasProject,
}: {
  messages: ChatMessage[];
  loading: boolean;
  saving: boolean;
  pendingMessage: ChatMessage | null;
  hasProject: boolean;
}) {
  if (loading) {
    return (
      <div className={styles.skeletonMessages} role="status" aria-label="Cargando historial…">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className={styles.skeletonBubble}>
            <Skeleton variant="text" width={64} height={8} />
            <Skeleton variant="text" width={key % 2 ? "60%" : "85%"} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {messages.length === 0 ? (
        <div className={styles.emptyState}>
          <i aria-hidden="true" className="bi bi-stars" />
          <p>{!hasProject ? "Selecciona un proyecto" : "¿En qué te ayudo?"}</p>
          <span>Elige proveedor y modelo. Las respuestas no cambian tus tareas.</span>
        </div>
      ) : (
        messages.map((item, index) => (
          <article
            key={`${index}-${item.role}`}
            className={`${styles.message} ${
              item.role === "user" ? styles.userMessage : styles.assistantMessage
            }`}
          >
            <strong>{item.role === "user" ? "Tú" : "Asistente"}</strong>
            <p>{item.content}</p>
          </article>
        ))
      )}
      {(pendingMessage || saving) && (
        <p className={styles.pending} aria-hidden="true">
          {saving ? "Guardando historial…" : (
            <>
              <ThinkingOrb />
              Thinking…
            </>
          )}
        </p>
      )}
    </>
  );
}
