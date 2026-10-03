"use client";

import styles from "./context.module.css";
import shared from "../workspace.module.css";
import cardStyles from "./task-card.module.css";

export function ContextPlan({
  tab,
  project,
}: {
  tab: string;
  project: string;
}) {
  if (tab === "Resumen") {
    return (
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
          <div className={cardStyles.tags}>
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
    );
  }
  if (tab === "Notas") {
    return (
      <label className={styles.contextSection}>
        Notas
        <textarea
          aria-label="Notas del proyecto"
          rows={8}
          placeholder="Escribe tus notas…"
        />
      </label>
    );
  }
  return (
    <p className={shared.notice}>
      La referencia no incluye contenido para esta pestaña.
    </p>
  );
}
