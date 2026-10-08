"use client";

import { createPortal } from "react-dom";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import styles from "./context.module.css";
import ruleStyles from "./context-rules.module.css";
import type { ContextDocument } from "./context-document.mjs";
import { useT } from "../../i18n/provider";

export function ContextRulesSection({
  id,
  document,
  collapsed,
  disabled,
  atRuleLimit,
  addingRule,
  editingRule,
  ruleDraft,
  showValidation,
  confirmDeleteRule,
  confirmDeleteResource,
  openRuleMenu,
  menuPosition,
  addRuleRef,
  ruleInputRef,
  deleteCancelRef,
  ruleActionRefs,
  ruleMenuRef,
  onAddRule,
  onRuleDraftChange,
  onCancelRule,
  onConfirmRule,
  onConfirmDelete,
  onCancelDelete,
  onOpenMenu,
  onMenuKeyDown,
  onEditRule,
  onDeleteRule,
  renderSectionToggle,
}: {
  id: string;
  document: ContextDocument;
  collapsed: boolean;
  disabled: boolean;
  atRuleLimit: boolean;
  addingRule: boolean;
  editingRule: number | null;
  ruleDraft: string;
  showValidation: boolean;
  confirmDeleteRule: number | null;
  confirmDeleteResource: unknown;
  openRuleMenu: number | null;
  menuPosition: { top: number; left: number };
  addRuleRef: RefObject<HTMLButtonElement | null>;
  ruleInputRef: RefObject<HTMLInputElement | null>;
  deleteCancelRef: RefObject<HTMLButtonElement | null>;
  ruleActionRefs: RefObject<Map<number, HTMLButtonElement>>;
  ruleMenuRef: RefObject<HTMLDivElement | null>;
  onAddRule: () => void;
  onRuleDraftChange: (value: string) => void;
  onCancelRule: () => void;
  onConfirmRule: () => void;
  onConfirmDelete: (index: number) => void;
  onCancelDelete: (index: number) => void;
  onOpenMenu: (index: number, button: HTMLButtonElement) => void;
  onMenuKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onEditRule: (index: number) => void;
  onDeleteRule: (index: number) => void;
  renderSectionToggle: (key: string, label: string) => ReactNode;
}) {
  const t = useT();
  return (
    <section className={styles.contextSection} aria-labelledby={`${id}-rules`}>
      <header>
        <h3 id={`${id}-rules`}>{t("REGLAS A SEGUIR")}</h3>
        <button
          type="button"
          aria-label={t("Agregar regla")}
          title={atRuleLimit ? t("Máximo 50 reglas.") : undefined}
          ref={addRuleRef}
          disabled={disabled || atRuleLimit || addingRule || editingRule !== null || confirmDeleteRule !== null || confirmDeleteResource !== null}
          onClick={onAddRule}
        >
          <i aria-hidden="true" className="bi bi-plus" />
        </button>
        {renderSectionToggle("rules", t("las reglas a seguir"))}
      </header>
      <div
        id={`${id}-rules-panel`}
        role="region"
        aria-labelledby={`${id}-rules`}
        aria-hidden={collapsed}
        inert={collapsed}
        data-open={!collapsed}
        className={styles.sectionBody}
      >
        <div className={styles.sectionBodyInner}>
          {document.rules.length || addingRule ? (
            <ul className={styles.editableList}>
              {document.rules.map((rule, index) => (
                <li className={`${styles.ruleRow} ${editingRule === index ? styles.ruleEditRow : ""}`} key={index}>
                  {editingRule === index ? (
                    <>
                      <label className={styles.srOnly} htmlFor={`${id}-rule-${index}`}>{t("Editar regla")} {index + 1}</label>
                      <input
                        ref={ruleInputRef}
                        id={`${id}-rule-${index}`}
                        className={ruleStyles.ruleInput}
                        value={ruleDraft}
                        maxLength={500}
                        disabled={disabled}
                        aria-invalid={showValidation && !ruleDraft.trim()}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            onCancelRule();
                          } else if (event.key === "Enter") {
                            event.preventDefault();
                            if (!disabled) onConfirmRule();
                          }
                        }}
                        onChange={(event) => onRuleDraftChange(event.target.value)}
                      />
                      <div className={styles.ruleEditActions}>
                        <button type="button" aria-label={t("Cancelar edición")} onClick={onCancelRule}>
                          <i aria-hidden="true" className="bi bi-x" />
                        </button>
                        <button type="button" aria-label={t("Confirmar regla")} onClick={onConfirmRule}>
                          <i aria-hidden="true" className="bi bi-check" />
                        </button>
                      </div>
                      {showValidation && !ruleDraft.trim() && (
                        <p className={ruleStyles.inlineRuleError} role="alert">{t("Escribe una regla antes de confirmar.")}</p>
                      )}
                    </>
                  ) : confirmDeleteRule === index ? (
                    <div className={styles.deleteConfirm} role="group" aria-label={t("Confirmar eliminación de regla {0}", index + 1)}>
                      <span>{t("¿Eliminar esta regla?")}</span>
                      <button type="button" ref={deleteCancelRef} onClick={() => onCancelDelete(index)}>{t("Cancelar")}</button>
                      <button type="button" className={styles.deleteConfirmAction} onClick={() => onConfirmDelete(index)}>
                        {t("Eliminar")}
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className={ruleStyles.ruleChip}>{rule}</span>
                      <button
                        ref={(element) => {
                          if (element) ruleActionRefs.current.set(index, element);
                          else ruleActionRefs.current.delete(index);
                        }}
                        type="button"
                        className={styles.ruleActionsButton}
                        aria-label={t("Acciones para regla {0}", index + 1)}
                        aria-haspopup="menu"
                        aria-expanded={openRuleMenu === index}
                        aria-controls={`${id}-rule-actions`}
                        disabled={disabled || addingRule || editingRule !== null || confirmDeleteRule !== null || confirmDeleteResource !== null}
                        onClick={(event) => onOpenMenu(index, event.currentTarget)}
                      >
                        <i aria-hidden="true" className="bi bi-three-dots" />
                      </button>
                    </>
                  )}
                </li>
              ))}
              {addingRule && (
                <li className={`${styles.ruleRow} ${styles.ruleEditRow}`}>
                  <label className={styles.srOnly} htmlFor={`${id}-new-rule`}>{t("Nueva regla")}</label>
                  <input
                    ref={ruleInputRef}
                    id={`${id}-new-rule`}
                    className={ruleStyles.ruleInput}
                    value={ruleDraft}
                    maxLength={500}
                    disabled={disabled}
                    aria-invalid={showValidation && !ruleDraft.trim()}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        onCancelRule();
                      } else if (event.key === "Enter") {
                        event.preventDefault();
                        if (!disabled) onConfirmRule();
                      }
                    }}
                    onChange={(event) => onRuleDraftChange(event.target.value)}
                  />
                  <div className={styles.ruleEditActions}>
                    <button type="button" aria-label={t("Cancelar regla")} onClick={onCancelRule}>
                      <i aria-hidden="true" className="bi bi-x" />
                    </button>
                    <button type="button" aria-label={t("Confirmar regla")} onClick={onConfirmRule}>
                      <i aria-hidden="true" className="bi bi-check" />
                    </button>
                  </div>
                  {showValidation && !ruleDraft.trim() && (
                    <p className={ruleStyles.inlineRuleError} role="alert">{t("Escribe una regla antes de confirmar.")}</p>
                  )}
                </li>
              )}
            </ul>
          ) : <p>{t("Aún no hay reglas para este proyecto.")}</p>}
        </div>
      </div>
      {openRuleMenu !== null && typeof window !== "undefined" && createPortal(
        <div
          ref={ruleMenuRef}
          id={`${id}-rule-actions`}
          className={ruleStyles.ruleMenu}
          role="menu"
          aria-label={t("Acciones para regla {0}", openRuleMenu + 1)}
          style={{ top: menuPosition.top, left: menuPosition.left }}
          onKeyDown={onMenuKeyDown}
        >
          <button type="button" role="menuitem" onClick={() => onEditRule(openRuleMenu)}>{t("Editar")}</button>
          <button type="button" role="menuitem" className={ruleStyles.ruleMenuDelete} onClick={() => onDeleteRule(openRuleMenu)}>
            {t("Eliminar")}
          </button>
        </div>,
        globalThis.document.body,
      )}
    </section>
  );
}
