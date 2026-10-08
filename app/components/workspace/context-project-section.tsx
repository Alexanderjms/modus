"use client";

import type { RefObject } from "react";
import styles from "./context.module.css";
import type { ContextDocument } from "./context-document.mjs";
import { useT } from "../../i18n/provider";

export function ContextProjectSection({
  id,
  document,
  disabled,
  editing,
  collapsed,
  contextRef,
  onEditingChange,
  onContextChange,
  onToggle,
}: {
  id: string;
  document: ContextDocument;
  disabled: boolean;
  editing: boolean;
  collapsed: boolean;
  contextRef: RefObject<HTMLTextAreaElement | null>;
  onEditingChange: () => void;
  onContextChange: (context: string) => void;
  onToggle: () => void;
}) {
  const t = useT();
  const panelId = `${id}-context-panel`;
  return (
    <section className={styles.contextSection} aria-labelledby={`${id}-context`}>
      <header>
        <h3 id={`${id}-context`}>{t("CONTEXTO DEL PROYECTO")}</h3>
        <button
          type="button"
          aria-label={editing ? t("Finalizar edición del contexto") : t("Editar contexto")}
          disabled={disabled}
          onClick={onEditingChange}
        >
          <i aria-hidden="true" className={`bi bi-${editing ? "check" : "pencil"}`} />
        </button>
        <button
          type="button"
          className={styles.sectionToggle}
          aria-expanded={!collapsed}
          aria-controls={panelId}
          aria-label={t("{0} el contexto del proyecto", collapsed ? "Expandir" : "Contraer")}
          onClick={onToggle}
        >
          <i aria-hidden="true" className="bi bi-caret-down-fill" />
        </button>
      </header>
      <div
        id={panelId}
        role="region"
        aria-labelledby={`${id}-context`}
        aria-hidden={collapsed}
        inert={collapsed}
        data-open={!collapsed}
        className={styles.sectionBody}
      >
        <div className={styles.sectionBodyInner}>
          {editing ? (
            <>
              <textarea
                ref={contextRef}
                id={`${id}-description`}
                rows={6}
                maxLength={5000}
                value={document.context}
                disabled={disabled}
                onChange={(event) => onContextChange(event.target.value)}
                aria-label={t("Contexto del proyecto")}
                placeholder={t("Describe el proyecto para orientar las respuestas de la IA…")}
              />
              <p className={styles.fieldHint}>{document.context.length}{t("/5000 caracteres")}</p>
            </>
          ) : (
            <p className={styles.contextText}>
              {document.context || t("Aún no se ha agregado contexto para este proyecto.")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
