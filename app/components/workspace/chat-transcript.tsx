"use client";

import type { ChatMessage } from "../../chat-contract";
import { Skeleton } from "../skeleton";
import styles from "./chat.module.css";
import { ThinkingOrb } from "./thinking-orb";
import { SearchingOrb } from "./searching-orb";
import { ChatMarkdown } from "./chat-markdown";
import { TaskSuggestionCard, type TaskSuggestionDraft, type TaskSuggestionView } from "./task-suggestion-card";

export function ChatTranscript({
  messages,
  loading,
  saving,
  pendingMessage,
  searching,
  hasProject,
  suggestionsDisabled,
  pendingSuggestionId,
  taskTitles,
  catalogTags,
  onAcceptSuggestion,
  onDiscardSuggestion,
  onUndoDiscardSuggestion,
}: {
  messages: ChatMessage[];
  loading: boolean;
  saving: boolean;
  pendingMessage: ChatMessage | null;
  searching: boolean;
  hasProject: boolean;
  suggestionsDisabled: boolean;
  pendingSuggestionId: string | null;
  taskTitles: Map<number, string>;
  catalogTags: { name: string; color: string | null }[];
  onAcceptSuggestion: (suggestion: TaskSuggestionView, draft: TaskSuggestionDraft) => Promise<string | null>;
  onDiscardSuggestion: (suggestion: TaskSuggestionView) => void;
  onUndoDiscardSuggestion: (suggestion: TaskSuggestionView) => void;
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
            {item.role === "assistant" ? <ChatMarkdown content={item.content} taskTitles={taskTitles} /> : <p>{item.content}</p>}
            {item.role === "assistant" && item.suggestions?.map((suggestion) => {
              const view = suggestion as TaskSuggestionView;
              return <TaskSuggestionCard
                key={suggestion.id}
                suggestion={view}
                targetTaskTitle={view.targetTaskId ? taskTitles.get(view.targetTaskId) : undefined}
                catalogTags={catalogTags}
                actionsDisabled={suggestionsDisabled}
                pending={pendingSuggestionId === suggestion.id}
                onAccept={onAcceptSuggestion}
                onDiscard={onDiscardSuggestion}
                onUndoDiscard={onUndoDiscardSuggestion}
              />;
            })}
          </article>
        ))
      )}
      {(pendingMessage || saving) && (
        <p className={styles.pending} role="status">
          {saving ? "Guardando historial…" : searching ? (
            <>
              <SearchingOrb />
              Buscando en la web…
            </>
          ) : (
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
