"use client";

import { useId } from "react";
import styles from "./context.module.css";
import planStyles from "./context-plan.module.css";

export function ContextPlan({
  tab,
  notes,
  onNotesChange,
}: {
  tab: "Resumen" | "Estructura" | "Cronograma" | "Notas";
  notes: string;
  onNotesChange: (value: string) => void;
}) {
  const id = useId();

  if (tab === "Resumen") {
    return (
      <>
        {[
          "Información general",
          "Progreso general",
          "Próximos hitos",
          "Plan sugerido para hoy",
        ].map((heading) => (
          <section className={planStyles.summaryCard} key={heading}>
            <h3>{heading}</h3>
            <p>Aún no hay información para este proyecto.</p>
          </section>
        ))}
      </>
    );
  }

  if (tab === "Notas") {
    return (
      <section className={styles.contextSection}>
        <label className={styles.fieldLabel} htmlFor={`${id}-notes-input`}>
          Notas del proyecto
        </label>
        <textarea
          id={`${id}-notes-input`}
          rows={8}
          maxLength={2000}
          placeholder="Escribe notas para este proyecto…"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          aria-describedby={`${id}-notes-scope`}
        />
        <p id={`${id}-notes-scope`} className={styles.localNotice}>
          Estas notas son temporales y se descartan al cambiar de proyecto o recargar.
        </p>
      </section>
    );
  }

  return (
    <section className={planStyles.summaryCard}>
      <h3>{tab}</h3>
      <p>
        {tab === "Estructura"
          ? "Aún no hay una estructura definida para este proyecto."
          : "Aún no hay fechas registradas para este proyecto."}
      </p>
    </section>
  );
}
