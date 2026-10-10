"use client";

import { useRef, useState, type CSSProperties, type RefObject } from "react";
import type { TaskCatalogsDto } from "../../api/tasks/route";
import { getTaskTagHue } from "./task-card";
import { ChatPicker, type ChatPickerOption } from "./chat-picker";
import styles from "./task-editor.module.css";
import { useT } from "../../i18n/provider";
import { attachmentAccept, attachmentError, attachmentUrl } from "../../chat-attachments.mjs";
import { useWorkspaceRequest } from "./workspace-query-provider";

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
  onTagAction?: (option: ChatPickerOption, action: "rename" | "delete") => void;
  tagActionPending?: boolean;
  onStartRemoval: (key: string) => void;
  onCancelRemoval: (key: string) => void;
  onFinishRemoval: (key: string) => void;
}) {
  const t = useT();
  return (
    <section className={`${styles.editorSection} ${styles.editorTagsField}`} aria-labelledby="task-tags-title">
      <h3 id="task-tags-title">{t("Etiquetas")}</h3>
      <ChatPicker
        label={t("Etiquetas")}
        value=""
        options={[
          ...catalogs.tags.map((tag) => ({ value: `id:${tag.id}`, label: tag.name, color: tag.color })),
          ...tagKeys.filter((key) => key.startsWith("name:") && !catalogs.tags.some((tag) => tag.name.toLocaleLowerCase("es") === key.slice(5).toLocaleLowerCase("es")))
            .map((key) => ({ value: key, label: key.slice(5), color: newTagColors[key] })),
        ]}
        emptyLabel={t("Aún no hay etiquetas. Crea una abajo.")}
        onChange={() => {}}
        optionActions={onTagAction ? {
          disabled: tagActionPending,
          labels: { rename: t("Editar") },
          onSelect: onTagAction,
        } : undefined}
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
              <label className={styles.visuallyHidden} htmlFor="task-new-tag">{t("Crear etiqueta")}</label>
              <input id="task-new-tag" value={newTag} maxLength={80} placeholder={t("Nueva etiqueta")} onChange={(event) => onNewTagChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onAddTag(); } }} />
              <input className={styles.newTagColor} type="color" aria-label={t("Color de nueva etiqueta")} value={newTagColor} onChange={(event) => onNewTagColorChange(event.target.value)} />
              <button type="button" onClick={onAddTag} disabled={!newTag.trim()}>{t("Crear y asociar")}</button>
            </div>
          </div>
        }
        suspended={suspended || saving || savePending}
        size="form"
      />
      {tagError && <p className={styles.editorError} role="alert">{t(tagError)}</p>}
      {tagActionNotice && <p className={styles.tagActionStatus} role="status">{t(tagActionNotice)}</p>}
      <ul className={styles.selectedTags} aria-label={t("Etiquetas asociadas")}>
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
            <button type="button" disabled={exiting} aria-label={t("Quitar etiqueta {0}", name)} onClick={() => onStartRemoval(key)}>
              <i aria-hidden="true" className="bi bi-x-lg" />
            </button>
          </li>;
        })}
      </ul>
    </section>
  );
}

const FILE_URL_PREFIX = "/api/chat/attachments/";

function fileEntry(entry: string) {
  const split = entry.lastIndexOf("|");
  const url = split > 0 ? entry.slice(split + 1) : "";
  return url.startsWith(FILE_URL_PREFIX) ? { name: entry.slice(0, split), url } : null;
}

