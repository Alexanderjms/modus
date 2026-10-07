"use client";

import type { CSSProperties, RefObject } from "react";
import type { TaskCatalogsDto } from "../../api/tasks/route";
import { getTaskTagHue } from "./task-card";
import { ChatPicker, type ChatPickerOption } from "./chat-picker";
import styles from "./task-editor.module.css";

export type EditableSubtask = {
  id?: number;
  localKey: string;
  title: string;
  completed: boolean;
};

export function TaskTagsSection({
  catalogs,
  tagKeys,
  exitingTagKeys,
  newTag,
  newTagColor,
  newTagColors,
  tagError,
  tagActionNotice,
  saving,
  savePending,
  suspended,
  onNewTagChange,
  onNewTagColorChange,
  onAddTag,
  onAppendTagKey,
  onTagAction,
  tagActionPending,
  onStartRemoval,
  onCancelRemoval,
  onFinishRemoval,
}: {
  catalogs: TaskCatalogsDto;
  tagKeys: string[];
  exitingTagKeys: Set<string>;
  newTag: string;
  newTagColor: string;
  newTagColors: Record<string, string>;
  tagError: string;
  tagActionNotice: string;
  saving: boolean;
  savePending: boolean;
  suspended: boolean;
  onNewTagChange: (value: string) => void;
  onNewTagColorChange: (value: string) => void;
  onAddTag: () => void;
  onAppendTagKey: (key: string) => void;
  onTagAction: (option: ChatPickerOption, action: "rename" | "delete") => void;
  tagActionPending: boolean;
  onStartRemoval: (key: string) => void;
  onCancelRemoval: (key: string) => void;
  onFinishRemoval: (key: string) => void;
}) {
  return (
    <section className={`${styles.editorSection} ${styles.editorTagsField}`} aria-labelledby="task-tags-title">
      <h3 id="task-tags-title">Etiquetas</h3>
      <ChatPicker
        label="Etiquetas"
        value=""
        options={[
          ...catalogs.tags.map((tag) => ({ value: `id:${tag.id}`, label: tag.name, color: tag.color })),
          ...tagKeys.filter((key) => key.startsWith("name:") && !catalogs.tags.some((tag) => tag.name.toLocaleLowerCase("es") === key.slice(5).toLocaleLowerCase("es")))
            .map((key) => ({ value: key, label: key.slice(5), color: newTagColors[key] })),
        ]}
        emptyLabel="Aún no hay etiquetas. Crea una abajo."
        onChange={() => {}}
        optionActions={{
          disabled: tagActionPending,
          labels: { rename: "Editar" },
          onSelect: onTagAction,
        }}
        multipleValues={tagKeys.filter((key) => !exitingTagKeys.has(key))}
        onMultipleChange={(values) => {
          const selected = tagKeys.filter((key) => !exitingTagKeys.has(key));
          selected.filter((key) => !values.includes(key)).forEach(onStartRemoval);
          values.filter((key) => !selected.includes(key)).forEach((key) => {
            if (exitingTagKeys.has(key)) onCancelRemoval(key);
            else onAppendTagKey(key);
          });
        }}
        footer={
          <div className={styles.tagPickerFooter}>
            <div className={styles.newTagRow}>
              <label className={styles.visuallyHidden} htmlFor="task-new-tag">Crear etiqueta</label>
              <input id="task-new-tag" value={newTag} maxLength={80} placeholder="Nueva etiqueta" onChange={(event) => onNewTagChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onAddTag(); } }} />
              <input className={styles.newTagColor} type="color" aria-label="Color de nueva etiqueta" value={newTagColor} onChange={(event) => onNewTagColorChange(event.target.value)} />
              <button type="button" onClick={onAddTag} disabled={!newTag.trim()}>Crear y asociar</button>
            </div>
          </div>
        }
        suspended={suspended || saving || savePending}
        size="form"
      />
      {tagError && <p className={styles.editorError} role="alert">{tagError}</p>}
      {tagActionNotice && <p className={styles.tagActionStatus} role="status">{tagActionNotice}</p>}
      <ul className={styles.selectedTags} aria-label="Etiquetas asociadas">
        {tagKeys.map((key) => {
          const catalogTag = key.startsWith("id:") ? catalogs.tags.find((item) => key === `id:${item.id}`) : undefined;
          const name = catalogTag?.name ?? key.slice(5);
          const color = catalogTag?.color ?? newTagColors[key];
          const exiting = exitingTagKeys.has(key);
          return <li
            key={key}
            className={exiting ? styles.editorItemExiting : ""}
            style={{ "--tag-hue": getTaskTagHue(name), ...(color ? { "--tag-color": color } : {}) } as CSSProperties}
            aria-hidden={exiting || undefined}
            inert={exiting || undefined}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) onFinishRemoval(key);
            }}
          >
            <span>{name}</span>
            <button type="button" disabled={exiting} aria-label={`Quitar etiqueta ${name}`} onClick={() => onStartRemoval(key)}>
              <i aria-hidden="true" className="bi bi-x-lg" />
            </button>
          </li>;
        })}
      </ul>
    </section>
  );
}

