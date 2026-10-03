"use client";

import styles from "./context.module.css";
import shared from "../workspace.module.css";
import { rules } from "./workspace-data";

export function ContextSections({
  context,
  editing,
  onChange,
  onToggleEditing,
  onEdit,
}: {
  context: string;
  editing: boolean;
  onChange: (value: string) => void;
  onToggleEditing: () => void;
  onEdit: () => void;
}) {
  return (
    <>
      <section className={styles.contextSection}>
        <header>
          <h3>CONTEXTO DEL PROYECTO</h3>
          <button
            aria-label={editing ? "Guardar contexto" : "Editar contexto"}
            onClick={onToggleEditing}
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
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <p>{context}</p>
        )}
        <button className={shared.textButton} onClick={onEdit}>
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
          className={shared.textButton}
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
          className={shared.textButton}
          title="No hay recursos adicionales en la referencia."
          disabled
        >
          Ver todos (6)
        </button>
      </section>
    </>
  );
}