export function TaskAttachmentsSection({
  entries,
  draft,
  projectId,
  onDraftChange,
  onAdd,
  onAddEntry,
  onRemove,
}: {
  entries: string[];
  projectId?: number;
  onAddEntry: (entry: string) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const t = useT();
  const request = useWorkspaceRequest();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const add = () => {
    if (draft.trim()) onAdd();
    else fileInput.current?.click();
  };
  async function upload(file: File) {
    if (!projectId) return;
    const invalid = attachmentError(file);
    if (invalid) return setUploadError(t(invalid));
    setUploading(true);
    setUploadError("");
    try {
      const response = await request(`/api/chat/attachments?projectId=${projectId}&name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const result: unknown = await response.json().catch(() => null);
      const attachment = result && typeof result === "object" && "attachment" in result ? (result.attachment as { id?: unknown }) : null;
      if (!response.ok || typeof attachment?.id !== "string") {
        throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : t("No se pudo subir el archivo."));
      }
      onAddEntry(`${file.name}|${attachmentUrl(attachment.id, projectId)}`);
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : t("No se pudo subir el archivo."));
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className={`${styles.editorField} ${styles.editorWide}`}>
      <span>{t("Adjuntos y enlaces")}</span>
      <div className={styles.attachmentEditor}>
        <div className={styles.attachmentAdd}>
          <i aria-hidden="true" className="bi bi-paperclip" />
          <label className={styles.visuallyHidden} htmlFor="task-attachment">{t("Añadir enlace o archivo")}</label>
          <input
            id="task-attachment"
            value={draft}
            maxLength={10000}
            placeholder={t("Pega un enlace o pulsa Añadir para elegir un archivo")}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }}
          />
          <input
            ref={fileInput}
            type="file"
            accept={attachmentAccept}
            className={styles.visuallyHidden}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
          <button type="button" onClick={add} disabled={uploading} aria-busy={uploading || undefined} aria-label={t("Añadir adjunto o enlace")}>
            <i aria-hidden="true" className={`bi ${uploading ? "bi-hourglass-split" : "bi-plus-lg"}`} />
            <span>{uploading ? t("Subiendo…") : t("Añadir")}</span>
          </button>
        </div>
        {uploadError && <p className={styles.editorError} role="alert">{uploadError}</p>}
        {entries.length ? (
          <ul className={styles.attachmentList} aria-label={t("Adjuntos y enlaces")}>
            {entries.map((entry, index) => {
              const file = fileEntry(entry);
              const isLink = /^https?:\/\//i.test(entry);
              const label = file ? file.name : entry;
              return <li key={`${entry}:${index}`}>
                <i aria-hidden="true" className={`bi ${isLink ? "bi-link-45deg" : "bi-file-earmark"}`} />
                <span className={styles.attachmentKind}>{isLink ? t("Enlace") : t("Archivo")}</span>
                {isLink ? <a href={entry} target="_blank" rel="noreferrer noopener" title={entry}>{entry}</a>
                  : file ? <a href={file.url} target="_blank" rel="noreferrer noopener" title={file.name}>{file.name}</a>
                    : <span className={styles.attachmentName} title={entry}>{entry}</span>}
                <button type="button" aria-label={t("Quitar {0} {1}", t(isLink ? "enlace" : "archivo"), label)} onClick={() => onRemove(index)}>
                  <i aria-hidden="true" className="bi bi-x-lg" />
                </button>
              </li>;
            })}
          </ul>
        ) : <p className={styles.attachmentEmpty}>{t("Todavía no hay archivos ni enlaces.")}</p>}
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
  onSetAllCompleted,
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
  onSetAllCompleted: (completed: boolean) => void;
  onStartRemoval: (localKey: string) => void;
  onFinishRemoval: (localKey: string) => void;
}) {
  const t = useT();
  const active = subtasks.filter((item) => !exitingKeys.has(item.localKey));
  const allCompleted = active.length > 0 && active.every((item) => item.completed);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const copyText = active.map((item) => item.title.trim()).filter(Boolean).join("\n");

  const copyAll = async () => {
    if (!copyText || copyStatus === "copying") return;
    setCopyStatus("copying");
    try {
      await navigator.clipboard.writeText(copyText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  return (
    <section className={`${styles.editorSection} ${styles.editorSubtasks}`} aria-labelledby="task-subtasks-title">
      <div className={styles.subtaskHeader}>
        <h3 id="task-subtasks-title">{t("Checklist")}</h3>
        <div className={styles.subtaskHeaderActions}>
          {active.length > 1 && (
            <button
              className={styles.subtaskToggleAll}
              type="button"
              disabled={saving || savePending}
              onClick={() => onSetAllCompleted(!allCompleted)}
            >
              {allCompleted ? t("Desmarcar todos") : t("Marcar todos")}
            </button>
          )}
          <button
            className={styles.subtaskToggleAll}
            type="button"
            disabled={saving || savePending || !copyText || copyStatus === "copying"}
            onClick={() => void copyAll()}
          >
            {copyStatus === "copying" ? t("Copiando…") : t("Copiar todas")}
          </button>
        </div>
      </div>
      {copyStatus === "copied" && <p className={styles.editorHint} role="status">{t("Checklist copiada.")}</p>}
      {copyStatus === "error" && <p className={styles.editorError} role="alert">{t("No se pudo copiar. Revisa los permisos del portapapeles e inténtalo de nuevo.")}</p>}
      <div className={styles.subtaskAddRow}>
        <label className={styles.visuallyHidden} htmlFor="task-new-subtask">{t("Agregar item al checklist")}</label>
        <input
          ref={draftInputRef}
          id="task-new-subtask"
          value={draft}
          maxLength={255}
          placeholder={t("Agregar item…")}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            onAdd();
          }}
        />
        <button className={styles.subtaskAddButton} type="button" onClick={onAdd} disabled={!draft.trim()}>{t("Agregar")}</button>
      </div>
      {subtasks.length === 0 && !draft.trim() && <p className={styles.editorHint}>{t("Aún no hay ítems. Agrega uno para desglosar esta tarea.")}</p>}
      {subtasks.length > 0 && <ul className={styles.subtaskRows} aria-label={t("Elementos del checklist")}>
        {subtasks.map((item, index) => {
          const exiting = exitingKeys.has(item.localKey);
          const accessibleName = item.title.trim() || t("subtarea {0}", index + 1);
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
                aria-label={t("Marcar {0} como {1}", accessibleName, t(item.completed ? "pendiente" : "completada"))}
                onChange={(event) => onSetCompleted(item.localKey, event.target.checked)}
              />
            </label>
            <input
              className={`${styles.subtaskNameInput} ${item.completed ? styles.subtaskNameCompleted : ""}`}
              value={item.title}
              required={item.id !== undefined}
              maxLength={255}
              aria-label={t("Nombre de {0}", accessibleName)}
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
              aria-label={t("Eliminar {0}", accessibleName)}
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
