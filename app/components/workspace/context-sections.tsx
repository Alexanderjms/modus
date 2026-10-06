"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import styles from "./context.module.css";
import shared from "../workspace.module.css";
import { isProjectContextFileUrl } from "./context-file-resource.mjs";
import {
  isContextFile,
  isValidContextDocument,
  type ContextDocument,
  type ContextResource,
} from "./context-document.mjs";
import { ContextLoadMessage, ContextSkeleton } from "./context-load-states";

export {
  isContextDocument,
  isValidContextDocument,
  type ContextDocument,
  type ContextResource,
} from "./context-document.mjs";

export function ContextSections({
  document,
  projectId,
  disabled,
  hidden,
  hasPendingChanges,
  onDraftPendingChange,
  onChange,
  onResourceUploaded,
  onRetrySave,
  onRetry,
  loadState,
  loadError,
  saving,
  saveError,
  saved,
}: {
  document: ContextDocument;
  projectId?: number;
  disabled: boolean;
  hidden: boolean;
  hasPendingChanges: boolean;
  onDraftPendingChange: (pending: boolean) => void;
  onChange: (document: ContextDocument) => void;
  onResourceUploaded: (projectId: number, resource: ContextResource) => boolean;
  onRetrySave: () => void;
  onRetry: () => void;
  loadState: "loading" | "error" | "ready" | "no-project";
  loadError: string;
  saving: boolean;
  saveError: string;
  saved: boolean;
}) {
  const id = useId();
  const valid = isValidContextDocument(document);
  const atRuleLimit = document.rules.length >= 50;
  const atResourceLimit = document.resources.length >= 50;
  const [showValidation, setShowValidation] = useState(false);
  const [editingContext, setEditingContext] = useState(false);
  const [editingRule, setEditingRule] = useState<number | null>(null);
  const [addingRule, setAddingRule] = useState(false);
  const [ruleDraft, setRuleDraft] = useState("");
  const [openRuleMenu, setOpenRuleMenu] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [openResourceMenu, setOpenResourceMenu] = useState(false);
  const [resourceMenuPosition, setResourceMenuPosition] = useState({ top: 0, left: 0 });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [focusResourceIndex, setFocusResourceIndex] = useState<number | null>(null);
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<number | null>(null);
  const [focusRuleAction, setFocusRuleAction] = useState<number | null>(null);
  const ruleDraftPending = addingRule || (
    editingRule !== null && ruleDraft !== document.rules[editingRule]
  );
  const contextRef = useRef<HTMLTextAreaElement>(null);
  const ruleMenuRef = useRef<HTMLDivElement>(null);
  const resourceMenuRef = useRef<HTMLDivElement>(null);
  const resourceAddRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resourceTitleRefs = useRef(new Map<number, HTMLInputElement>());
  const uploadControllerRef = useRef<AbortController | null>(null);
  const uploadVersionRef = useRef(0);
  const uploadingRef = useRef(false);
  const filePickerProjectIdRef = useRef<number | undefined>(undefined);
  const projectIdRef = useRef(projectId);
  const loadStateRef = useRef(loadState);
  projectIdRef.current = projectId;
  loadStateRef.current = loadState;
  const ruleInputRef = useRef<HTMLInputElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const addRuleRef = useRef<HTMLButtonElement>(null);
  const ruleActionRefs = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => {
    if (editingContext) contextRef.current?.focus();
  }, [editingContext]);

  useEffect(() => {
    if (editingRule !== null || addingRule) ruleInputRef.current?.focus();
  }, [editingRule, addingRule]);

  useEffect(() => {
    onDraftPendingChange(ruleDraftPending || uploading);
  }, [onDraftPendingChange, ruleDraftPending, uploading]);

  useEffect(() => {
    if (loadState !== "ready") {
      uploadVersionRef.current++;
      uploadControllerRef.current?.abort();
      uploadControllerRef.current = null;
      uploadingRef.current = false;
      setUploading(false);
      setRetryFile(null);
      setUploadError("");
      setOpenResourceMenu(false);
      filePickerProjectIdRef.current = undefined;
    }
    return () => {
      uploadVersionRef.current++;
      uploadControllerRef.current?.abort();
      uploadControllerRef.current = null;
      uploadingRef.current = false;
      onDraftPendingChange(false);
    };
  }, [loadState, onDraftPendingChange, projectId]);

  useEffect(() => {
    if (!openResourceMenu) return;
    resourceMenuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    function closeOnOutside(event: PointerEvent) {
      if (
        !resourceMenuRef.current?.contains(event.target as Node) &&
        !resourceAddRef.current?.contains(event.target as Node)
      ) setOpenResourceMenu(false);
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenResourceMenu(false);
      resourceAddRef.current?.focus();
    }
    globalThis.document.addEventListener("pointerdown", closeOnOutside);
    globalThis.document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeMenuOnViewportChange);
    window.addEventListener("scroll", closeMenuOnViewportChange, true);
    return () => {
      globalThis.document.removeEventListener("pointerdown", closeOnOutside);
      globalThis.document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeMenuOnViewportChange);
      window.removeEventListener("scroll", closeMenuOnViewportChange, true);
    };
    function closeMenuOnViewportChange() {
      setOpenResourceMenu(false);
    }
  }, [openResourceMenu]);

  useEffect(() => {
    if (openRuleMenu === null) return;
    const ruleIndex = openRuleMenu;
    ruleMenuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    function closeOnOutside(event: PointerEvent) {
      if (
        !ruleMenuRef.current?.contains(event.target as Node) &&
        !ruleActionRefs.current.get(ruleIndex)?.contains(event.target as Node)
      ) setOpenRuleMenu(null);
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenRuleMenu(null);
      ruleActionRefs.current.get(ruleIndex)?.focus();
    }
    globalThis.document.addEventListener("pointerdown", closeOnOutside);
    globalThis.document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeMenuOnViewportChange);
    window.addEventListener("scroll", closeMenuOnViewportChange, true);
    return () => {
      globalThis.document.removeEventListener("pointerdown", closeOnOutside);
      globalThis.document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeMenuOnViewportChange);
      window.removeEventListener("scroll", closeMenuOnViewportChange, true);
    };
    function closeMenuOnViewportChange() {
      setOpenRuleMenu(null);
    }
  }, [openRuleMenu]);

  useEffect(() => {
    if (confirmDeleteRule !== null) deleteCancelRef.current?.focus();
    if (confirmDeleteRule === null) return;
    function cancelOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setConfirmDeleteRule(null);
      setFocusRuleAction(confirmDeleteRule);
    }
    globalThis.document.addEventListener("keydown", cancelOnEscape);
    return () => globalThis.document.removeEventListener("keydown", cancelOnEscape);
  }, [confirmDeleteRule]);

  useEffect(() => {
    if (focusRuleAction === null) return;
    if (focusRuleAction === -1) addRuleRef.current?.focus();
    else ruleActionRefs.current.get(focusRuleAction)?.focus();
    setFocusRuleAction(null);
  }, [document.rules, focusRuleAction]);

  useEffect(() => {
    if (focusResourceIndex === null) return;
    resourceTitleRefs.current.get(focusResourceIndex)?.focus();
    setFocusResourceIndex(null);
  }, [document.resources, focusResourceIndex]);

  useEffect(() => {
    if (loadState !== "ready") {
      setShowValidation(false);
      setEditingContext(false);
      setEditingRule(null);
      setAddingRule(false);
      setRuleDraft("");
      setOpenRuleMenu(null);
      setOpenResourceMenu(false);
      setConfirmDeleteRule(null);
    }
  }, [loadState]);

  useEffect(() => {
    if (hidden) {
      setOpenRuleMenu(null);
      setOpenResourceMenu(false);
    }
  }, [hidden]);

  function update(patch: Partial<ContextDocument>) {
    onChange({ ...document, ...patch });
  }

  function beginRuleMenu(index: number, button: HTMLButtonElement) {
    if (openRuleMenu === index) {
      setOpenRuleMenu(null);
      return;
    }
    const bounds = button.getBoundingClientRect();
    setMenuPosition({
      top: Math.min(bounds.bottom + 5, window.innerHeight - 82),
      left: Math.max(8, Math.min(bounds.right - 148, window.innerWidth - 156)),
    });
    setOpenRuleMenu(index);
  }

  function beginResourceMenu(button: HTMLButtonElement) {
    if (openResourceMenu) {
      setOpenResourceMenu(false);
      return;
    }
    const bounds = button.getBoundingClientRect();
    setResourceMenuPosition({
      top: Math.max(8, Math.min(bounds.bottom + 6, window.innerHeight - 96)),
      left: Math.max(8, Math.min(bounds.right - 190, window.innerWidth - 198)),
    });
    setOpenResourceMenu(true);
  }

  function addUrlResource() {
    const index = document.resources.length;
    update({ resources: [...document.resources, { title: "", url: "" }] });
    setFocusResourceIndex(index);
    setOpenResourceMenu(false);
  }

  function handleResourceMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab" && openResourceMenu) {
      event.preventDefault();
      setOpenResourceMenu(false);
      resourceAddRef.current?.focus();
      return;
    }
    const items = [...(resourceMenuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [])];
    const index = items.indexOf(globalThis.document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  }

  async function uploadResource(file: File, selectedProjectId = projectId) {
    if (
      !selectedProjectId || selectedProjectId !== projectIdRef.current ||
      uploadingRef.current || loadStateRef.current !== "ready"
    ) return;
    if (file.size > 10 * 1024 * 1024) {
      setRetryFile(null);
      setUploadError("El archivo supera el límite de 10 MiB. Elige un archivo más pequeño.");
      return;
    }

    const requestProjectId = selectedProjectId;
    const version = ++uploadVersionRef.current;
    const controller = new AbortController();
    const body = new FormData();
    body.append("file", file);
    uploadingRef.current = true;
    uploadControllerRef.current = controller;
    setRetryFile(file);
    setUploadError("");
    setUploading(true);
    try {
      const response = await fetch(`/api/projects/${requestProjectId}/context/files`, {
        method: "POST",
        body,
        signal: controller.signal,
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error("upload-failed");
      const resource =
        result && typeof result === "object" && "resource" in result
          ? (result as { resource?: unknown }).resource
          : null;
      if (
        !resource || typeof resource !== "object" ||
        !("title" in resource) || typeof resource.title !== "string" ||
        !resource.title.trim() || resource.title.length > 200 ||
        !("url" in resource) || typeof resource.url !== "string" ||
        !isProjectContextFileUrl(resource.url, requestProjectId)
      ) throw new Error("invalid-resource");
      if (
        version !== uploadVersionRef.current || controller.signal.aborted ||
        projectIdRef.current !== requestProjectId || loadStateRef.current !== "ready"
      ) return;
      if (!onResourceUploaded(requestProjectId, { title: resource.title, url: resource.url })) {
        setRetryFile(null);
        setUploadError("No se pudo asociar el archivo al contexto actual.");
        return;
      }
      setRetryFile(null);
    } catch {
      if (version === uploadVersionRef.current && !controller.signal.aborted) {
        setUploadError("No se pudo subir el archivo. Comprueba la conexión e inténtalo de nuevo.");
      }
    } finally {
      if (version === uploadVersionRef.current) {
        uploadControllerRef.current = null;
        uploadingRef.current = false;
        setUploading(false);
      }
    }
  }

  function editRule(index: number) {
    setOpenRuleMenu(null);
    setRuleDraft(document.rules[index]);
    setAddingRule(false);
    setEditingRule(index);
  }

  function confirmRuleEdit() {
    const rule = ruleDraft.trim();
    if (!rule || rule.length > 500) {
      setShowValidation(true);
      return;
    }
    if (addingRule) {
      const newIndex = document.rules.length;
      update({ rules: [...document.rules, rule] });
      setFocusRuleAction(newIndex);
    } else if (editingRule !== null) {
      update({
        rules: document.rules.map((item, index) => index === editingRule ? rule : item),
      });
      setFocusRuleAction(editingRule);
    }
    setEditingRule(null);
    setAddingRule(false);
    setRuleDraft("");
    setShowValidation(false);
  }

  function cancelRuleEdit() {
    const focusIndex = editingRule;
    setEditingRule(null);
    setAddingRule(false);
    setRuleDraft("");
    if (focusIndex !== null) setFocusRuleAction(focusIndex);
    else addRuleRef.current?.focus();
  }

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (disabled) return;
    confirmRuleEdit();
  }

  function handleRuleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab" && openRuleMenu !== null) {
      event.preventDefault();
      setOpenRuleMenu(null);
      ruleActionRefs.current.get(openRuleMenu)?.focus();
      return;
    }
    const items = [...(ruleMenuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [])];
    const index = items.indexOf(globalThis.document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  }

  return (
    <>
      {loadState === "loading" && <ContextSkeleton />}
      {loadState === "error" && (
        <ContextLoadMessage kind="error" message={loadError} onRetry={onRetry} />
      )}
      {loadState === "no-project" && (
        <ContextLoadMessage kind="no-project" message="" onRetry={onRetry} />
      )}

      {loadState === "ready" && (
        <>
          <section
            className={styles.contextSection}
            aria-labelledby={`${id}-context`}
          >
            <header>
              <h3 id={`${id}-context`}>CONTEXTO DEL PROYECTO</h3>
              <button
                type="button"
                aria-label={editingContext ? "Finalizar edición del contexto" : "Editar contexto"}
                disabled={disabled}
                onClick={() => setEditingContext((editing) => !editing)}
              >
                <i
                  aria-hidden="true"
                  className={`bi bi-${editingContext ? "check" : "pencil"}`}
                />
              </button>
            </header>
            {editingContext ? (
              <>
                <textarea
                  ref={contextRef}
                  id={`${id}-description`}
                  rows={6}
                  maxLength={5000}
                  value={document.context}
                  disabled={disabled}
                  onChange={(event) => update({ context: event.target.value })}
                  aria-label="Contexto del proyecto"
                  placeholder="Describe el proyecto para orientar las respuestas de la IA…"
                />
                <p className={styles.fieldHint}>
                  {document.context.length}/5000 caracteres
                </p>
              </>
            ) : (
              <p className={styles.contextText}>
                {document.context || "Aún no se ha agregado contexto para este proyecto."}
              </p>
            )}
          </section>

          <section
            className={styles.contextSection}
            aria-labelledby={`${id}-rules`}
          >
            <header>
              <h3 id={`${id}-rules`}>REGLAS A SEGUIR</h3>
              <button
                type="button"
                aria-label="Agregar regla"
                title={atRuleLimit ? "Máximo 50 reglas." : undefined}
                ref={addRuleRef}
                disabled={disabled || atRuleLimit || addingRule || editingRule !== null || confirmDeleteRule !== null}
                onClick={() => {
                  setAddingRule(true);
                  setRuleDraft("");
                }}
              >
                <i aria-hidden="true" className="bi bi-plus" />
              </button>
            </header>
            {document.rules.length || addingRule ? (
              <ul className={styles.editableList}>
                {document.rules.map((rule, index) => (
                  <li className={`${styles.ruleRow} ${editingRule === index ? styles.ruleEditRow : ""}`} key={index}>
                    {editingRule === index ? (
                      <>
                        <label className={styles.srOnly} htmlFor={`${id}-rule-${index}`}>
                          Editar regla {index + 1}
                        </label>
                        <input
                          ref={ruleInputRef}
                          id={`${id}-rule-${index}`}
                          className={styles.ruleInput}
                          value={ruleDraft}
                          maxLength={500}
                          disabled={disabled}
                          aria-invalid={showValidation && !ruleDraft.trim()}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelRuleEdit();
                            } else submitOnEnter(event);
                          }}
                          onChange={(event) => setRuleDraft(event.target.value)}
                        />
                        <div className={styles.ruleEditActions}>
                          <button type="button" aria-label="Cancelar edición" onClick={cancelRuleEdit}>
                            <i aria-hidden="true" className="bi bi-x" />
                          </button>
                          <button type="button" aria-label="Confirmar regla" onClick={confirmRuleEdit}>
                            <i aria-hidden="true" className="bi bi-check" />
                          </button>
                        </div>
                        {showValidation && !ruleDraft.trim() && (
                          <p className={styles.inlineRuleError} role="alert">Escribe una regla antes de confirmar.</p>
                        )}
                      </>
                    ) : confirmDeleteRule === index ? (
                      <div className={styles.deleteConfirm} role="group" aria-label={`Confirmar eliminación de regla ${index + 1}`}>
                        <span>¿Eliminar esta regla?</span>
                        <button
                          ref={deleteCancelRef}
                          type="button"
                          onClick={() => {
                            setConfirmDeleteRule(null);
                            setFocusRuleAction(index);
                          }}
                        >Cancelar</button>
                        <button
                          type="button"
                          className={styles.deleteConfirmAction}
                          onClick={() => {
                            const nextRules = document.rules.filter((_, i) => i !== index);
                            const nextFocus = nextRules.length ? Math.min(index, nextRules.length - 1) : -1;
                            update({ rules: nextRules });
                            setConfirmDeleteRule(null);
                            setFocusRuleAction(nextFocus);
                          }}
                        >Eliminar</button>
                      </div>
                    ) : (
                      <>
                        <span className={styles.ruleChip}>{rule}</span>
                        <button
                          ref={(element) => {
                            if (element) ruleActionRefs.current.set(index, element);
                            else ruleActionRefs.current.delete(index);
                          }}
                          type="button"
                          className={styles.ruleActionsButton}
                          aria-label={`Acciones para regla ${index + 1}`}
                          aria-haspopup="menu"
                          aria-expanded={openRuleMenu === index}
                          aria-controls={`${id}-rule-actions`}
                          disabled={disabled || addingRule || editingRule !== null || confirmDeleteRule !== null}
                          onClick={(event) => beginRuleMenu(index, event.currentTarget)}
                        >
                          <i aria-hidden="true" className="bi bi-three-dots" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
                {addingRule && (
                  <li className={`${styles.ruleRow} ${styles.ruleEditRow}`}>
                    <label className={styles.srOnly} htmlFor={`${id}-new-rule`}>Nueva regla</label>
                    <input
                      ref={ruleInputRef}
                      id={`${id}-new-rule`}
                      className={styles.ruleInput}
                      value={ruleDraft}
                      maxLength={500}
                      disabled={disabled}
                      aria-invalid={showValidation && !ruleDraft.trim()}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRuleEdit();
                        } else submitOnEnter(event);
                      }}
                      onChange={(event) => setRuleDraft(event.target.value)}
                    />
                    <div className={styles.ruleEditActions}>
                      <button type="button" aria-label="Cancelar regla" onClick={cancelRuleEdit}>
                        <i aria-hidden="true" className="bi bi-x" />
                      </button>
                      <button type="button" aria-label="Confirmar regla" onClick={confirmRuleEdit}>
                        <i aria-hidden="true" className="bi bi-check" />
                      </button>
                    </div>
                    {showValidation && !ruleDraft.trim() && (
                      <p className={styles.inlineRuleError} role="alert">Escribe una regla antes de confirmar.</p>
                    )}
                  </li>
                )}
              </ul>
            ) : (
              <p>Aún no hay reglas para este proyecto.</p>
            )}
            {openRuleMenu !== null && typeof window !== "undefined" && createPortal(
              <div
                ref={ruleMenuRef}
                id={`${id}-rule-actions`}
                className={styles.ruleMenu}
                role="menu"
                aria-label={`Acciones para regla ${openRuleMenu + 1}`}
                style={{ top: menuPosition.top, left: menuPosition.left }}
                onKeyDown={handleRuleMenuKeyDown}
              >
                <button type="button" role="menuitem" onClick={() => editRule(openRuleMenu)}>Editar</button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.ruleMenuDelete}
                  onClick={() => {
                    setConfirmDeleteRule(openRuleMenu);
                    setOpenRuleMenu(null);
                  }}
                >Eliminar</button>
              </div>,
              globalThis.document.body,
            )}
          </section>

          <section
            className={styles.contextSection}
            aria-labelledby={`${id}-resources`}
          >
            <header>
              <h3 id={`${id}-resources`}>RECURSOS</h3>
              <button
                type="button"
                aria-label="Agregar recurso"
                aria-haspopup="menu"
                aria-expanded={openResourceMenu}
                aria-controls={`${id}-resource-menu`}
                title={atResourceLimit ? "Máximo 50 recursos." : undefined}
                ref={resourceAddRef}
                disabled={disabled || atResourceLimit || uploading}
                onClick={(event) => beginResourceMenu(event.currentTarget)}
              >
                <i aria-hidden="true" className="bi bi-plus" />
              </button>
            </header>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void uploadResource(file, filePickerProjectIdRef.current);
              }}
            />
            {openResourceMenu && typeof window !== "undefined" && createPortal(
              <div
                ref={resourceMenuRef}
                id={`${id}-resource-menu`}
                className={styles.resourceMenu}
                role="menu"
                aria-label="Agregar recurso"
                style={{ top: resourceMenuPosition.top, left: resourceMenuPosition.left }}
                onKeyDown={handleResourceMenuKeyDown}
              >
                <button type="button" role="menuitem" onClick={addUrlResource}>
                  <i aria-hidden="true" className="bi bi-link-45deg" />
                  <span>URL</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenResourceMenu(false);
                    filePickerProjectIdRef.current = projectId;
                    resourceAddRef.current?.focus();
                    fileInputRef.current?.click();
                  }}
                >
                  <i aria-hidden="true" className="bi bi-paperclip" />
                  <span>Archivo</span>
                  <i aria-hidden="true" className="bi bi-file-earmark" />
                </button>
              </div>,
              globalThis.document.body,
            )}
            {document.resources.length ? (
              <ul className={styles.editableList}>
                {document.resources.map((resource, index) => (
                  <li
                    className={`${styles.resourceFields} ${isContextFile(resource) ? styles.fileResourceFields : ""}`}
                    key={index}
                  >
                    {isContextFile(resource) ? (
                      <a
                        className={`${styles.resourceLink} ${styles.fileResourceLink}`}
                        href={resource.url}
                        download={resource.title}
                      >
                        <i aria-hidden="true" className="bi bi-file-earmark-arrow-down" />
                        <span>{resource.title}</span>
                      </a>
                    ) : (
                      <>
                        {resource.title.trim() &&
                          isValidContextDocument({
                            context: "",
                            rules: [],
                            resources: [resource],
                          }) && (
                        <a
                          className={styles.resourceLink}
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                            <i
                              aria-hidden="true"
                              className="bi bi-box-arrow-up-right"
                            />
                            {resource.title}
                        </a>
                          )}
                        <label
                          className={styles.srOnly}
                          htmlFor={`${id}-resource-title-${index}`}
                        >
                          Título del recurso {index + 1}
                        </label>
                        <input
                          ref={(element) => {
                            if (element) resourceTitleRefs.current.set(index, element);
                            else resourceTitleRefs.current.delete(index);
                          }}
                          id={`${id}-resource-title-${index}`}
                          value={resource.title}
                          maxLength={200}
                          placeholder="Título"
                          disabled={disabled}
                          aria-invalid={!resource.title.trim() || resource.title.length > 200}
                          onChange={(event) =>
                            update({
                              resources: document.resources.map((item, i) =>
                                i === index ? { ...item, title: event.target.value } : item,
                              ),
                            })
                          }
                        />
                        <label
                          className={styles.srOnly}
                          htmlFor={`${id}-resource-url-${index}`}
                        >
                          URL del recurso {index + 1}
                        </label>
                        <input
                          id={`${id}-resource-url-${index}`}
                          type="url"
                          value={resource.url}
                          maxLength={2048}
                          placeholder="https://…"
                          disabled={disabled}
                          aria-invalid={!isValidContextDocument({
                            context: "",
                            rules: [],
                            resources: [resource],
                          })}
                          onChange={(event) =>
                            update({
                              resources: document.resources.map((item, i) =>
                                i === index ? { ...item, url: event.target.value } : item,
                              ),
                            })
                          }
                        />
                      </>
                    )}
                    <button
                      type="button"
                      className={styles.removeButton}
                      aria-label={isContextFile(resource)
                        ? `Quitar archivo ${resource.title}. El archivo almacenado no se eliminará del servidor.`
                        : `Eliminar recurso ${index + 1}`}
                      title={isContextFile(resource)
                        ? "Quita el recurso de Modus; el archivo almacenado no se elimina del servidor."
                        : undefined}
                      disabled={disabled}
                      onClick={() =>
                        update({
                          resources: document.resources.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      <i aria-hidden="true" className="bi bi-trash3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Aún no hay recursos para este proyecto.</p>
            )}
            {uploading && (
              <p className={styles.uploadStatus} role="status">
                Subiendo {retryFile?.name || "archivo"}…
              </p>
            )}
            {uploadError && (
              <div className={styles.uploadError}>
                <p className={styles.errorMessage} role="alert">{uploadError}</p>
                {retryFile && (
                  <button
                    type="button"
                    className={shared.textButton}
                    disabled={uploading || disabled}
                    onClick={() => void uploadResource(retryFile)}
                  >Reintentar subida</button>
                )}
              </div>
            )}
          </section>

          <div className={styles.saveActions}>
            {saving && <p className={styles.saveStatus} role="status">Guardando…</p>}
            {!saving && saved && !hasPendingChanges && !ruleDraftPending && (
              <p className={styles.savedMessage} role="status">Guardado</p>
            )}
            {ruleDraftPending && (
              <p className={styles.fieldHint} role="status">Confirma o cancela la regla para guardar los cambios.</p>
            )}
            {saveError && (
              <div className={styles.saveError}>
                <p className={styles.errorMessage} role="alert">{saveError}</p>
                <button
                  type="button"
                  className={shared.textButton}
                  disabled={saving || !valid}
                  onClick={onRetrySave}
                >Reintentar</button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
