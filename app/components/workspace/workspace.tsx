"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "../app-shell";
import type { Project } from "../projects-data";
import styles from "../workspace.module.css";
import chatStyles from "./chat.module.css";
import { Board } from "./board";
import { WorkspaceChat } from "./chat";
import { WorkspaceContext } from "./context";
import { ProjectSelector } from "./project-selector";

export function Workspace({
  initialProject,
}: {
  initialProject?: string;
}) {
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [project, setProject] = useState("");
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [projectsReload, setProjectsReload] = useState(0);
  const [chatOpen, setChatOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(true);
  const [contextPendingChanges, setContextPendingChanges] = useState(false);
  const contextTrigger = useRef<HTMLButtonElement>(null);
  const chatTrigger = useRef<HTMLButtonElement>(null);
  const contextCloseButton = useRef<HTMLButtonElement>(null);
  const chatCloseButton = useRef<HTMLButtonElement>(null);
  const focusChatPanel = useRef(false);
  const focusChatTrigger = useRef(false);
  const focusContextPanel = useRef(false);
  const focusContextTrigger = useRef(false);
  const selectedProject = projects.find((item) => item.name === project) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    async function loadProjects() {
      setProjectsLoading(true);
      setProjectsError("");
      try {
        const response = await fetch("/api/projects", { signal: controller.signal });
        const result = (await response.json().catch(() => ({}))) as {
          projects?: Project[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error || "No se pudieron cargar los proyectos.");
        if (!Array.isArray(result.projects))
          throw new Error("La respuesta no incluye los proyectos.");
        setProjects(result.projects);
        setProject((current) =>
          result.projects!.some(({ name }) => name === current)
            ? current
            : result.projects!.find(({ name }) => name === initialProject)?.name ??
              result.projects![0]?.name ??
              "",
        );
      } catch (reason) {
        if (!controller.signal.aborted) {
          setProjectsError(
            reason instanceof Error ? reason.message : "No se pudieron cargar los proyectos.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setProjectsLoading(false);
      }
    }
    void loadProjects();
    return () => controller.abort();
  }, [initialProject, projectsReload]);

  useEffect(() => {
    if (chatOpen && focusChatPanel.current) {
      chatCloseButton.current?.focus();
      focusChatPanel.current = false;
    } else if (!chatOpen && focusChatTrigger.current) {
      chatTrigger.current?.focus();
      focusChatTrigger.current = false;
    }
  }, [chatOpen]);

  useEffect(() => {
    if (contextOpen && focusContextPanel.current) {
      contextCloseButton.current?.focus();
      focusContextPanel.current = false;
    } else if (!contextOpen && focusContextTrigger.current) {
      contextTrigger.current?.focus();
      focusContextTrigger.current = false;
    }
  }, [contextOpen]);

  function closeChat() {
    focusChatTrigger.current = true;
    setChatOpen(false);
  }

  function closeContext() {
    focusContextTrigger.current = true;
    setContextOpen(false);
  }

  function showChat() {
    focusChatPanel.current = true;
    setChatOpen(true);
  }

  function showContext() {
    focusContextPanel.current = true;
    setContextOpen(true);
  }

  return (
    <AppShell
      active="tareas"
      query={query}
      onSearch={setQuery}
      headerLeft={
        <>
          <ProjectSelector
            project={project}
            projects={projects}
            loading={projectsLoading}
            error={projectsError}
            onSelect={(name) => {
              if (name === project) return;
              if (
                contextPendingChanges &&
                !window.confirm("Hay cambios sin guardar. ¿Descartarlos y cambiar de proyecto?")
              ) return;
              setContextPendingChanges(false);
              setProject(name);
            }}
          />
        </>
      }
    >
      <main className={styles.workspace}>
        <div
          className={`${styles.chatSlot} panel-slot`}
          data-closed={!chatOpen}
        >
          <div className="panel-clip">
            <div
              id="workspace-chat"
              className={`${chatStyles.chatColumn} panel-slide-left`}
              data-closed={!chatOpen}
              aria-hidden={!chatOpen}
              inert={!chatOpen}
            >
              <WorkspaceChat
                key={selectedProject?.id ?? "no-project"}
                project={selectedProject}
                onClose={closeChat}
                closeButtonRef={chatCloseButton}
              />
            </div>
          </div>
        </div>
        <Board
          projectId={selectedProject?.id}
          projectName={project}
          projectsLoading={projectsLoading}
          projectsError={projectsError}
          onRetryProjects={() => setProjectsReload((value) => value + 1)}
          chatOpen={chatOpen}
          onShowChat={showChat}
          contextOpen={contextOpen}
          onShowContext={showContext}
          chatTrigger={chatTrigger}
          contextTrigger={contextTrigger}
        />
        <div
          className={`${styles.contextSlot} panel-slot`}
          data-closed={!contextOpen}
        >
          <div className="panel-clip">
            <WorkspaceContext
              key={selectedProject?.id ?? "no-project"}
              plan={!chatOpen}
              project={project}
              projectId={selectedProject?.id}
              projectsLoading={projectsLoading}
              projectsError={projectsError}
              onRetryProjects={() => setProjectsReload((value) => value + 1)}
              hidden={!contextOpen}
              onClose={closeContext}
              closeButtonRef={contextCloseButton}
              onPendingChangesChange={setContextPendingChanges}
            />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
