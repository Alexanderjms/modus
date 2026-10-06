"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Modal } from "../shell/modal";
import type { TaskCatalogsDto } from "../../api/tasks/route";
import type { BoardTask } from "./workspace-data";
import { fallbackPriorityColor, getTaskTagHue } from "./task-card";
import { ChatPicker } from "./chat-picker";
import { DatePicker } from "./date-picker";
import { getSubtasksToSave } from "./task-subtask-utils.mjs";
import styles from "./board.module.css";

type EditableSubtask = {
  id?: number;
  localKey: string;
  title: string;
  completed: boolean;
};

export type TaskEditPayload = {
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  attachments: string | null;
  priorityId?: number | null;
  tags: (number | string | { name: string; color: string })[];
  subtasks: { id?: number; title: string; completed: boolean }[];
};

export function TaskDetailModal({
  task,
  projectId,
  catalogs,
  onSave,
  savePending = false,
  onClose,
}: {
  task: BoardTask | null;
  projectId?: number;
  catalogs: TaskCatalogsDto | null;
  onSave: (taskId: number, projectId: number, column: 0 | 1 | 2, payload: TaskEditPayload) => Promise<string | null>;
  savePending?: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [attachments, setAttachments] = useState("");
  const [attachmentDraft, setAttachmentDraft] = useState("");
  const [priorityKey, setPriorityKey] = useState("");
  const [tagKeys, setTagKeys] = useState<string[]>([]);
  const [exitingTagKeys, setExitingTagKeys] = useState<Set<string>>(() => new Set());
  const exitingTagKeysRef = useRef(new Set<string>());
  const [newTag, setNewTag] = useState("");
  const [newTagColor, setNewTagColor] = useState("#007AFF");
  const [newTagColors, setNewTagColors] = useState<Record<string, string>>({});
  const [subtasks, setSubtasks] = useState<EditableSubtask[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [exitingSubtaskKeys, setExitingSubtaskKeys] = useState<Set<string>>(() => new Set());
  const exitingSubtaskKeysRef = useRef(new Set<string>());
  const nextSubtaskKey = useRef(0);
  const subtaskDraftValueRef = useRef("");
  const subtaskDraftInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tagError, setTagError] = useState("");
  const retainedTask = useRef<BoardTask | null>(task);
  const initialized = useRef<{ identity: string | null; catalogsReady: boolean }>({ identity: null, catalogsReady: false });
  if (task) retainedTask.current = task;
  const displayedTask = task ?? retainedTask.current;

  const cancelTagRemoval = (key: string) => {
    if (!exitingTagKeysRef.current.has(key)) return;
    const next = new Set(exitingTagKeysRef.current);
    next.delete(key);
    exitingTagKeysRef.current = next;
    setExitingTagKeys(next);
  };

  const finishTagRemoval = (key: string) => {
    if (!task || !exitingTagKeysRef.current.has(key)) return;
    setTagKeys((current) => current.filter((item) => item !== key));
    const next = new Set(exitingTagKeysRef.current);
    next.delete(key);
    exitingTagKeysRef.current = next;
    setExitingTagKeys(next);
  };

  const finishSubtaskRemoval = (localKey: string) => {
    if (!task || !exitingSubtaskKeysRef.current.has(localKey)) return;
    setSubtasks((current) => current.filter((item) => item.localKey !== localKey));
    const next = new Set(exitingSubtaskKeysRef.current);
    next.delete(localKey);
    exitingSubtaskKeysRef.current = next;
    setExitingSubtaskKeys(next);
  };

  const startTagRemoval = (key: string) => {
    if (exitingTagKeysRef.current.has(key)) return;
    const next = new Set(exitingTagKeysRef.current);
    next.add(key);
    exitingTagKeysRef.current = next;
    setExitingTagKeys(next);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finishTagRemoval(key);
  };

  const startSubtaskRemoval = (localKey: string) => {
    if (exitingSubtaskKeysRef.current.has(localKey)) return;
    const next = new Set(exitingSubtaskKeysRef.current);
    next.add(localKey);
    exitingSubtaskKeysRef.current = next;
    setExitingSubtaskKeys(next);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finishSubtaskRemoval(localKey);
  };

  const finishTagRemovalRef = useRef(finishTagRemoval);
  const finishSubtaskRemovalRef = useRef(finishSubtaskRemoval);
  finishTagRemovalRef.current = finishTagRemoval;
  finishSubtaskRemovalRef.current = finishSubtaskRemoval;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const removeImmediately = () => {
      if (!preference.matches) return;
      for (const key of exitingTagKeysRef.current) finishTagRemovalRef.current(key);
      for (const key of exitingSubtaskKeysRef.current) finishSubtaskRemovalRef.current(key);
    };
    preference.addEventListener("change", removeImmediately);
    return () => preference.removeEventListener("change", removeImmediately);
  }, []);

  useEffect(() => {
    if (!task) {
      initialized.current = { identity: null, catalogsReady: false };
      if (exitingTagKeysRef.current.size) {
        exitingTagKeysRef.current = new Set();
        setExitingTagKeys(exitingTagKeysRef.current);
      }
      if (exitingSubtaskKeysRef.current.size) {
        exitingSubtaskKeysRef.current = new Set();
        setExitingSubtaskKeys(exitingSubtaskKeysRef.current);
      }
      return;
    }
    const identity = `${projectId ?? ""}:${task.id}`;
    const taskChanged = initialized.current.identity !== identity;
    const catalogsLoaded = Boolean(catalogs) && !initialized.current.catalogsReady;
    if (!taskChanged && !catalogsLoaded) return;
    initialized.current = { identity, catalogsReady: Boolean(catalogs) };
    exitingTagKeysRef.current = new Set();
    setExitingTagKeys(exitingTagKeysRef.current);
    exitingSubtaskKeysRef.current = new Set();
    setExitingSubtaskKeys(exitingSubtaskKeysRef.current);
    nextSubtaskKey.current = 0;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setStartDate(task.startDate ?? "");
    setEndDate(task.endDate ?? "");
    setAttachments(task.attachments ?? "");
    setAttachmentDraft("");
    const priority = catalogs?.priorities.find((item) => item.name.toLocaleLowerCase("es") === task.priority.toLocaleLowerCase("es"));
    setPriorityKey(priority ? String(priority.id) : task.priority ? `current:${task.priority}` : "");
    setTagKeys(task.tags.map((tag) => catalogs?.tags.some((catalogTag) => catalogTag.id === tag.id)
      ? `id:${tag.id}`
      : `name:${tag.name}`));
    subtaskDraftValueRef.current = "";
    setSubtaskDraft("");
    setSubtasks(task.subtasks.map((subtask) => ({
      id: subtask.id,
      localKey: `db:${subtask.id}`,
      title: subtask.title,
      completed: "completed" in subtask && subtask.completed === true,
    })));
    setError("");
    setTagError("");
    setNewTag("");
    setNewTagColor("#007AFF");
    setNewTagColors({});
  }, [task, catalogs, projectId]);

  const addTag = () => {
    const name = newTag.trim();
    if (!name) return;
    const existing = catalogs?.tags.find((tag) => tag.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"));
    const key = existing ? `id:${existing.id}` : `name:${name}`;
    const duplicateKey = tagKeys.find((selected) => selected.startsWith("id:")
      ? catalogs?.tags.find((tag) => selected === `id:${tag.id}`)?.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es")
      : selected.slice(5).toLocaleLowerCase("es") === name.toLocaleLowerCase("es"));
    if (duplicateKey && exitingTagKeysRef.current.has(duplicateKey)) {
      cancelTagRemoval(duplicateKey);
      setTagError("");
      setNewTag("");
      return;
    }
    if (duplicateKey) {
      setTagError("Esa etiqueta ya está asociada.");
      return;
    }
    setTagKeys((current) => [...current, key]);
    if (!existing) setNewTagColors((current) => ({ ...current, [key]: newTagColor }));
    setTagError("");
    setNewTag("");
  };

  const attachmentEntries = attachments.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  const addAttachment = () => {
    const entry = attachmentDraft.trim();
    if (!entry) return;
    const next = [...attachmentEntries, entry].join("\n");
    if (next.length > 10000) {
      setError("Los adjuntos y enlaces no pueden superar 10 000 caracteres.");
      return;
    }
    setAttachments(next);
    setAttachmentDraft("");
    setError("");
  };
  const removeAttachment = (index: number) => {
    setAttachments(attachmentEntries.filter((_, entryIndex) => entryIndex !== index).join("\n"));
  };

  const setSubtaskTitle = (localKey: string, title: string) => {
    setSubtasks((current) => current.map((item) => item.localKey === localKey ? { ...item, title } : item));
  };

  const setSubtaskCompleted = (localKey: string, completed: boolean) => {
    setSubtasks((current) => current.map((item) => item.localKey === localKey ? { ...item, completed } : item));
  };

  const addSubtask = () => {
    const name = subtaskDraftValueRef.current.trim();
    if (!name) return;
    subtaskDraftValueRef.current = "";
    setSubtaskDraft("");
    setSubtasks((current) => [...current, {
      localKey: `new:${++nextSubtaskKey.current}`,
      title: name,
      completed: false,
    }]);
    requestAnimationFrame(() => subtaskDraftInputRef.current?.focus());
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!task || projectId === undefined || saving || savePending) return;
    if (startDate && endDate && startDate > endDate) {
      setError("La fecha de fin debe ser igual o posterior a la fecha de inicio.");
      return;
    }
    const removedTags = new Set(exitingTagKeysRef.current);
    const removedSubtasks = new Set(exitingSubtaskKeysRef.current);
    const pendingSubtask = subtaskDraft.trim();
    const currentSubtasks = pendingSubtask
      ? [...subtasks, { localKey: "draft:input", title: pendingSubtask, completed: false }]
      : subtasks;
    const savedSubtasks = getSubtasksToSave(currentSubtasks, removedSubtasks);
    const pendingAttachment = attachmentDraft.trim();
    const savedAttachments = pendingAttachment ? [...attachmentEntries, pendingAttachment].join("\n") : attachments.trim();
    if (savedAttachments.length > 10000) {
      setError("Los adjuntos y enlaces no pueden superar 10 000 caracteres.");
      return;
    }
    if (!savedSubtasks) {
      setError("Cada subtarea necesita un nombre o debe quitarse antes de guardar.");
      return;
    }
    setSaving(true);
    setError("");
    const selectedPriority = Number(priorityKey);
    const payload: TaskEditPayload = {
      title: title.trim(),
      description: description.trim() || null,
      startDate: startDate || null,
      endDate: endDate || null,
      attachments: savedAttachments || null,
      tags: tagKeys.filter((key) => !removedTags.has(key)).map((key) => {
        if (key.startsWith("id:")) return Number(key.slice(3));
        const name = key.slice(5);
        const color = newTagColors[key];
        return color ? { name, color } : name;
      }),
      subtasks: savedSubtasks,
    };
    if (priorityKey !== "" && !priorityKey.startsWith("current:")) payload.priorityId = Number.isSafeInteger(selectedPriority) ? selectedPriority : null;
    else if (priorityKey === "") payload.priorityId = null;
    const saveError = await onSave(task.id, projectId, task.column as 0 | 1 | 2, payload);
    setSaving(false);
    if (saveError) setError(saveError);
    else {
      setTagKeys((current) => current.filter((key) => !removedTags.has(key)));
      setSubtasks((current) => current.filter((item) => !removedSubtasks.has(item.localKey)));
      onClose();
    }
  };

  return (
    <Modal
      open={Boolean(task)}
      onClose={onClose}
      title={displayedTask?.title ?? "Detalle de tarea"}
      className={styles.taskEditorDialog}
      pending={saving || savePending}
      submitLabel={saving || savePending ? "Guardando…" : "Guardar cambios"}
      submitDisabled={!title.trim() || !catalogs}
      onSubmit={(event) => void submit(event)}
    >
      {displayedTask && (
        <div className={styles.taskEditor}>
          {error && <p className={styles.editorError} role="alert">{error}</p>}
          <fieldset className={styles.editorFormFields} disabled={saving || savePending || !catalogs}>
            {!catalogs ? (
            <div className={styles.catalogSkeleton} role="status" aria-label="Cargando catálogos">
              <span /><span /><span />
            </div>
            ) : (
            <>
              <div className={styles.editorGrid}>
                <label className={`${styles.editorField} ${styles.editorWide}`}>
                  <span>Nombre <i aria-hidden="true">*</i></span>
                  <input required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} />
                </label>
                <label className={`${styles.editorField} ${styles.editorWide}`}>
                  <span>Descripción</span>
                  <textarea rows={3} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} />
                </label>
                <div className={styles.editorField}>
                  <span>Prioridad</span>
                  <ChatPicker
                    label="Prioridad"
                    value={priorityKey}
                    options={[
                      { value: "", label: "Sin prioridad" },
                      ...(priorityKey.startsWith("current:") ? [{ value: priorityKey, label: `${priorityKey.slice(8)} (actual)`, color: task?.priorityColor || fallbackPriorityColor(priorityKey.slice(8).trim().toLocaleLowerCase("es")) }] : []),
                      ...catalogs.priorities.map((item) => ({ value: String(item.id), label: item.name, color: item.color || fallbackPriorityColor(item.name.trim().toLocaleLowerCase("es")) })),
                    ]}
                    onChange={setPriorityKey}
                    size="form"
                  />
                </div>
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
                    multipleValues={tagKeys.filter((key) => !exitingTagKeys.has(key))}
                    onMultipleChange={(values) => {
                      const selected = tagKeys.filter((key) => !exitingTagKeys.has(key));
                      selected.filter((key) => !values.includes(key)).forEach(startTagRemoval);
                      values.filter((key) => !selected.includes(key)).forEach((key) => {
                        if (exitingTagKeys.has(key)) cancelTagRemoval(key);
                        else setTagKeys((current) => current.includes(key) ? current : [...current, key]);
                      });
                    }}
                    footer={
                      <div className={styles.tagPickerFooter}>
                        <div className={styles.newTagRow}>
                          <label className={styles.visuallyHidden} htmlFor="task-new-tag">Crear etiqueta</label>
                          <input id="task-new-tag" value={newTag} maxLength={80} placeholder="Nueva etiqueta" onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} />
                          <input className={styles.newTagColor} type="color" aria-label="Color de nueva etiqueta" value={newTagColor} onChange={(event) => setNewTagColor(event.target.value)} />
                          <button type="button" onClick={addTag} disabled={!newTag.trim()}>Crear y asociar</button>
                        </div>
                      </div>
                    }
                    suspended={!task || saving || savePending}
                    size="form"
                  />
                  {tagError && <p className={styles.editorError} role="alert">{tagError}</p>}
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
                          if (event.target === event.currentTarget) finishTagRemoval(key);
                        }}
                      >
                        <span>{name}</span>
                        <button type="button" disabled={exiting} aria-label={`Quitar etiqueta ${name}`} onClick={() => startTagRemoval(key)}>
                          <i aria-hidden="true" className="bi bi-x-lg" />
                        </button>
                      </li>;
                    })}
                  </ul>
                </section>
                <div className={styles.editorField}>
                  <span>Fecha de inicio</span>
                  <DatePicker label="Fecha de inicio" value={startDate} max={endDate || undefined} invalid={Boolean(error && startDate && endDate && startDate > endDate)} onChange={setStartDate} disabled={saving || savePending || !catalogs} suspended={!task || saving || savePending} />
                </div>
                <div className={styles.editorField}>
                  <span>Fecha de fin</span>
                  <DatePicker label="Fecha de fin" value={endDate} min={startDate || undefined} invalid={Boolean(error && startDate && endDate && startDate > endDate)} onChange={setEndDate} disabled={saving || savePending || !catalogs} suspended={!task || saving || savePending} />
                </div>
                <div className={`${styles.editorField} ${styles.editorWide}`}>
                  <span>Adjuntos y enlaces</span>
                  <div className={styles.attachmentEditor}>
                    <div className={styles.attachmentAdd}>
                      <i aria-hidden="true" className="bi bi-paperclip" />
                      <label className={styles.visuallyHidden} htmlFor="task-attachment">Añadir enlace o archivo</label>
                      <input
                        id="task-attachment"
                        value={attachmentDraft}
                        maxLength={10000}
                        placeholder="Pega un enlace o escribe el nombre del archivo"
                        onChange={(event) => setAttachmentDraft(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addAttachment(); } }}
                      />
                      <button type="button" onClick={addAttachment} disabled={!attachmentDraft.trim()} aria-label="Añadir adjunto o enlace">
                        <i aria-hidden="true" className="bi bi-plus-lg" />
                        <span>Añadir</span>
                      </button>
                    </div>
                    {attachmentEntries.length ? (
                      <ul className={styles.attachmentList} aria-label="Adjuntos y enlaces">
                        {attachmentEntries.map((entry, index) => {
                          const isLink = /^https?:\/\//i.test(entry);
                          return <li key={`${entry}:${index}`}>
                            <i aria-hidden="true" className={`bi ${isLink ? "bi-link-45deg" : "bi-file-earmark"}`} />
                            <span className={styles.attachmentKind}>{isLink ? "Enlace" : "Archivo"}</span>
                            {isLink ? <a href={entry} target="_blank" rel="noreferrer noopener" title={entry}>{entry}</a> : <span className={styles.attachmentName} title={entry}>{entry}</span>}
                            <button type="button" aria-label={`Quitar ${isLink ? "enlace" : "archivo"} ${entry}`} onClick={() => removeAttachment(index)}>
                              <i aria-hidden="true" className="bi bi-x-lg" />
                            </button>
                          </li>;
                        })}
                      </ul>
                    ) : <p className={styles.attachmentEmpty}>Todavía no hay archivos ni enlaces.</p>}
                  </div>
                </div>
              </div>

              <section className={`${styles.editorSection} ${styles.editorSubtasks}`} aria-labelledby="task-subtasks-title">
                <h3 id="task-subtasks-title">Checklist</h3>
                <div className={styles.subtaskAddRow}>
                  <label className={styles.visuallyHidden} htmlFor="task-new-subtask">Agregar item al checklist</label>
                  <input
                    ref={subtaskDraftInputRef}
                    id="task-new-subtask"
                    value={subtaskDraft}
                    maxLength={255}
                    placeholder="Agregar item…"
                    onChange={(event) => {
                      subtaskDraftValueRef.current = event.target.value;
                      setSubtaskDraft(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                      event.preventDefault();
                      addSubtask();
                    }}
                  />
                  <button className={styles.subtaskAddButton} type="button" onClick={addSubtask} disabled={!subtaskDraft.trim()}>Agregar</button>
                </div>
                {subtasks.length === 0 && !subtaskDraft.trim() && <p className={styles.editorHint}>Aún no hay ítems. Agrega uno para desglosar esta tarea.</p>}
                {subtasks.length > 0 && <ul className={styles.subtaskRows} aria-label="Elementos del checklist">
                  {subtasks.map((item, index) => {
                    const exiting = exitingSubtaskKeys.has(item.localKey);
                    const accessibleName = item.title.trim() || `subtarea ${index + 1}`;
                    return <li
                      className={`${styles.subtaskRow} ${exiting ? styles.editorItemExiting : ""}`}
                      key={item.localKey}
                      aria-hidden={exiting || undefined}
                      inert={exiting || undefined}
                      onAnimationEnd={(event) => {
                        if (event.target === event.currentTarget) finishSubtaskRemoval(item.localKey);
                      }}
                    >
                      <label className={styles.subtaskCompletion}>
                        <input
                          type="checkbox"
                          checked={item.completed}
                          disabled={saving || savePending || exiting}
                          aria-label={`Marcar ${accessibleName} como ${item.completed ? "pendiente" : "completada"}`}
                          onChange={(event) => setSubtaskCompleted(item.localKey, event.target.checked)}
                        />
                      </label>
                      <input
                        className={`${styles.subtaskNameInput} ${item.completed ? styles.subtaskNameCompleted : ""}`}
                        value={item.title}
                        required={item.id !== undefined}
                        maxLength={255}
                        aria-label={`Nombre de ${accessibleName}`}
                        disabled={saving || savePending || exiting}
                        onChange={(event) => setSubtaskTitle(item.localKey, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                          event.preventDefault();
                          subtaskDraftInputRef.current?.focus();
                        }}
                      />
                      <button
                        className={styles.subtaskRemove}
                        type="button"
                        aria-label={`Eliminar ${accessibleName}`}
                        disabled={saving || savePending || exiting}
                        onClick={() => startSubtaskRemoval(item.localKey)}
                      >
                        <i aria-hidden="true" className="bi bi-trash3" />
                      </button>
                    </li>;
                  })}
                </ul>}
              </section>
            </>
            )}
          </fieldset>
        </div>
      )}
    </Modal>
  );
}
