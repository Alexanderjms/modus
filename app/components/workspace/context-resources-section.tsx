import { createPortal } from "react-dom";
import type { ChangeEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import styles from "./context.module.css";
import resourceStyles from "./context-resources.module.css";
import shared from "../workspace.module.css";
import { getContextResourceDomain, isContextFile, isValidContextDocument, type ContextDocument, type ContextResource } from "./context-document.mjs";

type ResourceDraft = { index: number; isNew: boolean; title: string; url: string };

export function ContextResourcesSection({
  id, document, disabled, collapsed, atResourceLimit, uploading, resourceDraft,
  confirmDeleteResource, confirmDeleteRule, openResourceMenu, resourceMenuPosition,
  retryFile, uploadError, resourceAddRef, fileInputRef, resourceMenuRef,
  resourceDeleteCancelRef, resourceActionRefs, resourceDeleteRefs,
  renderSectionToggle, onBeginMenu, onFileChange, onMenuKeyDown, onAddUrl,
  onChooseFile, onCancelRemoval, onConfirmRemoval, onBeginRemoval, onEditUrl,
  onRenderEditor, onRetry,
}: {
  id: string;
  document: ContextDocument;
  disabled: boolean;
  collapsed: boolean;
  atResourceLimit: boolean;
  uploading: boolean;
  resourceDraft: ResourceDraft | null;
  confirmDeleteResource: { index: number; resource: ContextResource } | null;
  confirmDeleteRule: number | null;
  openResourceMenu: boolean;
  resourceMenuPosition: { top: number; left: number };
  retryFile: File | null;
  uploadError: string;
  resourceAddRef: RefObject<HTMLButtonElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  resourceMenuRef: RefObject<HTMLDivElement | null>;
  resourceDeleteCancelRef: RefObject<HTMLButtonElement | null>;
  resourceActionRefs: RefObject<Map<number, HTMLButtonElement>>;
  resourceDeleteRefs: RefObject<Map<number, HTMLButtonElement>>;
  renderSectionToggle: (key: string, label: string) => ReactNode;
  onBeginMenu: (button: HTMLButtonElement) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onMenuKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onAddUrl: () => void;
  onChooseFile: () => void;
  onCancelRemoval: () => void;
  onConfirmRemoval: () => void;
  onBeginRemoval: (index: number) => void;
  onEditUrl: (index: number) => void;
  onRenderEditor: (index: number, isNew?: boolean) => ReactNode;
  onRetry: (file: File) => void;
}) {
  return (
    <section className={styles.contextSection} aria-labelledby={`${id}-resources`}>
      <header>
        <h3 id={`${id}-resources`}>RECURSOS</h3>
        <button
          type="button"
          aria-label="Agregar recurso"
          aria-haspopup="menu"
          aria-expanded={openResourceMenu}
          aria-controls={`${id}-resource-menu`}
          title={atResourceLimit ? "Máximo 50 recursos." : undefined}
          ref={resourceAddRef}
          disabled={disabled || atResourceLimit || uploading || resourceDraft !== null || confirmDeleteResource !== null || confirmDeleteRule !== null}
          onClick={(event) => onBeginMenu(event.currentTarget)}
        >
          <i aria-hidden="true" className="bi bi-plus" />
        </button>
        {renderSectionToggle("resources", "los recursos")}
      </header>
      <input ref={fileInputRef} type="file" hidden tabIndex={-1} aria-hidden="true" onChange={onFileChange} />
      <div
        id={`${id}-resources-panel`}
        role="region"
        aria-labelledby={`${id}-resources`}
        aria-hidden={collapsed}
        inert={collapsed}
        data-open={!collapsed}
        className={styles.sectionBody}
      >
        <div className={styles.sectionBodyInner}>
          {openResourceMenu && typeof window !== "undefined" && createPortal(
            <div
              ref={resourceMenuRef}
              id={`${id}-resource-menu`}
              className={resourceStyles.resourceMenu}
              role="menu"
              aria-label="Agregar recurso"
              style={{ top: resourceMenuPosition.top, left: resourceMenuPosition.left }}
              onKeyDown={onMenuKeyDown}
            >
              <button type="button" role="menuitem" onClick={onAddUrl}>
                <i aria-hidden="true" className="bi bi-link-45deg" /><span>URL</span>
              </button>
              <button type="button" role="menuitem" onClick={onChooseFile}>
                <i aria-hidden="true" className="bi bi-paperclip" /><span>Archivo</span>
                <i aria-hidden="true" className="bi bi-file-earmark" />
              </button>
            </div>,
            globalThis.document.body,
          )}
          {document.resources.length || resourceDraft?.isNew ? (
            <ul className={styles.editableList}>
              {document.resources.map((resource, index) => {
                const file = isContextFile(resource);
                const editing = resourceDraft?.index === index;
                const validUrl = isValidContextDocument({ context: "", rules: [], resources: [resource] });
                const domain = getContextResourceDomain(resource, validUrl);
                return (
                  <li className={`${styles.resourceFields} ${editing ? styles.resourceEditFields : ""}`} key={index}>
                    {confirmDeleteResource?.index === index ? (
                      <div className={styles.deleteConfirm} role="group" aria-label={`Confirmar ${file ? "quitar archivo" : "eliminar recurso"} ${resource.title || index + 1}`}>
                        <span>{file
                          ? `¿Quitar «${resource.title}» de Recursos? El archivo almacenado no se eliminará.`
                          : `¿Eliminar «${resource.title || `recurso ${index + 1}`}»?`}</span>
                        <button ref={resourceDeleteCancelRef} type="button" onClick={onCancelRemoval}>Cancelar</button>
                        <button type="button" className={styles.deleteConfirmAction} disabled={disabled} onClick={onConfirmRemoval}>
                          {file ? "Quitar de Recursos" : "Eliminar"}
                        </button>
                      </div>
                    ) : file ? (
                      <>
                        <a className={`${styles.resourceLink} ${styles.fileResourceLink}`} href={resource.url} download={resource.title}>
                          <i aria-hidden="true" className="bi bi-file-earmark-arrow-down" /><span>{resource.title}</span>
                        </a>
                        <div className={styles.resourceActions}>
                          <button
                            ref={(element) => {
                              if (element) { resourceActionRefs.current.set(index, element); resourceDeleteRefs.current.set(index, element); }
                              else { resourceActionRefs.current.delete(index); resourceDeleteRefs.current.delete(index); }
                            }}
                            type="button" className={styles.removeButton}
                            aria-label={`Quitar archivo ${resource.title}. El archivo almacenado no se eliminará del servidor.`}
                            title="Quita el recurso de Modus; el archivo almacenado no se elimina del servidor."
                            disabled={disabled || uploading || resourceDraft !== null || confirmDeleteResource !== null || confirmDeleteRule !== null}
                            onClick={() => onBeginRemoval(index)}
                          ><i aria-hidden="true" className="bi bi-trash3" /></button>
                        </div>
                      </>
                    ) : editing ? onRenderEditor(index) : (
                      <>
                        {validUrl ? (
                          <a className={styles.resourceLink} href={resource.url.trim()} target="_blank" rel="noopener noreferrer" title={resource.url.trim()} aria-label={`${resource.title} — ${resource.url.trim()}`}>
                            <i aria-hidden="true" className="bi bi-box-arrow-up-right" />
                            <span className={styles.resourceTitle} title={resource.title}>{resource.title}</span>
                            <span className={styles.resourceDomain}>{domain}</span>
                          </a>
                        ) : <span className={`${styles.resourceLink} ${styles.invalidResourceLink}`}>{resource.title || "URL pendiente"}</span>}
                        <div className={styles.resourceActions}>
                          <button ref={(element) => { if (element) resourceActionRefs.current.set(index, element); else resourceActionRefs.current.delete(index); }} type="button" aria-label={`Editar recurso ${resource.title || index + 1}`} title="Editar URL" disabled={disabled || uploading || resourceDraft !== null || confirmDeleteResource !== null || confirmDeleteRule !== null} onClick={() => onEditUrl(index)}>
                            <i aria-hidden="true" className="bi bi-pencil" />
                          </button>
                          <button ref={(element) => { if (element) resourceDeleteRefs.current.set(index, element); else resourceDeleteRefs.current.delete(index); }} type="button" className={styles.removeButton} aria-label={`Eliminar recurso ${resource.title || index + 1}`} disabled={disabled || uploading || resourceDraft !== null || confirmDeleteResource !== null || confirmDeleteRule !== null} onClick={() => onBeginRemoval(index)}>
                            <i aria-hidden="true" className="bi bi-trash3" />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
              {resourceDraft?.isNew && <li className={`${styles.resourceFields} ${styles.resourceEditFields}`} key="new-url">{onRenderEditor(resourceDraft.index, true)}</li>}
            </ul>
          ) : <p>Aún no hay recursos para este proyecto.</p>}
          {uploading && <p className={resourceStyles.uploadStatus} role="status">Subiendo {retryFile?.name || "archivo"}…</p>}
          {uploadError && (
            <div className={resourceStyles.uploadError}>
              <p className={styles.errorMessage} role="alert">{uploadError}</p>
              {retryFile && <button type="button" className={shared.textButton} disabled={uploading || disabled || confirmDeleteResource !== null} onClick={() => onRetry(retryFile)}>Reintentar subida</button>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
