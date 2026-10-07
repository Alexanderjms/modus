"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { TaskSuggestionChanges } from "../../chat-contract";
import { Modal } from "../shell/modal";
import styles from "./task-suggestion-card.module.css";

type Tag = { name: string; color?: string };
type SubtaskRow = { title: string; completed: boolean; existing: boolean };
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

const same = (a: string, b: string) => a.trim().toLocaleLowerCase("es") === b.trim().toLocaleLowerCase("es");

export function describeChanges(changes: TaskSuggestionChanges): [string, string][] {
  const rows: [string, string][] = [];
  if (changes.title !== undefined) rows.push(["Nombre", changes.title]);
  if (changes.description !== undefined) rows.push(["Descripción", changes.description || "Sin descripción"]);
  if (changes.priority !== undefined) rows.push(["Prioridad", priorityNames[changes.priority]]);
  if (changes.startDate !== undefined) rows.push(["Inicio", changes.startDate ?? "Sin fecha"]);
  if (changes.endDate !== undefined) rows.push(["Fin", changes.endDate ?? "Sin fecha"]);
  if (changes.column !== undefined) rows.push(["Columna", columnNames[changes.column]]);
  if (changes.addTags?.length) rows.push(["Añadir etiquetas", changes.addTags.map(({ name }) => name).join(", ")]);
  if (changes.removeTags?.length) rows.push(["Quitar etiquetas", changes.removeTags.join(", ")]);
  if (changes.addSubtasks?.length) rows.push(["Añadir subtareas", changes.addSubtasks.map(({ title }) => title).join(" · ")]);
  if (changes.removeSubtasks?.length) rows.push(["Quitar subtareas", changes.removeSubtasks.join(" · ")]);
  if (changes.completeSubtasks?.length) rows.push(["Completar subtareas", changes.completeSubtasks.join(" · ")]);
  if (changes.reopenSubtasks?.length) rows.push(["Reabrir subtareas", changes.reopenSubtasks.join(" · ")]);
  return rows;
}

function initialState(target: SuggestionTargetTask, changes: TaskSuggestionChanges) {
  const removedTags = new Set((changes.removeTags ?? []).map((name) => name.trim().toLocaleLowerCase("es")));
  const tags: Tag[] = target.tags.filter(({ name }) => !removedTags.has(name.trim().toLocaleLowerCase("es")));
  for (const tag of changes.addTags ?? []) if (!tags.some(({ name }) => same(name, tag.name))) tags.push({ ...tag });

  const removed = new Set((changes.removeSubtasks ?? []).map((title) => title.trim().toLocaleLowerCase("es")));
  const completed = new Set((changes.completeSubtasks ?? []).map((title) => title.trim().toLocaleLowerCase("es")));
  const reopened = new Set((changes.reopenSubtasks ?? []).map((title) => title.trim().toLocaleLowerCase("es")));
  const subtasks: SubtaskRow[] = target.subtasks
    .filter(({ title }) => !removed.has(title.trim().toLocaleLowerCase("es")))
    .map(({ title, completed: done }) => {
      const key = title.trim().toLocaleLowerCase("es");
      return { title, completed: completed.has(key) ? true : reopened.has(key) ? false : done, existing: true };
    });
  for (const { title } of changes.addSubtasks ?? []) subtasks.push({ title, completed: false, existing: false });

  return {
    title: changes.title ?? target.title,
    description: changes.description ?? target.description,
    priority: (changes.priority ?? target.priority) as Priority,
    startDate: (changes.startDate !== undefined ? changes.startDate : target.startDate) ?? "",
    endDate: (changes.endDate !== undefined ? changes.endDate : target.endDate) ?? "",
    column: changes.column ?? target.column,
    tags,
    subtasks,
  };
}