export function TaskAttachmentsSection({
  entries,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
}: {
  entries: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className={`${styles.editorField} ${styles.editorWide}`}>
      <span>Adjuntos y enlaces</span>
      <div className={styles.attachmentEditor}>
        <div className={styles.attachmentAdd}>
          <i aria-hidden="true" className="bi bi-paperclip" />
          <label className={styles.visuallyHidden} htmlFor="task-attachment">Añadir enlace o archivo</label>
          <input
            id="task-attachment"
            value={draft}
            maxLength={10000}
            placeholder="Pega un enlace o escribe el nombre del archivo"
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onAdd(); } }}
          />
          <button type="button" onClick={onAdd} disabled={!draft.trim()} aria-label="Añadir adjunto o enlace">
            <i aria-hidden="true" className="bi bi-plus-lg" />
            <span>Añadir</span>
          </button>
        </div>
        {entries.length ? (
          <ul className={styles.attachmentList} aria-label="Adjuntos y enlaces">
            {entries.map((entry, index) => {
              const isLink = /^https?:\/\//i.test(entry);
              return <li key={`${entry}:${index}`}>
                <i aria-hidden="true" className={`bi ${isLink ? "bi-link-45deg" : "bi-file-earmark"}`} />
                <span className={styles.attachmentKind}>{isLink ? "Enlace" : "Archivo"}</span>
                {isLink ? <a href={entry} target="_blank" rel="noreferrer noopener" title={entry}>{entry}</a> : <span className={styles.attachmentName} title={entry}>{entry}</span>}
                <button type="button" aria-label={`Quitar ${isLink ? "enlace" : "archivo"} ${entry}`} onClick={() => onRemove(index)}>
                  <i aria-hidden="true" className="bi bi-x-lg" />
                </button>
              </li>;
            })}
          </ul>
        ) : <p className={styles.attachmentEmpty}>Todavía no hay archivos ni enlaces.</p>}
      </div>
    </div>
  );
}

export function TaskSubtasksSection({
  subtasks,
  draft,
  exitingKeys,
  saving,
  savePending,
  draftInputRef,
  onDraftChange,
  onAdd,
  onSetTitle,
  onSetCompleted,
  onStartRemoval,
  onFinishRemoval,
}: {
  subtasks: EditableSubtask[];
  draft: string;
  exitingKeys: Set<string>;
  saving: boolean;
  savePending: boolean;
  draftInputRef: RefObject<HTMLInputElement | null>;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onSetTitle: (localKey: string, title: string) => void;
  onSetCompleted: (localKey: string, completed: boolean) => void;
  onStartRemoval: (localKey: string) => void;
  onFinishRemoval: (localKey: string) => void;
}) {
  return (
    <section className={`${styles.editorSection} ${styles.editorSubtasks}`} aria-labelledby="task-subtasks-title">
      <h3 id="task-subtasks-title">Checklist</h3>
      <div className={styles.subtaskAddRow}>
        <label className={styles.visuallyHidden} htmlFor="task-new-subtask">Agregar item al checklist</label>
        <input
          ref={draftInputRef}
          id="task-new-subtask"
          value={draft}
          maxLength={255}
          placeholder="Agregar item…"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            onAdd();
          }}
        />
        <button className={styles.subtaskAddButton} type="button" onClick={onAdd} disabled={!draft.trim()}>Agregar</button>
      </div>
      {subtasks.length === 0 && !draft.trim() && <p className={styles.editorHint}>Aún no hay ítems. Agrega uno para desglosar esta tarea.</p>}
      {subtasks.length > 0 && <ul className={styles.subtaskRows} aria-label="Elementos del checklist">
        {subtasks.map((item, index) => {
          const exiting = exitingKeys.has(item.localKey);
          const accessibleName = item.title.trim() || `subtarea ${index + 1}`;
          return <li
            className={`${styles.subtaskRow} ${exiting ? styles.editorItemExiting : ""}`}
            key={item.localKey}
            aria-hidden={exiting || undefined}
            inert={exiting || undefined}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) onFinishRemoval(item.localKey);
            }}
          >
            <label className={styles.subtaskCompletion}>
              <input
                type="checkbox"
                checked={item.completed}
                disabled={saving || savePending || exiting}
                aria-label={`Marcar ${accessibleName} como ${item.completed ? "pendiente" : "completada"}`}
                onChange={(event) => onSetCompleted(item.localKey, event.target.checked)}
              />
            </label>
            <input
              className={`${styles.subtaskNameInput} ${item.completed ? styles.subtaskNameCompleted : ""}`}
              value={item.title}
              required={item.id !== undefined}
              maxLength={255}
              aria-label={`Nombre de ${accessibleName}`}
              disabled={saving || savePending || exiting}
              onChange={(event) => onSetTitle(item.localKey, event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                draftInputRef.current?.focus();
              }}
            />
            <button
              className={styles.subtaskRemove}
              type="button"
              aria-label={`Eliminar ${accessibleName}`}
              disabled={saving || savePending || exiting}
              onClick={() => onStartRemoval(item.localKey)}
            >
              <i aria-hidden="true" className="bi bi-trash3" />
            </button>
          </li>;
        })}
      </ul>}
    </section>
  );
}
