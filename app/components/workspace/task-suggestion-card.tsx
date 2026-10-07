"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import type { TaskSuggestion, TaskSuggestionChanges } from "../../chat-contract";
import { Modal } from "../shell/modal";
import type { TaskCatalogsDto } from "../../api/tasks/route";
import { describeChanges, TaskEditReview, type SuggestionTargetTask } from "./task-edit-review";
import { fallbackPriorityColor, getTaskTagHue } from "./task-card";
import styles from "./task-suggestion-card.module.css";

export type { SuggestionTargetTask };
export type SuggestedTag = { name: string; color?: string };
export type TaskSuggestionView = TaskSuggestion & {
  kind?: "create" | "add-tags" | "add-subtasks" | "edit";
  targetTaskId?: number;
  tags?: SuggestedTag[];
};
type TaskCreateDraft = Pick<TaskSuggestion, "title" | "description" | "priority" | "subtasks"> & { tags?: SuggestedTag[] };
export type TaskSuggestionDraft = TaskCreateDraft | { tags: SuggestedTag[] } | { subtasks: { title: string }[] } | { changes: TaskSuggestionChanges };
type CatalogTag = { name: string; color: string | null };

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase("es");
}

export function TaskSuggestionCard({
  suggestion,
  targetTaskTitle,
  targetTask,
  catalogs,
  catalogTags,
  actionsDisabled,
  pending,
  onAccept,
  onDiscard,
  onUndoDiscard,
}: {
  suggestion: TaskSuggestionView;
  targetTaskTitle?: string;
  targetTask?: SuggestionTargetTask;
  catalogs: TaskCatalogsDto | null;
  catalogTags: CatalogTag[];
  actionsDisabled: boolean;
  pending: boolean;
  onAccept: (suggestion: TaskSuggestionView, draft: TaskSuggestionDraft) => Promise<string | null>;
  onDiscard: (suggestion: TaskSuggestionView) => void;
  onUndoDiscard: (suggestion: TaskSuggestionView) => void;
}) {
  const isAddTags = (suggestion.kind ?? "create") === "add-tags";
  const isAddSubtasks = suggestion.kind === "add-subtasks";
  const isEdit = suggestion.kind === "edit";
  const isExisting = isAddTags || isAddSubtasks || isEdit;
  const changeRows = isEdit && suggestion.changes ? describeChanges(suggestion.changes) : [];
  const targetLabel = suggestion.targetTaskId ? targetTaskTitle || `Tarea #${suggestion.targetTaskId}` : "";
  const [reviewing, setReviewing] = useState(false);
  const [title, setTitle] = useState(suggestion.title);
  const [description, setDescription] = useState(suggestion.description);
  const [priority, setPriority] = useState(suggestion.priority);
  const [subtasks, setSubtasks] = useState(suggestion.subtasks.map(({ title: item }) => item));
  const [tags, setTags] = useState<SuggestedTag[]>(suggestion.tags?.map((tag) => ({ ...tag })) ?? []);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#007aff");
  const [error, setError] = useState("");
  const priorityColor = suggestion.priority === "sin prioridad"
    ? "var(--muted)"
    : fallbackPriorityColor(suggestion.priority);
  const priorityLabel = suggestion.priority === "sin prioridad"
    ? "Sin prioridad"
    : `${suggestion.priority[0].toLocaleUpperCase("es")}${suggestion.priority.slice(1)}`;

  useEffect(() => {
    if (suggestion.status === "accepted") setReviewing(false);
  }, [suggestion.status]);

  function openReview() {
    setTitle(suggestion.title);
    setDescription(suggestion.description);
    setPriority(suggestion.priority);
    setSubtasks(suggestion.subtasks.map(({ title: item }) => item));
    setTags(suggestion.tags?.map((tag) => ({ ...tag })) ?? []);
    setNewTagName("");
    setError("");
    setReviewing(true);
  }

  function addTag() {
    const name = newTagName.trim();
    if (!name || name.length > 80 || tags.length >= 10) return;
    if (tags.some((tag) => normalizedName(tag.name) === normalizedName(name))) {
      setError("Cada etiqueta debe tener un nombre distinto.");
      return;
    }
    setTags((current) => [...current, { name, color: newTagColor }]);
    setNewTagName("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAddSubtasks) {
      const reviewed = subtasks.map((item) => ({ title: item.trim() })).filter(({ title: item }) => item);
      if (reviewed.length === 0 || reviewed.length > 20 || reviewed.some(({ title: item }) => item.length > 255)) {
        setError("Añade entre 1 y 20 subtareas de hasta 255 caracteres.");
        return;
      }
      setReviewing(false);
      const failure = await onAccept(suggestion, { subtasks: reviewed });
      if (failure) setError(failure);
      return;
    }
    const reviewedTags = tags.map(({ name, color }) => ({ name: name.trim(), color }))
      .filter(({ name }) => name);
    if (reviewedTags.some(({ name }) => name.length > 80)) {
      setError("Los nombres de etiqueta deben tener entre 1 y 80 caracteres.");
      return;
    }
    const names = reviewedTags.map(({ name }) => normalizedName(name));
    if (new Set(names).size !== names.length) {
      setError("Cada etiqueta debe tener un nombre distinto.");
      return;
    }
    if (isAddTags && reviewedTags.length === 0) {
      setError("Añade al menos una etiqueta para aplicar.");
      return;
    }
    const finalTags = reviewedTags.map(({ name, color }) => {
      const existing = catalogTags.some((item) => normalizedName(item.name) === normalizedName(name));
      return existing || !color ? { name } : { name, color };
    });
    let draft: TaskSuggestionDraft;
    if (isAddTags) draft = { tags: finalTags };
    else {
      const createDraft: TaskCreateDraft = {
        title: title.trim(),
        description: description.trim(),
        priority,
        subtasks: subtasks.map((item) => ({ title: item.trim() })).filter(({ title: item }) => item),
        ...(finalTags.length ? { tags: finalTags } : {}),
      };
      if (!createDraft.title || createDraft.title.length > 255 || createDraft.description.length > 2000 ||
        createDraft.subtasks.length > 20 || createDraft.subtasks.some(({ title: item }) => item.length > 255)) {
        setError("Revisa los límites del nombre, la descripción y las subtareas.");
        return;
      }
      draft = createDraft;
    }
    setReviewing(false);
    const failure = await onAccept(suggestion, draft);
    if (failure) setError(failure);
  }

  const formInvalid = isAddTags && tags.every(({ name }) => !name.trim()) ||
    isAddSubtasks && subtasks.every((item) => !item.trim()) ||
    (!isExisting && (!title.trim() || title.trim().length > 255 || description.length > 2000));

  return (
    <section className={styles.card} data-suggestion-id={suggestion.id} aria-label={isAddTags ? `Etiquetas sugeridas para ${targetLabel}` : isAddSubtasks ? `Subtareas sugeridas para ${targetLabel}` : isEdit ? `Cambios sugeridos para ${targetLabel}` : `Tarea sugerida: ${suggestion.title}`}>
      <div className={styles.heading}>
        <h3>{isAddTags ? `Etiquetas para ${targetLabel}` : isAddSubtasks ? `Subtareas para ${targetLabel}` : isEdit ? `Cambios en ${targetLabel}` : suggestion.title}</h3>
        {!isExisting && <span className={styles.priority}>
          <i style={{ backgroundColor: priorityColor }} aria-hidden="true" />
          {priorityLabel}
        </span>}
      </div>
      {!isExisting && suggestion.description && <p className={styles.description}>{suggestion.description}</p>}
      {isEdit && <dl className={styles.changes} aria-label="Cambios propuestos">
        {changeRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>}
      {(isAddSubtasks || !isExisting) && suggestion.subtasks.length > 0 && (
        <ul className={styles.previewList} aria-label="Subtareas propuestas">
          {suggestion.subtasks.slice(0, 3).map(({ title: item }, index) => (
            <li key={`${item}-${index}`}>
              <i aria-hidden="true" className="bi bi-circle" />
              <span>{item}</span>
            </li>
          ))}
          {suggestion.subtasks.length > 3 && (
            <li className={styles.previewMore}>+{suggestion.subtasks.length - 3} más</li>
          )}
        </ul>
      )}
      {suggestion.tags && suggestion.tags.length > 0 && (
        <ul className={styles.tags} aria-label="Etiquetas propuestas">
          {suggestion.tags.map(({ name, color }, index) => (
            <li key={`${name}-${index}`} style={{ "--tag-hue": getTaskTagHue(name), ...(color ? { "--tag-color": color } : {}) } as CSSProperties}>
              {name}
            </li>
          ))}
        </ul>
      )}
      <div className={styles.footer}>
        {!isAddTags && !isEdit && <span className={styles.count}>
          <i aria-hidden="true" className="bi bi-list-check" />
          {suggestion.subtasks.length} {suggestion.subtasks.length === 1 ? "subtarea" : "subtareas"}
        </span>}
        {suggestion.status === "pending" && pending ? (
          <span role="status" className={styles.discarded}>{isAddTags ? "Aplicando etiquetas…" : isAddSubtasks ? "Añadiendo subtareas…" : isEdit ? "Aplicando cambios…" : "Creando tarea…"}</span>
        ) : suggestion.status === "pending" ? (
          <div className={styles.actions}>
            <button type="button" disabled={actionsDisabled} onClick={openReview}>Aceptar</button>
            <button type="button" disabled={actionsDisabled} onClick={() => onDiscard(suggestion)}>Descartar</button>
          </div>
        ) : suggestion.status === "discarded" ? (
          <div className={styles.actions}>
            <span role="status" className={styles.discarded}>Descartada</span>
            <button type="button" disabled={actionsDisabled || pending} onClick={() => onUndoDiscard(suggestion)}>
              Deshacer
            </button>
          </div>
        ) : (
          <span role="status" className={suggestion.status === "accepted" ? styles.accepted : styles.discarded}>
            {suggestion.status === "accepted" ? isAddTags ? "Etiquetas aplicadas" : isAddSubtasks ? "Subtareas añadidas" : isEdit ? "Cambios aplicados" : "Tarea creada" : "Descartada"}
          </span>
        )}
      </div>
      {error && !reviewing && suggestion.status === "pending" && <p className={styles.error} role="alert">{error}</p>}
      {isEdit ? <TaskEditReview
        open={reviewing}
        onClose={() => { if (!pending) setReviewing(false); }}
        changes={suggestion.changes ?? {}}
        target={targetTask}
        catalogs={catalogs}
        targetLabel={targetLabel}
        pending={pending}
        onSubmit={async (changes) => {
          setReviewing(false);
          const failure = await onAccept(suggestion, { changes });
          if (failure) setError(failure);
          return null;
        }}
      /> : <Modal
        open={reviewing}
        onClose={() => { if (!pending) setReviewing(false); }}
        title={isAddTags ? "Revisar etiquetas" : isAddSubtasks ? "Revisar subtareas" : "Revisar tarea"}
        submitLabel={pending ? isAddTags || isAddSubtasks ? "Aplicando…" : "Creando…" : isAddTags ? "Aplicar etiquetas" : isAddSubtasks ? "Añadir subtareas" : "Crear tarea"}
        pending={pending}
        submitDisabled={formInvalid}
        onSubmit={(event) => void submit(event)}
        className={styles.reviewModal}
      >
        <div className={styles.fields}>
          {(isAddTags || isAddSubtasks) && (
            <>
              <label>
                <span>Tarea</span>
                <input value={`${targetLabel} · ID ${suggestion.targetTaskId}`} readOnly />
              </label>
              <p className={styles.notice}>{isAddTags ? "Se añadirán sin quitar las etiquetas actuales." : "Se añadirán sin quitar las subtareas actuales."}</p>
            </>
          )}
          {!isAddTags && (
            <>
              {!isAddSubtasks && <>
              <label>
                <span>Nombre</span>
                <input autoFocus value={title} maxLength={255} required disabled={pending} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label>
                <span>Descripción</span>
                <textarea value={description} maxLength={2000} rows={4} disabled={pending} onChange={(event) => setDescription(event.target.value)} />
              </label>
              <label>
                <span>Prioridad</span>
                <select value={priority} disabled={pending} onChange={(event) => setPriority(event.target.value as TaskSuggestion["priority"])}>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                  <option value="sin prioridad">Sin prioridad</option>
                </select>
              </label>
              </>}
              <fieldset className={styles.subtasks}>
                <legend>Subtareas ({subtasks.length}/20)</legend>
                {subtasks.map((item, index) => (
                  <div className={styles.subtaskRow} key={index}>
                    <input
                      aria-label={`Subtarea ${index + 1}`}
                      value={item}
                      maxLength={255}
                      disabled={pending}
                      onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault(); }}
                      onChange={(event) => setSubtasks((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))}
                    />
                    <button type="button" aria-label={`Eliminar subtarea ${index + 1}`} disabled={pending} onClick={() => setSubtasks((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                      <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <button className={styles.addSubtask} type="button" disabled={pending || subtasks.length >= 20} onClick={() => setSubtasks((current) => [...current, ""])}>
                  Añadir subtarea
                </button>
              </fieldset>
            </>
          )}
          {!isAddSubtasks && <fieldset className={styles.tagsEditor}>
            <legend>Etiquetas ({tags.length}/10)</legend>
            {tags.map((tag, index) => {
              const existing = catalogTags.find((item) => normalizedName(item.name) === normalizedName(tag.name));
              const displayedColor = existing?.color || tag.color || "#7c8a99";
              return <div className={styles.tagRow} key={index}>
                <input
                  aria-label={`Nombre de etiqueta ${index + 1}`}
                  value={tag.name}
                  maxLength={80}
                  disabled={pending}
                  onChange={(event) => {
                    setTags((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item));
                    setError("");
                  }}
                />
                <input
                  type="color"
                  aria-label={`Color de etiqueta ${tag.name || index + 1}`}
                  value={displayedColor}
                  disabled={pending || !!existing}
                  onChange={(event) => setTags((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value } : item))}
                />
                <button type="button" aria-label={`Quitar etiqueta ${tag.name || index + 1}`} disabled={pending} onClick={() => setTags((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  <i className="bi bi-x-lg" aria-hidden="true" />
                </button>
              </div>;
            })}
            {tags.length < 10 && <div className={styles.newTagRow}>
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
            </div>}
          </fieldset>}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      </Modal>}
    </section>
  );
}
