"use client";

import { useId, useState } from "react";
import styles from "./context.module.css";
import shared from "../workspace.module.css";
import { contextText } from "./workspace-data";
import { ContextPlan } from "./context-plan";
import { ContextSections } from "./context-sections";

export function WorkspaceContext({
  plan,
  project,
  hidden,
  onClose,
}: {
  plan: boolean;
  project: string;
  hidden: boolean;
  onClose: () => void;
}) {
  const id = useId();
  const [context, setContext] = useState(contextText);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState("Resumen");
  const available = project === "Observatorio Regional";
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
          <p>{plan ? project : "Información que la IA tendrá en cuenta."}</p>
        </div>
        <button
          className={shared.iconButton}
          aria-label="Ocultar contexto"
          aria-expanded={!hidden}
          aria-controls="workspace-context"
          onClick={onClose}
        >
          <i aria-hidden="true" className="bi bi-layout-sidebar-reverse" />
        </button>
      </header>
      {plan && (
        <div
          className={styles.tabs}
          role="tablist"
          aria-label="Plan del proyecto"
        >
          {["Resumen", "Estructura", "Cronograma", "Notas"].map((name) => (
            <button
              key={name}
              role="tab"
              aria-selected={tab === name}
              aria-controls={`${id}-content`}
              id={`${id}-tab-${name}`}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div
        className={styles.contextBody}
        id={`${id}-content`}
        role={plan ? "tabpanel" : undefined}
        aria-labelledby={plan ? `${id}-tab-${tab}` : undefined}
      >
        {!available ? (
          <p className={shared.notice}>
            Este proyecto aún no tiene contexto en esta vista.
          </p>
        ) : plan ? (
          <ContextPlan tab={tab} project={project} />
        ) : (
          <ContextSections
            context={context}
            editing={editing}
            onChange={setContext}
            onToggleEditing={() => setEditing(!editing)}
            onEdit={() => setEditing(true)}
          />
        )}
      </div>
    </aside>
  );
}
