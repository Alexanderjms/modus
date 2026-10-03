"use client";

import { useRef, useState, type FormEvent } from "react";
import { AppShell } from "../app-shell";
import styles from "../workspace.module.css";
import chatStyles from "./chat.module.css";
import { Board } from "./board";
import { WorkspaceChat } from "./chat";
import { WorkspaceChatEmpty } from "./chat-empty";
import { WorkspaceContext } from "./context";
import { ProjectSelector } from "./project-selector";
import { initialTasks } from "./workspace-data";

export function Workspace({
  initialProject = "Observatorio Regional",
}: {
  initialProject?: string;
}) {
  const [query, setQuery] = useState("");
  const [project, setProject] = useState(initialProject);
  const [chatOpen, setChatOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(true);
  const [tasks, setTasks] = useState(initialTasks);
  const [priority, setPriority] = useState("");
  const [newColumn, setNewColumn] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState("");
  const dragged = useRef<string | null>(null);
  const contextTrigger = useRef<HTMLButtonElement>(null);
  const chatTrigger = useRef<HTMLButtonElement>(null);
  const available = project === "Observatorio Regional";
  const visible = available
    ? tasks.filter(
        (task) =>
          `${task.title} ${task.tags.join(" ")}`
            .toLocaleLowerCase("es")
            .includes(query.trim().toLocaleLowerCase("es")) &&
          (!priority || task.priority === priority),
      )
    : [];

  function closeChat() {
    setChatOpen(false);
    requestAnimationFrame(() => chatTrigger.current?.focus());
  }

  function closeContext() {
    setContextOpen(false);
    requestAnimationFrame(() => contextTrigger.current?.focus());
  }

  function move(title: string, column: number) {
    setTasks((current) =>
      current.map((task) =>
        task.title === title
          ? { ...task, column, when: column === 3 ? "Ahora" : undefined }
          : task,
      ),
    );
    setNotice("");
  }
  function apply(titles: string[]) {
    setTasks((current) => [
      ...current,
      ...titles
        .filter((title) => !current.some((task) => task.title === title))
        .map((title) => ({
          title,
          column: 1,
          tags: ["Testing"],
          priority: "media" as const,
          assignee: "AL",
        })),
    ]);
    setNotice(
      "Propuesta aplicada localmente, sin guardar datos ni conectar IA.",
    );
  }
  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || newColumn === null) return;
    if (tasks.some((task) => task.title === title.trim())) {
      setNotice("Ya existe una tarea con ese nombre.");
      return;
    }
    setTasks((current) => [
      ...current,
      {
        title: title.trim(),
        column: newColumn,
        tags: [],
        priority: "media",
        assignee: "AL",
      },
    ]);
    setTitle("");
    setNewColumn(null);
    setNotice("Tarea agregada en esta sesión.");
  }
  return (
    <AppShell
      activeProject={project}
      active="tareas"
      query={query}
      onSearch={setQuery}
      headerLeft={
        <ProjectSelector
          project={project}
          onSelect={(name) => {
            setProject(name);
            setNewColumn(null);
            setNotice("");
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
              {available ? (
                <WorkspaceChat onClose={closeChat} onApply={apply} />
              ) : (
                <WorkspaceChatEmpty onClose={closeChat} />
              )}
            </div>
          </div>
        </div>
        <Board
          available={available}
          query={query}
          visible={visible}
          priority={priority}
          onPriority={setPriority}
          newColumn={newColumn}
          onNewColumn={setNewColumn}
          title={title}
          onTitle={setTitle}
          notice={notice}
          move={move}
          addTask={addTask}
          chatOpen={chatOpen}
          onShowChat={() => setChatOpen(true)}
          contextOpen={contextOpen}
          onShowContext={() => setContextOpen(true)}
          chatTrigger={chatTrigger}
          contextTrigger={contextTrigger}
          dragged={dragged}
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
