"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TaskSuggestionChanges } from "../../chat-contract";
import type { TaskCatalogsDto } from "../../api/tasks/route";
import { Modal } from "../shell/modal";
import { ChatPicker } from "./chat-picker";
import { DatePicker } from "./date-picker";
import { fallbackPriorityColor } from "./task-card";
import { TaskSubtasksSection, TaskTagsSection, type EditableSubtask } from "./task-detail-sections";
import styles from "./task-editor.module.css";
import cardStyles from "./task-suggestion-card.module.css";
import { useT } from "../../i18n/provider";

type Tag = { name: string; color?: string };
type Priority = NonNullable<TaskSuggestionChanges["priority"]>;

export type SuggestionTargetTask = {
  title: string;
  description: string;
  priority: string;
  startDate: string | null;
  endDate: string | null;
  column: number;
  tags: Tag[];
  subtasks: { title: string; completed: boolean }[];
};

export const columnNames = ["Por hacer", "En progreso", "Terminado"];
const priorityNames: Record<Priority, string> = { alta: "Alta", media: "Media", baja: "Baja", "sin prioridad": "Sin prioridad" };

const norm = (value: string) => value.trim().toLocaleLowerCase("es");

export function describeChanges(changes: TaskSuggestionChanges, t: (key: string) => string): [string, string][] {
  const rows: [string, string][] = [];
  if (changes.title !== undefined) rows.push([t("Nombre"), changes.title]);
  if (changes.description !== undefined) rows.push([t("Descripción"), changes.description || t("Sin descripción")]);
  if (changes.priority !== undefined) rows.push([t("Prioridad"), t(priorityNames[changes.priority])]);
  if (changes.startDate !== undefined) rows.push([t("Inicio"), changes.startDate ?? t("Sin fecha")]);
  if (changes.endDate !== undefined) rows.push([t("Fin"), changes.endDate ?? t("Sin fecha")]);
  if (changes.column !== undefined) rows.push([t("Columna"), t(columnNames[changes.column])]);
  if (changes.addTags?.length) rows.push([t("Añadir etiquetas"), changes.addTags.map(({ name }) => name).join(", ")]);
  if (changes.removeTags?.length) rows.push([t("Quitar etiquetas"), changes.removeTags.join(", ")]);
  if (changes.addSubtasks?.length) rows.push([t("Añadir subtareas"), changes.addSubtasks.map(({ title }) => title).join(" · ")]);
  if (changes.removeSubtasks?.length) rows.push([t("Quitar subtareas"), changes.removeSubtasks.join(" · ")]);
  if (changes.completeSubtasks?.length) rows.push([t("Completar subtareas"), changes.completeSubtasks.join(" · ")]);
  if (changes.reopenSubtasks?.length) rows.push([t("Reabrir subtareas"), changes.reopenSubtasks.join(" · ")]);
  if (changes.renameSubtasks?.length) rows.push([t("Renombrar subtareas"), changes.renameSubtasks.map(({ from, to }) => `${from} → ${to}`).join(" · ")]);
  return rows;
}

type FormState = {
  title: string;
  description: string;
  priorityKey: string;
  column: string;
  startDate: string;
  endDate: string;
  tagKeys: string[];
  newTagColors: Record<string, string>;
  subtasks: EditableSubtask[];
};

function tagKeyFor(name: string, catalogs: TaskCatalogsDto) {
  const found = catalogs.tags.find((tag) => norm(tag.name) === norm(name));
  return found ? `id:${found.id}` : `name:${name.trim()}`;
}

