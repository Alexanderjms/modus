"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import styles from "./context.module.css";
import { isProjectContextFileUrl } from "./context-file-resource.mjs";
import { getResourceTitle } from "./context-resource-title.mjs";
import {
  isValidContextDocument,
  type ContextDocument,
  type ContextResource,
} from "./context-document.mjs";
import { ContextLoadMessage, ContextSkeleton } from "./context-load-states";
import { ContextProjectSection } from "./context-project-section";
import { ContextRulesSection } from "./context-rules-section";
import { ContextResourcesSection } from "./context-resources-section";
import { ContextSaveStatus } from "./context-save-status";

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
  const [resourceDraft, setResourceDraft] = useState<{
    index: number;
    isNew: boolean;
    title: string;
    url: string;
  } | null>(null);
  const [resourceDraftError, setResourceDraftError] = useState<{
    field: "url" | "document";
    message: string;
  } | null>(null);
  const [openRuleMenu, setOpenRuleMenu] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [openResourceMenu, setOpenResourceMenu] = useState(false);
  const [resourceMenuPosition, setResourceMenuPosition] = useState({ top: 0, left: 0 });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [focusResourceIndex, setFocusResourceIndex] = useState<number | null>(null);
  const [focusResourceActionIndex, setFocusResourceActionIndex] = useState<number | null>(null);
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [confirmDeleteResource, setConfirmDeleteResource] = useState<{
    index: number;
    resource: ContextResource;
  } | null>(null);
  const [focusResourceDeleteIndex, setFocusResourceDeleteIndex] = useState<number | null>(null);
  const [focusRuleAction, setFocusRuleAction] = useState<number | null>(null);
  const ruleDraftPending = addingRule || (
    editingRule !== null && ruleDraft !== document.rules[editingRule]
  );
  const contextRef = useRef<HTMLTextAreaElement>(null);
  const ruleMenuRef = useRef<HTMLDivElement>(null);
  const resourceMenuRef = useRef<HTMLDivElement>(null);
  const resourceAddRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resourceUrlRefs = useRef(new Map<number, HTMLInputElement>());
  const resourceActionRefs = useRef(new Map<number, HTMLButtonElement>());
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
  const resourceDeleteCancelRef = useRef<HTMLButtonElement>(null);
  const addRuleRef = useRef<HTMLButtonElement>(null);
  const ruleActionRefs = useRef(new Map<number, HTMLButtonElement>());
  const resourceDeleteRefs = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => {
    if (editingContext) contextRef.current?.focus();
  }, [editingContext]);

  useEffect(() => {
    if (editingRule !== null || addingRule) ruleInputRef.current?.focus();
  }, [editingRule, addingRule]);

  useEffect(() => {
    onDraftPendingChange(ruleDraftPending || resourceDraft !== null || uploading);
  }, [onDraftPendingChange, resourceDraft, ruleDraftPending, uploading]);

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
    if (confirmDeleteResource !== null) resourceDeleteCancelRef.current?.focus();
    if (confirmDeleteResource === null) return;
    const resourceIndex = confirmDeleteResource.index;
    function cancelOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setConfirmDeleteResource(null);
      setFocusResourceDeleteIndex(resourceIndex);
    }
    globalThis.document.addEventListener("keydown", cancelOnEscape);
    return () => globalThis.document.removeEventListener("keydown", cancelOnEscape);
  }, [confirmDeleteResource]);

  useEffect(() => {
    if (focusRuleAction === null) return;
    if (focusRuleAction === -1) addRuleRef.current?.focus();
    else ruleActionRefs.current.get(focusRuleAction)?.focus();
    setFocusRuleAction(null);
  }, [document.rules, focusRuleAction]);

  useEffect(() => {
    if (focusResourceIndex === null) return;
    const input = resourceUrlRefs.current.get(focusResourceIndex);
    input?.focus();
    input?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    setFocusResourceIndex(null);
  }, [document.resources, focusResourceIndex]);

  useEffect(() => {
    if (focusResourceActionIndex === null) return;
    if (focusResourceActionIndex < 0) resourceAddRef.current?.focus();
    else resourceActionRefs.current.get(focusResourceActionIndex)?.focus();
    setFocusResourceActionIndex(null);
  }, [document.resources, focusResourceActionIndex]);

  useEffect(() => {
    if (focusResourceDeleteIndex === null) return;
    resourceDeleteRefs.current.get(focusResourceDeleteIndex)?.focus();
    setFocusResourceDeleteIndex(null);
  }, [document.resources, focusResourceDeleteIndex]);

  useEffect(() => {
    if (loadState !== "ready") {
      setShowValidation(false);
      setEditingContext(false);
      setEditingRule(null);
      setAddingRule(false);
      setRuleDraft("");
      setResourceDraft(null);
      setResourceDraftError(null);
      setFocusResourceIndex(null);
      setFocusResourceActionIndex(null);
      setConfirmDeleteResource(null);
      setFocusResourceDeleteIndex(null);
      setOpenRuleMenu(null);
      setOpenResourceMenu(false);
      setConfirmDeleteRule(null);
    }
  }, [loadState]);

  const previousProjectIdRef = useRef(projectId);
  useEffect(() => {
    if (previousProjectIdRef.current === projectId) return;
    previousProjectIdRef.current = projectId;
    setResourceDraft(null);
    setResourceDraftError(null);
    setFocusResourceIndex(null);
    setFocusResourceActionIndex(null);
    setConfirmDeleteResource(null);
    setFocusResourceDeleteIndex(null);
  }, [projectId]);

  useEffect(() => {
    if (hidden) {
      setOpenRuleMenu(null);
      setOpenResourceMenu(false);
      setConfirmDeleteResource(null);
      setFocusResourceDeleteIndex(null);
    }
  }, [hidden]);

  function update(patch: Partial<ContextDocument>) {
    onChange({ ...document, ...patch });
  }

  const isCollapsed = (key: string) => collapsed[key] === true;
  const storageKey = `modus:context-collapsed:${projectId ?? "none"}`;

  useEffect(() => {
    try {
      setCollapsed(JSON.parse(localStorage.getItem(storageKey) ?? "{}") || {});
    } catch {
      setCollapsed({});
    }
  }, [storageKey]);

  function toggleSection(key: string) {
    const collapsing = !isCollapsed(key);
    const next = { ...collapsed, [key]: collapsing };
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
    if (!collapsing) return;
    if (key === "rules") {
      setOpenRuleMenu(null);
      setConfirmDeleteRule(null);
    } else if (key === "resources") {
      setOpenResourceMenu(false);
      setConfirmDeleteResource(null);
    }
  }

  function renderSectionToggle(key: string, label: string) {
    const open = !isCollapsed(key);
    return (
      <button
        type="button"
        className={styles.sectionToggle}
        aria-expanded={open}
        aria-controls={`${id}-${key}-panel`}
        aria-label={`${open ? "Contraer" : "Expandir"} ${label}`}
        onClick={() => toggleSection(key)}
      >
        <i aria-hidden="true" className="bi bi-caret-down-fill" />
      </button>
    );
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
    setResourceDraft({ index, isNew: true, title: "", url: "" });
    setResourceDraftError(null);
    setFocusResourceIndex(index);
    setOpenResourceMenu(false);
  }

  function editUrlResource(index: number) {
    if (resourceDraft || uploading) return;
    const resource = document.resources[index];
    setResourceDraft({ index, isNew: false, title: resource.title, url: resource.url });
    setResourceDraftError(null);
    setFocusResourceIndex(index);
  }

  function cancelResourceEdit() {
    if (!resourceDraft) return;
    const { index, isNew } = resourceDraft;
    setResourceDraft(null);
    setResourceDraftError(null);
    setFocusResourceActionIndex(isNew ? -1 : index);
  }

  function confirmResourceEdit() {
    if (!resourceDraft) return;
    const url = resourceDraft.url.trim();
    if (!url || url.length > 2048) {
      setResourceDraftError({
        field: "url",
        message: !url ? "Escribe una URL." : "La URL no puede superar 2048 caracteres.",
      });
      resourceUrlRefs.current.get(resourceDraft.index)?.focus();
      return;
    }
    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(url);
    } catch {
      parsedUrl = null;
    }
    if (!parsedUrl || (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")) {
      setResourceDraftError({ field: "url", message: "Usa una URL http o https válida." });
      resourceUrlRefs.current.get(resourceDraft.index)?.focus();
      return;
    }

    const currentResource = document.resources[resourceDraft.index];
    const title = !resourceDraft.isNew && currentResource?.url.trim() === url
      ? currentResource.title
      : getResourceTitle(parsedUrl, url);
    const resource = { title, url };
    const resources = resourceDraft.isNew
      ? [...document.resources, resource]
      : document.resources.map((item, index) => index === resourceDraft.index ? resource : item);
    if (!isValidContextDocument({ ...document, resources })) {
      setResourceDraftError({
        field: "document",
        message: "No se puede guardar: el contexto supera el límite permitido.",
      });
      return;
    }

    update({ resources });
    setFocusResourceActionIndex(resourceDraft.index);
    setResourceDraft(null);
    setResourceDraftError(null);
  }

  function submitResourceOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelResourceEdit();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!disabled) confirmResourceEdit();
    }
  }

  function beginResourceRemoval(index: number) {
    if (disabled || uploading || resourceDraft || confirmDeleteResource || confirmDeleteRule !== null) return;
    setOpenResourceMenu(false);
    setOpenRuleMenu(null);
    setConfirmDeleteResource({ index, resource: document.resources[index] });
  }

  function cancelResourceRemoval() {
    if (confirmDeleteResource === null) return;
    setFocusResourceDeleteIndex(confirmDeleteResource.index);
    setConfirmDeleteResource(null);
  }

  function confirmResourceRemoval() {
    if (disabled || confirmDeleteResource === null) return;
    const { index, resource } = confirmDeleteResource;
    const currentResource = document.resources[index];
    if (!currentResource || currentResource.title !== resource.title || currentResource.url !== resource.url) {
      cancelResourceRemoval();
      return;
    }
    const resources = document.resources.filter((_, currentIndex) => currentIndex !== index);
    update({ resources });
    setFocusResourceActionIndex(resources.length ? Math.min(index, resources.length - 1) : -1);
    setConfirmDeleteResource(null);
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

  function renderResourceEditor(index: number, isNew = false) {
    if (!resourceDraft) return null;
    const draft = resourceDraft;
    const suffix = isNew ? "new" : index;
    const errorId = `${id}-resource-error-${suffix}`;
    return (
      <>
        <label className={styles.srOnly} htmlFor={`${id}-resource-url-${suffix}`}>
          {isNew ? "URL del nuevo recurso" : `Editar URL del recurso ${index + 1}`}
        </label>
        <input
          ref={(element) => {
            if (element) resourceUrlRefs.current.set(index, element);
            else resourceUrlRefs.current.delete(index);
          }}
          id={`${id}-resource-url-${suffix}`}
          type="url"
          value={draft.url}
          maxLength={2048}
          placeholder="https://…"
          disabled={disabled}
          aria-invalid={resourceDraftError?.field === "url" || resourceDraftError?.field === "document"}
          aria-describedby={resourceDraftError ? errorId : undefined}
          onKeyDown={submitResourceOnEnter}
          onChange={(event) => {
            setResourceDraft({ ...draft, url: event.target.value });
            setResourceDraftError(null);
          }}
        />
        <div className={styles.resourceActions}>
          <button type="button" aria-label={isNew ? "Cancelar nueva URL" : "Cancelar edición de URL"} disabled={disabled} onClick={cancelResourceEdit}>
            <i aria-hidden="true" className="bi bi-x" />
          </button>
          <button type="button" aria-label={isNew ? "Confirmar nueva URL" : "Confirmar URL"} disabled={disabled} onClick={confirmResourceEdit}>
            <i aria-hidden="true" className="bi bi-check" />
          </button>
        </div>
        {resourceDraftError && (
          <p className={styles.resourceEditError} id={errorId} role="alert">
            {resourceDraftError.message}
          </p>
        )}
      </>
    );
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
          <ContextProjectSection
            id={id}
            document={document}
            disabled={disabled}
            editing={editingContext}
            collapsed={isCollapsed("context")}
            contextRef={contextRef}
            onEditingChange={() => setEditingContext((editing) => !editing)}
            onContextChange={(context) => update({ context })}
            onToggle={() => toggleSection("context")}
          />

          <ContextRulesSection
            id={id}
            document={document}
            disabled={disabled}
            collapsed={isCollapsed("rules")}
            atRuleLimit={atRuleLimit}
            addingRule={addingRule}
            editingRule={editingRule}
            ruleDraft={ruleDraft}
            showValidation={showValidation}
            confirmDeleteRule={confirmDeleteRule}
            confirmDeleteResource={confirmDeleteResource}
            openRuleMenu={openRuleMenu}
            menuPosition={menuPosition}
            addRuleRef={addRuleRef}
            ruleInputRef={ruleInputRef}
            deleteCancelRef={deleteCancelRef}
            ruleActionRefs={ruleActionRefs}
            ruleMenuRef={ruleMenuRef}
            onAddRule={() => { setAddingRule(true); setRuleDraft(""); }}
            onRuleDraftChange={setRuleDraft}
            onCancelRule={cancelRuleEdit}
            onConfirmRule={confirmRuleEdit}
            onConfirmDelete={(index) => {
              const nextRules = document.rules.filter((_, i) => i !== index);
              const nextFocus = nextRules.length ? Math.min(index, nextRules.length - 1) : -1;
              update({ rules: nextRules });
              setConfirmDeleteRule(null);
              setFocusRuleAction(nextFocus);
            }}
            onCancelDelete={(index) => { setConfirmDeleteRule(null); setFocusRuleAction(index); }}
            onOpenMenu={beginRuleMenu}
            onMenuKeyDown={handleRuleMenuKeyDown}
            onEditRule={editRule}
            onDeleteRule={(index) => { setConfirmDeleteRule(index); setOpenRuleMenu(null); }}
            renderSectionToggle={renderSectionToggle}
          />

          <ContextResourcesSection
            id={id}
            document={document}
            disabled={disabled}
            collapsed={isCollapsed("resources")}
            atResourceLimit={atResourceLimit}
            uploading={uploading}
            resourceDraft={resourceDraft}
            confirmDeleteResource={confirmDeleteResource}
            confirmDeleteRule={confirmDeleteRule}
            openResourceMenu={openResourceMenu}
            resourceMenuPosition={resourceMenuPosition}
            retryFile={retryFile}
            uploadError={uploadError}
            resourceAddRef={resourceAddRef}
            fileInputRef={fileInputRef}
            resourceMenuRef={resourceMenuRef}
            resourceDeleteCancelRef={resourceDeleteCancelRef}
            resourceActionRefs={resourceActionRefs}
            resourceDeleteRefs={resourceDeleteRefs}
            renderSectionToggle={renderSectionToggle}
            onBeginMenu={beginResourceMenu}
            onFileChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void uploadResource(file, filePickerProjectIdRef.current);
            }}
            onMenuKeyDown={handleResourceMenuKeyDown}
            onAddUrl={addUrlResource}
            onChooseFile={() => {
              setOpenResourceMenu(false);
              filePickerProjectIdRef.current = projectId;
              resourceAddRef.current?.focus();
              fileInputRef.current?.click();
            }}
            onCancelRemoval={cancelResourceRemoval}
            onConfirmRemoval={confirmResourceRemoval}
            onBeginRemoval={beginResourceRemoval}
            onEditUrl={editUrlResource}
            onRenderEditor={renderResourceEditor}
            onRetry={(file) => void uploadResource(file)}
          />

          <ContextSaveStatus
            saving={saving}
            saved={saved}
            hasPendingChanges={hasPendingChanges}
            ruleDraftPending={ruleDraftPending}
            resourceDraftActive={resourceDraft !== null}
            saveError={saveError}
            valid={valid}
            onRetry={onRetrySave}
          />
        </>
      )}
    </>
  );
}
