"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "../app-shell";
import type { Project } from "../projects-data";
import styles from "../workspace.module.css";
import chatStyles from "./chat.module.css";
import { Board } from "./board";
import { WorkspaceChatEmpty } from "./chat-empty";
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
  const [priority, setPriority] = useState("");
  const contextTrigger = useRef<HTMLButtonElement>(null);
  const chatTrigger = useRef<HTMLButtonElement>(null);

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

  function closeChat() {
    setChatOpen(false);
    requestAnimationFrame(() => chatTrigger.current?.focus());
  }

  function closeContext() {
    setContextOpen(false);
    requestAnimationFrame(() => contextTrigger.current?.focus());
  }

  return (
    <AppShell
      active="tareas"
      query={query}
      onSearch={setQuery}
      headerLeft={
        <ProjectSelector
          project={project}
          projects={projects}
          loading={projectsLoading}
          error={projectsError}
          onSelect={(name) => {
            setProject(name);
          }}
        />
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
              <WorkspaceChatEmpty onClose={closeChat} />
            </div>
          </div>
        </div>
        <Board
          priority={priority}
          onPriority={setPriority}
          projectName={project}
          projectsLoading={projectsLoading}
          projectsError={projectsError}
          onRetryProjects={() => setProjectsReload((value) => value + 1)}
          chatOpen={chatOpen}
          onShowChat={() => setChatOpen(true)}
          contextOpen={contextOpen}
          onShowContext={() => setContextOpen(true)}
          chatTrigger={chatTrigger}
          contextTrigger={contextTrigger}
        />
        <div
          className={`${styles.contextSlot} panel-slot`}
          data-closed={!contextOpen}
        >
          <div className="panel-clip">
            <WorkspaceContext
              key={project}
              plan={!chatOpen}
              project={project}
              hidden={!contextOpen}
              onClose={closeContext}
            />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
