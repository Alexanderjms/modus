"use client";

import type { ChatMessage, TaskSuggestion } from "../../chat-contract";
import { attachmentUrl } from "../../chat-attachments.mjs";
import { Skeleton } from "../skeleton";
import styles from "./chat.module.css";
import { ThinkingOrb } from "./thinking-orb";
import { SearchingOrb } from "./searching-orb";
import type { TaskCatalogsDto } from "../../api/tasks/route";
import { FileTypeIcon } from "./file-type-icon";
import { SuggestionBulkBar } from "./suggestion-bulk-bar";
import { ChatMarkdown } from "./chat-markdown";
import { TaskSuggestionCard, type SuggestionTargetTask, type TaskSuggestionDraft, type TaskSuggestionView } from "./task-suggestion-card";

export function ChatTranscript({
  messages,
  loading,
  saving,
  pendingMessage,
  searching,
  streamingText,
  streamingSuggestions,
  hasProject,
  suggestionsDisabled,
  pendingSuggestionId,
  taskTitles,
  taskDetails,
  catalogs,
  catalogTags,
  onAcceptSuggestion,
  onAcceptAllSuggestions,
  onDiscardSuggestion,
  onUndoDiscardSuggestion,
  projectId,
}: {
  messages: ChatMessage[];
  loading: boolean;
  saving: boolean;
  pendingMessage: ChatMessage | null;
  searching: boolean;
  streamingText: string;
  streamingSuggestions: TaskSuggestion[];
  hasProject: boolean;
  suggestionsDisabled: boolean;
  pendingSuggestionId: string | null;
  taskTitles: Map<number, string>;
  taskDetails: Map<number, SuggestionTargetTask>;
  catalogs: TaskCatalogsDto | null;
  catalogTags: { name: string; color: string | null }[];
  onAcceptSuggestion: (suggestion: TaskSuggestionView, draft: TaskSuggestionDraft) => Promise<string | null>;
  onAcceptAllSuggestions: (suggestions: TaskSuggestionView[]) => Promise<string | null>;
  onDiscardSuggestion: (suggestion: TaskSuggestionView) => void;
  onUndoDiscardSuggestion: (suggestion: TaskSuggestionView) => void;
  projectId?: number;
}) {
  const streaming = !!pendingMessage && !saving && (!!streamingText || streamingSuggestions.length > 0);

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
            {item.role === "user" && !!item.tasks?.length && <ul className={styles.messageTasks} aria-label="Tareas adjuntas">{item.tasks.map((task) => <li key={task.id} title={task.title}>
              <i aria-hidden="true" className="bi bi-check2-square" /><span>{task.title}</span>
            </li>)}</ul>}
            {item.role === "user" && !!item.attachments?.length && projectId && <ul className={styles.messageAttachments} aria-label="Archivos adjuntos">{item.attachments.map((attachment) => {
              const url = attachmentUrl(attachment.id, projectId);
              return <li key={attachment.id}><a href={url} target="_blank" rel="noreferrer">
                {attachment.type.startsWith("image/") ? <img src={url} alt="" loading="lazy" /> : <FileTypeIcon name={attachment.name} size={18} />}
                <span>{attachment.name} · {Math.max(1, Math.ceil(attachment.size / 1024))} KiB</span>
              </a></li>;
            })}</ul>}
            {item.role === "assistant" && item.suggestions?.map((suggestion) => {
              const view = suggestion as TaskSuggestionView;
              return <TaskSuggestionCard
                key={suggestion.id}
                suggestion={view}
                targetTaskTitle={view.targetTaskId ? taskTitles.get(view.targetTaskId) : undefined}
                targetTask={view.targetTaskId ? taskDetails.get(view.targetTaskId) : undefined}
                catalogTags={catalogTags}
                catalogs={catalogs}
                actionsDisabled={suggestionsDisabled}
                pending={pendingSuggestionId === suggestion.id}
                onAccept={onAcceptSuggestion}
                onDiscard={onDiscardSuggestion}
                onUndoDiscard={onUndoDiscardSuggestion}
              />;
            })}
            {item.role === "assistant" && (item.suggestions?.filter((suggestion) => suggestion.status === "pending").length ?? 0) >= 2 && (
              <SuggestionBulkBar
                count={item.suggestions!.filter((suggestion) => suggestion.status === "pending").length}
                disabled={suggestionsDisabled || !!pendingSuggestionId}
                onAcceptAll={() => onAcceptAllSuggestions(item.suggestions!.filter((suggestion) => suggestion.status === "pending") as TaskSuggestionView[])}
              />
            )}
          </article>
        ))
      )}
      {streaming && (
        <article className={`${styles.message} ${styles.assistantMessage}`} aria-live="polite">
          <strong>Asistente</strong>
          {streamingText && <ChatMarkdown content={streamingText} taskTitles={taskTitles} />}
          {streamingSuggestions.map((suggestion) => {
            const view = suggestion as TaskSuggestionView;
            return <TaskSuggestionCard
              key={suggestion.id}
              suggestion={view}
              targetTaskTitle={view.targetTaskId ? taskTitles.get(view.targetTaskId) : undefined}
              targetTask={view.targetTaskId ? taskDetails.get(view.targetTaskId) : undefined}
              catalogTags={catalogTags}
              catalogs={catalogs}
              actionsDisabled
              pending={false}
              onAccept={async () => null}
              onDiscard={() => {}}
              onUndoDiscard={() => {}}
            />;
          })}
        </article>
      )}
      {(pendingMessage || saving) && !streaming && (
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
