"use client";

import { useRef, useState, type FormEvent } from "react";
import { AppShell } from "./app-shell";
import { ProjectSelector } from "./project-selector";
import { WorkspaceChat } from "./workspace-chat";
import { WorkspaceContext } from "./workspace-context";
import { columns, initialTasks } from "./workspace-data";
import styles from "./workspace.module.css";

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
              className={`${styles.chatColumn} panel-slide-left`}
              data-closed={!chatOpen}
              aria-hidden={!chatOpen}
              inert={!chatOpen}
            >
              {available ? (
                <WorkspaceChat onClose={closeChat} onApply={apply} />
              ) : (
                <section className={styles.chat}>
                  <header className={styles.panelHeader}>
                    <h2>Chat con IA</h2>
                    <button
                      className={styles.iconButton}
                      onClick={closeChat}
                      aria-label="Ocultar chat"
                      aria-expanded={true}
                      aria-controls="workspace-chat"
                    >
                      <i aria-hidden="true" className="bi bi-layout-sidebar" />
                    </button>
                  </header>
                  <p className={styles.notice}>
                    No hay conversaciones en este proyecto.
                  </p>
                </section>
              )}
            </div>
          </div>
        </div>
        <section className={styles.board} aria-labelledby="board-title">
          <header className={styles.boardHeader}>
            {!chatOpen && (
              <button
                ref={chatTrigger}
                className={styles.iconButton}
                aria-label="Mostrar chat"
                aria-expanded={false}
                aria-controls="workspace-chat"
                onClick={() => setChatOpen(true)}
              >
                <i aria-hidden="true" className="bi bi-layout-sidebar" />
              </button>
            )}
            <div>
              <h1 id="board-title">Tablero Kanban</h1>
              <p>Gestiona y visualiza el progreso de tus tareas.</p>
            </div>
            <button
              className={styles.primary}
              onClick={() => setNewColumn(0)}
              disabled={!available}
            >
              <i aria-hidden="true" className="bi bi-plus" />
              Nueva tarea
            </button>
            <details className={styles.filter}>
              <summary>
                <i aria-hidden="true" className="bi bi-funnel" />
                Filtrar
              </summary>
              <label>
                Prioridad
                <select
                  aria-label="Filtrar por prioridad"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  <option value="">Todas</option>
                  {["alta", "media", "baja"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </details>
            <button
              className={styles.iconButton}
              aria-label="Más opciones del tablero"
              disabled
            >
              <i aria-hidden="true" className="bi bi-three-dots" />
            </button>
            {!contextOpen && (
              <button
                ref={contextTrigger}
                className={styles.iconButton}
                aria-label="Mostrar contexto"
                aria-expanded={false}
                aria-controls="workspace-context"
                onClick={() => setContextOpen(true)}
              >
                <i
                  aria-hidden="true"
                  className="bi bi-layout-sidebar-reverse"
                />
              </button>
            )}
          </header>
          {newColumn !== null && (
            <form className={styles.newTask} onSubmit={addTask}>
              <input
                autoFocus
                aria-label="Nombre de la tarea"
                placeholder="Nombre de la tarea"
                required
                maxLength={300}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <button className={styles.primary}>Agregar</button>
              <button type="button" onClick={() => setNewColumn(null)}>
                Cancelar
              </button>
            </form>
          )}
          <div className={styles.columns}>
            {columns.map((name, index) => (
              <section
                key={name}
                className={`${styles.column} ${styles[`column${index}`]}`}
                aria-label={name}
                tabIndex={0}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragged.current) move(dragged.current, index);
                  dragged.current = null;
                }}
              >
                <header>
                  <b className={styles.dot} />
                  <h2>{name}</h2>
                  <span>
                    {visible.filter((task) => task.column === index).length}
                  </span>
                </header>
                {visible
                  .filter((task) => task.column === index)
                  .map((task) => (
                    <article
                      key={task.title}
                      className={
                        task.column === 3 ? styles.doneCard : styles.taskCard
                      }
                      draggable
                      onDragStart={() => {
                        dragged.current = task.title;
                      }}
                      onDragEnd={() => {
                        dragged.current = null;
                      }}
                    >
                      {task.column === 3 ? (
                        <>
                          <b className={styles.doneBadge}>
                            <i aria-hidden="true" className="bi bi-check" />
                          </b>
                          <h3>{task.title}</h3>
                          <span>{task.when}</span>
                        </>
                      ) : (
                        <>
                          <h3>{task.title}</h3>
                          <div className={styles.tags}>
                            {task.tags.map((tag) => (
                              <span key={tag} data-tag={tag}>
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className={styles.taskMeta}>
                            <span
                              className={styles.priority}
                              data-priority={task.priority}
                            >
                              <b />
                              Prioridad {task.priority}
                            </span>
                            {task.checklist && (
                              <span>
                                <i
                                  aria-hidden="true"
                                  className="bi bi-list-check"
                                />{" "}
                                {task.checklist}
                              </span>
                            )}
                            <b
                              className={styles.assignee}
                              data-person={task.assignee}
                            >
                              {task.assignee}
                            </b>
                          </div>
                          {task.progress !== undefined && (
                            <progress
                              max={100}
                              value={task.progress}
                              aria-label={`Subtareas de ${task.title}`}
                            />
                          )}
                        </>
                      )}
                      <select
                        className={styles.moveTask}
                        aria-label={`Mover ${task.title}`}
                        value={task.column}
                        onChange={(event) =>
                          move(task.title, Number(event.target.value))
                        }
                      >
                        {columns.map((column, position) => (
                          <option key={column} value={position}>
                            {column}
                          </option>
                        ))}
                      </select>
                    </article>
                  ))}
                <button
                  className={styles.addTask}
                  disabled={!available}
                  onClick={() => setNewColumn(index)}
                >
                  <i aria-hidden="true" className="bi bi-plus" />
                  Agregar tarea
                </button>
              </section>
            ))}
          </div>
          <p role="status" className={notice ? styles.notice : "sr-only"}>
            {notice ||
              (query && !visible.length
                ? "Sin tareas que coincidan con la búsqueda."
                : "")}
          </p>
        </section>
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
