"use client";

import type { PendingAttachment } from "./use-chat-attachments";
import { attachmentUrl } from "../../chat-attachments.mjs";
import { FileTypeIcon } from "./file-type-icon";
import styles from "./chat-attachments.module.css";

export function ChatAttachments({ items, projectId, disabled, onRetry, onCancel, onRemove }: {
  items: PendingAttachment[]; projectId?: number; disabled: boolean;
  onRetry: (key: string) => void; onCancel: (key: string) => void; onRemove: (key: string) => void;
}) {
  if (!items.length) return null;
  return <ul className={styles.list} aria-label="Archivos adjuntos">
    {items.map((item) => <li className={styles.item} key={item.key}>
      {item.preview ? <img className={styles.preview} src={item.preview} alt="" /> : <span className={styles.icon} aria-hidden="true"><FileTypeIcon name={item.file.name} size={20} /></span>}
      <div className={styles.info}>
        <span className={styles.name} title={item.file.name}>{item.file.name}</span>
        <span className={styles.meta}>{Math.max(1, Math.ceil(item.file.size / 1024))} KiB · {item.status === "uploading" ? `Subiendo ${item.progress}%` : item.status === "ready" ? "Listo" : item.status === "removing" ? "Quitando…" : "Subida incompleta"}</span>
        {item.error && <span className={styles.error} role="alert">{item.error}</span>}
        {item.status === "uploading" && <progress aria-label={`Subiendo ${item.file.name}`} max={100} value={item.progress} />}
        {item.attachment && projectId && !item.preview && <a href={attachmentUrl(item.attachment.id, projectId)} target="_blank" rel="noreferrer">Descargar archivo</a>}
      </div>
      <div className={styles.actions}>
        {item.status === "uploading" && <button type="button" disabled={disabled} aria-label={`Cancelar ${item.file.name}`} onClick={() => onCancel(item.key)}><i aria-hidden="true" className="bi bi-x-circle" /></button>}
        {(item.status === "error" || item.status === "cancelled") && <button type="button" disabled={disabled} aria-label={`Reintentar ${item.file.name}`} onClick={() => onRetry(item.key)}><i aria-hidden="true" className="bi bi-arrow-clockwise" /></button>}
        <button type="button" disabled={disabled || item.status === "removing"} aria-label={`Quitar ${item.file.name}`} onClick={() => onRemove(item.key)}><i aria-hidden="true" className="bi bi-trash3" /></button>
      </div>
    </li>)}</ul>;
}
