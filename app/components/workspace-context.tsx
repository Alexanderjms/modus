"use client";

import { useId, useState } from "react";
import { contextText, rules } from "./workspace-data";
import styles from "./workspace.module.css";

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
      <header className={styles.panelHeader}>
        <div>
          <h2 id={`${id}-title`}>{plan ? "Plan del proyecto" : "Contexto"}</h2>
          <p>{plan ? project : "Información que la IA tendrá en cuenta."}</p>
        </div>
        <button
          className={styles.iconButton}
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
          <p className={styles.notice}>
            Este proyecto aún no tiene contexto en esta vista.
          </p>
        ) : plan ? (
          tab === "Resumen" ? (
            <>
              <section className={styles.summaryCard}>
                <h3>Información general</h3>
                {[
                  ["NOMBRE", project],
                  [
                    "DESCRIPCIÓN",
                    "Plataforma para la gestión de investigadores, organizaciones y proyectos de investigación en la región.",
                  ],
                  [
                    "OBJETIVO",
                    "Facilitar la colaboración y el acceso a información científica regional.",
                  ],
                ].map(([label, text]) => (
                  <div key={label}>
                    <h4>{label}</h4>
                    <p>{text}</p>
                  </div>
                ))}
                <h4>STACK</h4>
                <div className={styles.tags}>
                  {["Next.js", "PostgreSQL", "TypeScript"].map((name) => (
                    <span key={name}>{name}</span>
                  ))}
                </div>
              </section>
              <section className={styles.summaryCard}>
                <h3>Progreso general</h3>
                <div className={styles.bigProgress}>
                  <strong>35%</strong>
                  <span>14 de 40 tareas completadas</span>
                </div>
                <progress max={100} value={35} aria-label="Progreso general" />
                {[
                  ["Por hacer", 5],
                  ["En progreso", 3],
                  ["Terminado", 14],
                  ["Backlog", 18],
                ].map(([name, count]) => (
                  <p key={name} className={styles.distribution}>
                    <span>{name}</span>
                    <b>{count}</b>
                  </p>
                ))}
              </section>
              <section className={styles.summaryCard}>
                <h3>Próximos hitos</h3>
                {[
                  ["Módulo de investigadores completo", 3, 6],
                  ["Testing general de la aplicación", 1, 8],
                  ["Despliegue en producción", 0, 5],
                ].map(([name, value, total]) => (
                  <div key={name}>
                    <p className={styles.distribution}>
                      <span>{name}</span>
                      <span>
                        {value}/{total}
                      </span>
                    </p>
                    <progress
                      value={Number(value)}
                      max={Number(total)}
                      aria-label={String(name)}
                    />
                  </div>
                ))}
              </section>
              <section className={styles.summaryCard}>
                <h3>Plan sugerido para hoy</h3>
                {[
                  "Probar cambio de universidad",
                  "Validar actualización organizaciones",
                  "Revisar filtros de búsqueda",
                  "Revisar rendimiento de consultas",
                ].map((text) => (
                  <label className={styles.rule} key={text}>
                    <input type="checkbox" />
                    {text}
                  </label>
                ))}
              </section>
            </>
          ) : tab === "Notas" ? (
            <label className={styles.contextSection}>
              Notas
              <textarea
                aria-label="Notas del proyecto"
                rows={8}
                placeholder="Escribe tus notas…"
              />
            </label>
          ) : (
            <p className={styles.notice}>
              La referencia no incluye contenido para esta pestaña.
            </p>
          )
        ) : (
          <>
            <section className={styles.contextSection}>
              <header>
                <h3>CONTEXTO DEL PROYECTO</h3>
                <button
                  aria-label={editing ? "Guardar contexto" : "Editar contexto"}
                  onClick={() => setEditing(!editing)}
                >
                  <i
                    aria-hidden="true"
                    className={`bi bi-${editing ? "check" : "pencil"}`}
                  />
                </button>
              </header>
              {editing ? (
                <textarea
                  autoFocus
                  aria-label="Contexto del proyecto"
                  rows={6}
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                />
              ) : (
                <p>{context}</p>
              )}
              <button
                className={styles.textButton}
                onClick={() => setEditing(true)}
              >
                Ver más
              </button>
            </section>
            <section className={styles.contextSection}>
              <header>
                <h3>REGLAS A SEGUIR</h3>
                <button aria-label="Agregar regla" disabled>
                  <i aria-hidden="true" className="bi bi-plus" />
                </button>
              </header>
              {rules.map((rule) => (
                <p className={styles.rule} key={rule}>
                  <i aria-hidden="true" className="bi bi-check" />
                  {rule}
                </p>
              ))}
              <button
                className={styles.textButton}
                title="La referencia solo incluye cuatro reglas."
                disabled
              >
                Ver todas (7)
              </button>
            </section>
            <section className={styles.contextSection}>
              <header>
                <h3>RECURSOS</h3>
                <button aria-label="Agregar recurso" disabled>
                  <i aria-hidden="true" className="bi bi-plus" />
                </button>
              </header>
              {[
                ["link-45deg", "Documentación API", "docs.proyecto.com"],
                ["vector-pen", "Diseño principal", "Figma"],
                ["file-earmark-text", "requerimientos.pdf", "PDF · 2.4 MB"],
              ].map(([icon, name, info]) => (
                <div className={styles.resource} key={name}>
                  <i aria-hidden="true" className={`bi bi-${icon}`} />
                  <div>
                    <h4>{name}</h4>
                    <p>{info}</p>
                  </div>
                </div>
              ))}
              <button
                className={styles.textButton}
                title="No hay recursos adicionales en la referencia."
                disabled
              >
                Ver todos (6)
              </button>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