export function TaskEditReview({
  open,
  onClose,
  changes,
  target,
  targetLabel,
  catalogTags,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  changes: TaskSuggestionChanges;
  target?: SuggestionTargetTask;
  targetLabel: string;
  catalogTags: { name: string; color: string | null }[];
  pending: boolean;
  onSubmit: (changes: TaskSuggestionChanges) => Promise<string | null>;
}) {
  const [form, setForm] = useState(() => target ? initialState(target, changes) : null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#007aff");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(target ? initialState(target, changes) : null);
    setNewTagName("");
    setError("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function patch(next: Partial<NonNullable<typeof form>>) {
    setForm((current) => current && { ...current, ...next });
    setError("");
  }

  function addTag() {
    if (!form) return;
    const name = newTagName.trim();
    if (!name || name.length > 80) return;
    if (form.tags.some((tag) => same(tag.name, name))) {
      setError("Cada etiqueta debe tener un nombre distinto.");
      return;
    }
    patch({ tags: [...form.tags, { name, color: newTagColor }] });
    setNewTagName("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || !form) {
      const failure = await onSubmit(changes);
      if (failure) setError(failure);
      return;
    }
    const diff: TaskSuggestionChanges = {};
    const title = form.title.trim();
    if (!title || title.length > 255) return setError("El nombre debe tener entre 1 y 255 caracteres.");
    if (form.description.length > 2000) return setError("La descripción no puede superar 2000 caracteres.");
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      return setError("La fecha de inicio no puede ser posterior a la de fin.");
    }
    if (title !== target.title) diff.title = title;
    if (form.description.trim() !== target.description.trim()) diff.description = form.description.trim();
    if (form.priority !== target.priority) diff.priority = form.priority;
    if (form.startDate !== (target.startDate ?? "")) diff.startDate = form.startDate || null;
    if (form.endDate !== (target.endDate ?? "")) diff.endDate = form.endDate || null;
    if (form.column !== target.column) diff.column = form.column as 0 | 1 | 2;

    const finalTags = form.tags.map(({ name, color }) => ({ name: name.trim(), color })).filter(({ name }) => name);
    if (finalTags.some(({ name }) => name.length > 80)) return setError("Los nombres de etiqueta deben tener entre 1 y 80 caracteres.");
    const addTags = finalTags
      .filter(({ name }) => !target.tags.some((tag) => same(tag.name, name)))
      .map(({ name, color }) => catalogTags.some((item) => same(item.name, name)) || !color ? { name } : { name, color });
    const removeTags = target.tags.filter(({ name }) => !finalTags.some((tag) => same(tag.name, name))).map(({ name }) => name);
    if (addTags.length > 10 || removeTags.length > 10) return setError("Se admiten hasta 10 cambios de etiquetas por propuesta.");
    if (addTags.length) diff.addTags = addTags;
    if (removeTags.length) diff.removeTags = removeTags;

    const kept = form.subtasks.filter((row) => row.existing);
    const added = form.subtasks.filter((row) => !row.existing).map((row) => row.title.trim()).filter(Boolean);
    if (added.length > 20 || added.some((item) => item.length > 255)) {
      return setError("Se admiten hasta 20 subtareas nuevas de máximo 255 caracteres.");
    }
    const removeSubtasks = target.subtasks.filter(({ title: item }) => !kept.some((row) => row.title === item)).map(({ title: item }) => item);
    const completeSubtasks = kept.filter((row) => row.completed && !target.subtasks.find((st) => st.title === row.title)?.completed).map((row) => row.title);
    const reopenSubtasks = kept.filter((row) => !row.completed && target.subtasks.find((st) => st.title === row.title)?.completed).map((row) => row.title);
    if ([removeSubtasks, completeSubtasks, reopenSubtasks].some((list) => list.length > 20)) {
      return setError("Se admiten hasta 20 cambios por lista de subtareas.");
    }
    if (added.length) diff.addSubtasks = added.map((item) => ({ title: item }));
    if (removeSubtasks.length) diff.removeSubtasks = removeSubtasks;
    if (completeSubtasks.length) diff.completeSubtasks = completeSubtasks;
    if (reopenSubtasks.length) diff.reopenSubtasks = reopenSubtasks;

    if (Object.keys(diff).length === 0) return setError("No hay cambios que aplicar.");
    const failure = await onSubmit(diff);
    if (failure) setError(failure);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Revisar cambios"
      submitLabel={pending ? "Aplicando…" : "Aplicar cambios"}
      pending={pending}
      submitDisabled={!!form && !form.title.trim()}
      onSubmit={(event) => void submit(event)}
      className={styles.reviewModal}
    >
      <div className={styles.fields}>
        <label>
          <span>Tarea</span>
          <input value={targetLabel} readOnly />
        </label>
        {!form ? (
          <>
            <p className={styles.notice}>No se pudo cargar la tarea actual; se aplicarán los cambios propuestos tal cual.</p>
            <dl className={styles.changes} aria-label="Cambios propuestos">
              {describeChanges(changes).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          </>
        ) : (
          <>
            <label>
              <span>Nombre</span>
              <input value={form.title} maxLength={255} required disabled={pending} onChange={(event) => patch({ title: event.target.value })} />
            </label>
            <label>
              <span>Descripción</span>
              <textarea value={form.description} maxLength={2000} rows={3} disabled={pending} onChange={(event) => patch({ description: event.target.value })} />
            </label>
            <label>
              <span>Prioridad</span>
              <select value={form.priority} disabled={pending} onChange={(event) => patch({ priority: event.target.value as Priority })}>
                {(Object.keys(priorityNames) as Priority[]).map((key) => <option key={key} value={key}>{priorityNames[key]}</option>)}
              </select>
            </label>
            <div className={styles.twoCols}>
              <label>
                <span>Inicio</span>
                <input type="date" value={form.startDate} disabled={pending} onChange={(event) => patch({ startDate: event.target.value })} />
              </label>
              <label>
                <span>Fin</span>
                <input type="date" value={form.endDate} disabled={pending} onChange={(event) => patch({ endDate: event.target.value })} />
              </label>
            </div>
            <label>
              <span>Columna</span>
              <select value={form.column} disabled={pending} onChange={(event) => patch({ column: Number(event.target.value) })}>
                {columnNames.map((name, index) => <option key={name} value={index}>{name}</option>)}
              </select>
            </label>
            <fieldset className={styles.subtasks}>
              <legend>Subtareas</legend>
              {form.subtasks.map((row, index) => (
                <div className={styles.subtaskRow} key={index}>
                  <input
                    type="checkbox"
                    aria-label={`Completada: ${row.title || `subtarea ${index + 1}`}`}
                    checked={row.completed}
                    disabled={pending}
                    onChange={(event) => patch({ subtasks: form.subtasks.map((item, i) => i === index ? { ...item, completed: event.target.checked } : item) })}
                  />
                  {row.existing ? (
                    <span className={`${styles.subtaskTitle} ${row.completed ? styles.subtaskDone : ""}`}>{row.title}</span>
                  ) : (
                    <input
                      aria-label={`Subtarea nueva ${index + 1}`}
                      value={row.title}
                      maxLength={255}
                      disabled={pending}
                      onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault(); }}
                      onChange={(event) => patch({ subtasks: form.subtasks.map((item, i) => i === index ? { ...item, title: event.target.value } : item) })}
                    />
                  )}
                  <button type="button" aria-label={`Quitar subtarea ${row.title || index + 1}`} disabled={pending} onClick={() => patch({ subtasks: form.subtasks.filter((_, i) => i !== index) })}>
                    <i className="bi bi-x-lg" aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button className={styles.addSubtask} type="button" disabled={pending} onClick={() => patch({ subtasks: [...form.subtasks, { title: "", completed: false, existing: false }] })}>
                Añadir subtarea
              </button>
            </fieldset>
            <fieldset className={styles.tagsEditor}>
              <legend>Etiquetas</legend>
              {form.tags.map((tag, index) => {
                const existing = catalogTags.find((item) => same(item.name, tag.name));
                return <div className={styles.tagRow} key={index}>
                  <input
                    aria-label={`Nombre de etiqueta ${index + 1}`}
                    value={tag.name}
                    maxLength={80}
                    disabled={pending}
                    onChange={(event) => patch({ tags: form.tags.map((item, i) => i === index ? { ...item, name: event.target.value } : item) })}
                  />
                  <input
                    type="color"
                    aria-label={`Color de etiqueta ${tag.name || index + 1}`}
                    value={existing?.color || tag.color || "#7c8a99"}
                    disabled={pending || !!existing}
                    onChange={(event) => patch({ tags: form.tags.map((item, i) => i === index ? { ...item, color: event.target.value } : item) })}
                  />
                  <button type="button" aria-label={`Quitar etiqueta ${tag.name || index + 1}`} disabled={pending} onClick={() => patch({ tags: form.tags.filter((_, i) => i !== index) })}>
                    <i className="bi bi-x-lg" aria-hidden="true" />
                  </button>
                </div>;
              })}
              <div className={styles.newTagRow}>
                <input
                  aria-label="Nombre de nueva etiqueta"
                  placeholder="Nueva etiqueta"
                  value={newTagName}
                  maxLength={80}
                  disabled={pending}
                  onChange={(event) => { setNewTagName(event.target.value); setError(""); }}
                  onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); addTag(); } }}
                />
                <input type="color" aria-label="Color de nueva etiqueta" value={newTagColor} disabled={pending} onChange={(event) => setNewTagColor(event.target.value)} />
                <button className={styles.addSubtask} type="button" disabled={pending || !newTagName.trim()} onClick={addTag}>Añadir</button>
              </div>
            </fieldset>
          </>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
