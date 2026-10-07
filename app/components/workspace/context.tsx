"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import styles from "./context.module.css";
import planStyles from "./context-plan.module.css";
import shared from "../workspace.module.css";
import { ContextPlan } from "./context-plan";
import { mergeContextSave } from "./context-autosave.mjs";
import { getContextPanelLoadState } from "./context-load-state.mjs";
import { ContextSections } from "./context-sections";
import { useWorkspaceRequest } from "./workspace-query-provider";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateWorkspaceQueries } from "./workspace-query.mjs";
import {
  isContextDocument,
  isValidContextDocument,
  type ContextDocument,
} from "./context-document.mjs";

const planTabs = ["Resumen", "Estructura", "Cronograma", "Notas"] as const;

export function WorkspaceContext({
  plan,
  project,
  projectId,
  projectsLoading,
  projectsError,
  onRetryProjects,
  hidden,
  onClose,
  closeButtonRef,
  onPendingChangesChange,
}: {
  plan: boolean;
  project: string;
  projectId?: number;
  projectsLoading: boolean;
  projectsError: string;
  onRetryProjects: () => void;
  hidden: boolean;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onPendingChangesChange: (pending: boolean) => void;
}) {
  const id = useId();
  const request = useWorkspaceRequest();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<(typeof planTabs)[number]>("Resumen");
  const [notes, setNotes] = useState("");
  const [document, setDocument] = useState<ContextDocument>({ context: "", rules: [], resources: [] });
  const [originalDocument, setOriginalDocument] = useState<ContextDocument>(document);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready" | "no-project">(
    projectId ? "loading" : "no-project",
  );
  const panelLoadState = getContextPanelLoadState(
    projectsLoading,
    projectsError,
    projectId,
    loadState,
  );
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [localDraftPending, setLocalDraftPending] = useState(false);
  const documentRef = useRef(document);
  const projectIdRef = useRef(projectId);
  const loadStateRef = useRef(loadState);
  projectIdRef.current = projectId;
  loadStateRef.current = panelLoadState;
  const generationRef = useRef(0);
  const savingRef = useRef(false);
  const saveController = useRef<AbortController | null>(null);
  const hasPendingChanges = loadState === "ready" && (
    localDraftPending || JSON.stringify(document) !== JSON.stringify(originalDocument)
  );

  useEffect(() => {
    onPendingChangesChange(hasPendingChanges);
  }, [hasPendingChanges, onPendingChangesChange]);

  useEffect(() => {
    const generation = ++generationRef.current;
    if (projectsLoading || projectsError) {
      setLoadState("loading");
      return;
    }
    if (!projectId) {
      const emptyDocument = { context: "", rules: [], resources: [] };
      documentRef.current = emptyDocument;
      setDocument(emptyDocument);
      setOriginalDocument(emptyDocument);
      setLoadState("no-project");
      setLocalDraftPending(false);
      onPendingChangesChange(false);
      return;
    }

    const controller = new AbortController();
    setLoadState("loading");
    setLocalDraftPending(false);
    setLoadError("");
    setSaveError("");
    setSaved(false);
    const emptyDocument = { context: "", rules: [], resources: [] };
    documentRef.current = emptyDocument;
    setDocument(emptyDocument);
    setOriginalDocument(emptyDocument);
    saveController.current?.abort();
    saveController.current = null;
    savingRef.current = false;
    setSaving(false);

    async function loadDocument() {
      try {
        const response = await request(`/api/projects/${projectId}/context`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            result && typeof result === "object" && "error" in result && typeof result.error === "string"
              ? result.error
              : "No se pudo cargar el contexto del proyecto.";
          throw new Error(message);
        }
        if (!isContextDocument(result)) throw new Error("La respuesta del contexto no es válida.");
        if (controller.signal.aborted || generationRef.current !== generation) return;
        documentRef.current = result;
        setDocument(result);
        setOriginalDocument(result);
        setLoadState("ready");
      } catch (reason) {
        if (!controller.signal.aborted && generationRef.current === generation) {
          setLoadError(reason instanceof Error ? reason.message : "No se pudo cargar el contexto del proyecto.");
          setLoadState("error");
        }
      }
    }

    void loadDocument();
    return () => {
      controller.abort();
      saveController.current?.abort();
      if (generationRef.current === generation) generationRef.current++;
    };
  }, [projectId, projectsLoading, projectsError, loadAttempt, onPendingChangesChange, request]);

  useEffect(() => {
    if (!hasPendingChanges) return;
    function confirmDiscard(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", confirmDiscard);
    return () => window.removeEventListener("beforeunload", confirmDiscard);
  }, [hasPendingChanges]);

  const saveDocument = useCallback(async () => {
    const requestProjectId = projectIdRef.current;
    const generation = generationRef.current;
    const snapshot = documentRef.current;
    if (
      !requestProjectId ||
      loadState !== "ready" ||
      savingRef.current ||
      !isValidContextDocument(snapshot)
    ) return;

    const controller = new AbortController();
    savingRef.current = true;
    saveController.current = controller;
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const response = await request(`/api/projects/${requestProjectId}/context`, {
        method: "PUT",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
        signal: controller.signal,
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          result && typeof result === "object" && "error" in result && typeof result.error === "string"
            ? result.error
            : "No se pudieron guardar los cambios.";
        throw new Error(message);
      }
      if (!isContextDocument(result)) throw new Error("La respuesta del guardado no es válida.");
      if (
        controller.signal.aborted ||
        generationRef.current !== generation ||
        projectIdRef.current !== requestProjectId
      ) return;
      const merged = mergeContextSave(documentRef.current, snapshot, result);
      documentRef.current = merged.document;
      setDocument(merged.document);
      setOriginalDocument(result);
      setSaved(!merged.needsSave);
    } catch (reason) {
      if (
        !controller.signal.aborted &&
        generationRef.current === generation &&
        projectIdRef.current === requestProjectId
      ) {
        setSaveError(reason instanceof Error ? reason.message : "No se pudieron guardar los cambios.");
      }
    } finally {
      if (saveController.current === controller) {
        saveController.current = null;
        savingRef.current = false;
        if (generationRef.current === generation && !controller.signal.aborted) setSaving(false);
      }
    }
  }, [loadState, request]);

  useEffect(() => {
    if (
      loadState !== "ready" ||
      !projectId ||
      saving ||
      saveError ||
      !isValidContextDocument(document) ||
      JSON.stringify(document) === JSON.stringify(originalDocument)
    ) return;

    const timeout = window.setTimeout(() => void saveDocument(), 500);
    return () => window.clearTimeout(timeout);
  }, [document, loadState, originalDocument, projectId, saveDocument, saveError, saving]);

  function changeDocument(next: ContextDocument) {
    documentRef.current = next;
    setDocument(next);
    setSaveError("");
    setSaved(false);
  }

  function selectTab(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % planTabs.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + planTabs.length) % planTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = planTabs.length - 1;
    else return;

    event.preventDefault();
    setActiveTab(planTabs[nextIndex]);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [nextIndex]?.focus();
  }

  return (
    <aside
      id="workspace-context"
      className={`${styles.context} panel-slide-right`}
      aria-labelledby={`${id}-title`}
      data-closed={hidden}
      aria-hidden={hidden}
      inert={hidden}
    >
      <header className={shared.panelHeader}>
        <div>
          <h2 id={`${id}-title`}>{plan ? "Plan del proyecto" : "Contexto"}</h2>
          <p>
            {plan
              ? project || "Sin proyecto seleccionado"
              : "Información que la IA tendrá en cuenta."}
          </p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className={shared.iconButton}
          aria-label="Ocultar contexto"
          aria-expanded={!hidden}
          aria-controls="workspace-context"
          onClick={onClose}
        >
          <i aria-hidden="true" className="bi bi-layout-sidebar-reverse" />
        </button>
      </header>
      {plan ? (
        <>
          <div className={planStyles.tabs} role="tablist" aria-label="Secciones del plan">
            {planTabs.map((tab, index) => (
              <button
                key={tab}
                type="button"
                id={`${id}-tab-${index}`}
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={`${id}-plan-panel`}
                tabIndex={activeTab === tab ? 0 : -1}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(event) => selectTab(index, event)}
              >
                {tab}
              </button>
            ))}
          </div>
          <div
            className={`${styles.contextBody} ${styles.planBody}`}
            id={`${id}-plan-panel`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${planTabs.indexOf(activeTab)}`}
            tabIndex={0}
          >
            <ContextPlan
              tab={activeTab}
              notes={notes}
              onNotesChange={setNotes}
            />
          </div>
        </>
      ) : (
        <div className={styles.contextBody}>
          <ContextSections
            document={document}
            projectId={projectId}
            disabled={!projectId || panelLoadState !== "ready"}
            hidden={hidden}
            hasPendingChanges={hasPendingChanges}
            onDraftPendingChange={setLocalDraftPending}
            onChange={changeDocument}
            onResourceUploaded={(uploadedProjectId, resource) => {
              if (
                projectIdRef.current !== uploadedProjectId ||
                loadStateRef.current !== "ready" ||
                documentRef.current.resources.length >= 50
              ) return false;
              changeDocument({
                ...documentRef.current,
                resources: [...documentRef.current.resources, resource],
              });
              return true;
            }}
            onRetrySave={() => void saveDocument()}
            onRetry={projectsError ? onRetryProjects : () => {
              if (projectId) void invalidateWorkspaceQueries(queryClient, `/api/projects/${projectId}/context`);
              setLoadAttempt((attempt) => attempt + 1);
            }}
            loadState={panelLoadState}
            loadError={projectsError || loadError}
            saving={saving}
            saveError={saveError}
            saved={saved}
          />
        </div>
      )}
    </aside>
  );
}