function initialState(target: SuggestionTargetTask, catalogs: TaskCatalogsDto, changes: TaskSuggestionChanges) {
  const priorityName = norm(changes.priority ?? target.priority);
  const priority = catalogs.priorities.find((item) => norm(item.name) === priorityName);

  const removedTags = new Set((changes.removeTags ?? []).map(norm));
  const tagKeys: string[] = [];
  const newTagColors: Record<string, string> = {};
  for (const tag of target.tags) {
    if (!removedTags.has(norm(tag.name))) tagKeys.push(tagKeyFor(tag.name, catalogs));
  }
  for (const tag of changes.addTags ?? []) {
    const key = tagKeyFor(tag.name, catalogs);
    if (tagKeys.includes(key)) continue;
    tagKeys.push(key);
    if (key.startsWith("name:") && tag.color) newTagColors[key] = tag.color;
  }

  const removed = new Set((changes.removeSubtasks ?? []).map(norm));
  const completed = new Set((changes.completeSubtasks ?? []).map(norm));
  const reopened = new Set((changes.reopenSubtasks ?? []).map(norm));
  const renamed = new Map((changes.renameSubtasks ?? []).map((item) => [norm(item.from), item.to]));
  const subtasks: EditableSubtask[] = [];
  target.subtasks.forEach((item, index) => {
    const key = norm(item.title);
    if (removed.has(key)) return;
    subtasks.push({
      id: index + 1,
      localKey: `db:${index}`,
      title: renamed.get(key) ?? item.title,
      completed: completed.has(key) ? true : reopened.has(key) ? false : item.completed,
    });
  });
  (changes.addSubtasks ?? []).forEach((item, index) => {
    subtasks.push({ localKey: `new:${index}`, title: item.title, completed: false });
  });

  return {
    title: changes.title ?? target.title,
    description: changes.description ?? target.description,
    priorityKey: priority ? String(priority.id) : "",
    column: String(changes.column ?? target.column),
    startDate: (changes.startDate !== undefined ? changes.startDate : target.startDate) ?? "",
    endDate: (changes.endDate !== undefined ? changes.endDate : target.endDate) ?? "",
    tagKeys,
    newTagColors,
    subtasks,
  } satisfies FormState;
}

export function TaskEditReview({
  open,
  onClose,
  changes,
  target,
  catalogs,
  targetLabel,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  changes: TaskSuggestionChanges;
  target?: SuggestionTargetTask;
  catalogs: TaskCatalogsDto | null;
  targetLabel: string;
  pending: boolean;
  onSubmit: (changes: TaskSuggestionChanges) => Promise<string | null>;
}) {
  const t = useT();
  const [form, setForm] = useState<FormState | null>(null);
  const [newTag, setNewTag] = useState("");
  const [newTagColor, setNewTagColor] = useState("#007AFF");
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [error, setError] = useState("");
  const nextKey = useRef(100);
  const draftInput = useRef<HTMLInputElement>(null);
  const draftRef = useRef("");

  useEffect(() => {
    if (!open) return;
    setForm(target && catalogs ? initialState(target, catalogs, changes) : null);
    setNewTag("");
    setSubtaskDraft("");
    draftRef.current = "";
    setError("");
  }, [open]);

  function patch(next: Partial<FormState>) {
    setForm((current) => current && { ...current, ...next });
    setError("");
  }

  function addTag() {
    if (!form || !catalogs) return;
    const name = newTag.trim();
    if (!name) return;
    const key = tagKeyFor(name, catalogs);
    if (!form.tagKeys.includes(key)) {
      patch({
        tagKeys: [...form.tagKeys, key],
        newTagColors: key.startsWith("name:") ? { ...form.newTagColors, [key]: newTagColor } : form.newTagColors,
      });
    }
    setNewTag("");
  }

  function addSubtask() {
    const title = draftRef.current.trim();
    if (!form || !title) return;
    patch({ subtasks: [...form.subtasks, { localKey: `new:${++nextKey.current}`, title, completed: false }] });
    draftRef.current = "";
    setSubtaskDraft("");
    requestAnimationFrame(() => draftInput.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || !catalogs || !form) {
      const failure = await onSubmit(changes);
      if (failure) setError(failure);
      return;
    }
    const title = form.title.trim();
    if (!title || title.length > 255) return setError(t("El nombre debe tener entre 1 y 255 caracteres."));
    if (form.description.length > 2000) return setError(t("La descripción no puede superar 2000 caracteres."));
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      return setError(t("La fecha de inicio no puede ser posterior a la de fin."));
    }

    const diff: TaskSuggestionChanges = {};
    if (title !== target.title) diff.title = title;
    if (form.description.trim() !== target.description.trim()) diff.description = form.description.trim();
    const priorityName = catalogs.priorities.find((item) => String(item.id) === form.priorityKey)?.name ?? "sin prioridad";
    if (norm(priorityName) !== norm(target.priority)) diff.priority = norm(priorityName) as Priority;
    if (form.startDate !== (target.startDate ?? "")) diff.startDate = form.startDate || null;
    if (form.endDate !== (target.endDate ?? "")) diff.endDate = form.endDate || null;
    if (Number(form.column) !== target.column) diff.column = Number(form.column) as 0 | 1 | 2;

    const finalTags = form.tagKeys.map((key) => {
      const catalogTag = key.startsWith("id:") ? catalogs.tags.find((item) => key === `id:${item.id}`) : undefined;
      return { name: catalogTag?.name ?? key.slice(5), color: form.newTagColors[key] };
    });
    const addTags = finalTags
      .filter(({ name }) => !target.tags.some((tag) => norm(tag.name) === norm(name)))
      .map(({ name, color }) => (color ? { name, color } : { name }));
    const removeTags = target.tags.filter(({ name }) => !finalTags.some((tag) => norm(tag.name) === norm(name))).map(({ name }) => name);
    if (addTags.length > 10 || removeTags.length > 10) return setError(t("Se admiten hasta 10 cambios de etiquetas por propuesta."));
    if (addTags.length) diff.addTags = addTags;
    if (removeTags.length) diff.removeTags = removeTags;

    const draft = draftRef.current.trim();
    const rows = draft ? [...form.subtasks, { localKey: "draft:input", title: draft, completed: false }] : form.subtasks;
    const kept = rows.filter((row) => row.localKey.startsWith("db:"));
    const added = rows.filter((row) => !row.localKey.startsWith("db:")).map((row) => row.title.trim()).filter(Boolean);
    if (kept.some((row) => !row.title.trim())) return setError(t("Las subtareas existentes no pueden quedar sin nombre."));
    if (added.length > 20 || rows.some((row) => row.title.length > 255)) {
      return setError(t("Se admiten hasta 20 subtareas nuevas de máximo 255 caracteres."));
    }
    const original = (row: EditableSubtask) => target.subtasks[Number(row.localKey.slice(3))];
    const removeSubtasks = target.subtasks.filter((_, index) => !kept.some((row) => row.localKey === `db:${index}`)).map((item) => item.title);
    const renameSubtasks = kept.filter((row) => row.title.trim() !== original(row).title).map((row) => ({ from: original(row).title, to: row.title.trim() }));
    const completeSubtasks = kept.filter((row) => row.completed && !original(row).completed).map((row) => original(row).title);
    const reopenSubtasks = kept.filter((row) => !row.completed && original(row).completed).map((row) => original(row).title);
    if ([removeSubtasks, renameSubtasks, completeSubtasks, reopenSubtasks].some((list) => list.length > 20)) {
      return setError(t("Se admiten hasta 20 cambios por lista de subtareas."));
    }
    if (added.length) diff.addSubtasks = added.map((item) => ({ title: item }));
    if (removeSubtasks.length) diff.removeSubtasks = removeSubtasks;
    if (renameSubtasks.length) diff.renameSubtasks = renameSubtasks;
    if (completeSubtasks.length) diff.completeSubtasks = completeSubtasks;
    if (reopenSubtasks.length) diff.reopenSubtasks = reopenSubtasks;

    if (Object.keys(diff).length === 0) return setError(t("No hay cambios que aplicar."));
    const failure = await onSubmit(diff);
    if (failure) setError(failure);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("Revisar cambios")}
      className={styles.taskEditorDialog}
      submitLabel={pending ? t("Aplicando…") : t("Aplicar cambios")}
      pending={pending}
      submitDisabled={!!form && !form.title.trim()}
      onSubmit={(event) => void submit(event)}
    >
      <div className={styles.taskEditor}>
        {error && <p className={styles.editorError} role="alert">{t(error)}</p>}
        {!form || !catalogs ? (
          <div className={cardStyles.fields}>
            <p className={cardStyles.notice}>
              {t("No se pudo cargar la tarea actual (")}{targetLabel}{t("); se aplicarán los cambios propuestos tal cual.")}
            </p>
            <dl className={cardStyles.changes} aria-label={t("Cambios propuestos")}>
              {describeChanges(changes, t).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          </div>
        ) : (
          <fieldset className={styles.editorFormFields} disabled={pending}>
            <div className={styles.editorGrid}>
              <label className={`${styles.editorField} ${styles.editorWide}`}>
                <span>{t("Nombre")} <i aria-hidden="true">*</i></span>
                <input required maxLength={255} value={form.title} onChange={(event) => patch({ title: event.target.value })} />
              </label>
              <label className={`${styles.editorField} ${styles.editorWide}`}>
                <span>{t("Descripción")}</span>
                <textarea rows={3} maxLength={2000} value={form.description} onChange={(event) => patch({ description: event.target.value })} />
              </label>
              <div className={styles.editorField}>
                <span>{t("Prioridad")}</span>
                <ChatPicker
                  label={t("Prioridad")}
                  value={form.priorityKey}
                  options={[
                    { value: "", label: "Sin prioridad" },
                    ...catalogs.priorities
                      .filter((item) => norm(item.name) !== "sin prioridad")
                      .map((item) => ({ value: String(item.id), label: item.name, color: item.color || fallbackPriorityColor(norm(item.name)) })),
                  ]}
                  onChange={(value) => patch({ priorityKey: value })}
                  size="form"
                />
              </div>
              <TaskTagsSection
                catalogs={catalogs}
                tagKeys={form.tagKeys}
                exitingTagKeys={new Set()}
                newTag={newTag}
                newTagColor={newTagColor}
                newTagColors={form.newTagColors}
                tagError=""
                tagActionNotice=""
                saving={false}
                savePending={pending}
                suspended={!open}
                onNewTagChange={setNewTag}
                onNewTagColorChange={setNewTagColor}
                onAddTag={addTag}
                onAppendTagKey={(key) => patch({ tagKeys: form.tagKeys.includes(key) ? form.tagKeys : [...form.tagKeys, key] })}
                onStartRemoval={(key) => patch({ tagKeys: form.tagKeys.filter((item) => item !== key) })}
                onCancelRemoval={() => {}}
                onFinishRemoval={() => {}}
              />
              <div className={styles.editorField}>
                <span>{t("Fecha de inicio")}</span>
                <DatePicker label={t("Fecha de inicio")} value={form.startDate} max={form.endDate || undefined} invalid={Boolean(error && form.startDate && form.endDate && form.startDate > form.endDate)} onChange={(value) => patch({ startDate: value })} disabled={pending} suspended={!open || pending} />
              </div>
              <div className={styles.editorField}>
                <span>{t("Fecha de fin")}</span>
                <DatePicker label={t("Fecha de fin")} value={form.endDate} min={form.startDate || undefined} invalid={Boolean(error && form.startDate && form.endDate && form.startDate > form.endDate)} onChange={(value) => patch({ endDate: value })} disabled={pending} suspended={!open || pending} />
              </div>
              <div className={`${styles.editorField} ${styles.editorWide}`}>
                <span>{t("Columna")}</span>
                <ChatPicker
                  label={t("Columna")}
                  value={form.column}
                  options={columnNames.map((name, index) => ({ value: String(index), label: t(name) }))}
                  onChange={(value) => patch({ column: value })}
                  size="form"
                />
              </div>
            </div>

            <TaskSubtasksSection
              subtasks={form.subtasks}
              draft={subtaskDraft}
              exitingKeys={new Set()}
              saving={false}
              savePending={pending}
              draftInputRef={draftInput}
              onDraftChange={(value) => { draftRef.current = value; setSubtaskDraft(value); }}
              onAdd={addSubtask}
              onSetTitle={(key, title) => patch({ subtasks: form.subtasks.map((item) => item.localKey === key ? { ...item, title } : item) })}
              onSetCompleted={(key, completed) => patch({ subtasks: form.subtasks.map((item) => item.localKey === key ? { ...item, completed } : item) })}
              onSetAllCompleted={(completed) => patch({ subtasks: form.subtasks.map((item) => ({ ...item, completed })) })}
              onStartRemoval={(key) => patch({ subtasks: form.subtasks.filter((item) => item.localKey !== key) })}
              onFinishRemoval={() => {}}
            />
          </fieldset>
        )}
      </div>
    </Modal>
  );
}
