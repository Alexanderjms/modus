"use client";

import type { PendingAttachment } from "./use-chat-attachments";
import { attachmentUrl } from "../../chat-attachments.mjs";
import { FileTypeIcon } from "./file-type-icon";
import styles from "./chat-attachments.module.css";
import { useT } from "../../i18n/provider";

export function ChatAttachments({ items, projectId, disabled, onRetry, onCancel, onRemove }: {
  items: PendingAttachment[]; projectId?: number; disabled: boolean;
  onRetry: (key: string) => void; onCancel: (key: string) => void; onRemove: (key: string) => void;
}) {
  const t = useT();
  if (!items.length) return null;
  return <ul className={styles.list} aria-label={t("Archivos adjuntos")}>
    {items.map((item) => <li className={styles.item} key={item.key}>
      {item.preview ? <img className={styles.preview} src={item.preview} alt="" /> : <span className={styles.icon} aria-hidden="true"><FileTypeIcon name={item.file.name} size={20} /></span>}
      <div className={styles.info}>
        <span className={styles.name} title={item.file.name}>{item.file.name}</span>
        <span className={styles.meta}>{Math.max(1, Math.ceil(item.file.size / 1024))} {t("KiB ·")} {item.status === "uploading" ? t("Subiendo {0}%", item.progress) : item.status === "ready" ? t("Listo") : item.status === "removing" ? t("Quitando…") : t("Subida incompleta")}</span>
        {item.error && <span className={styles.error} role="alert">{t(item.error)}</span>}
        {item.status === "uploading" && <progress aria-label={t("Subiendo {0}", item.file.name)} max={100} value={item.progress} />}
        {item.attachment && projectId && !item.preview && <a href={attachmentUrl(item.attachment.id, projectId)} target="_blank" rel="noreferrer">{t("Descargar archivo")}</a>}
      </div>
      <div className={styles.actions}>
        {item.status === "uploading" && <button type="button" disabled={disabled} aria-label={t("Cancelar {0}", item.file.name)} onClick={() => onCancel(item.key)}><i aria-hidden="true" className="bi bi-x-circle" /></button>}
        {(item.status === "error" || item.status === "cancelled") && <button type="button" disabled={disabled} aria-label={t("Reintentar {0}", item.file.name)} onClick={() => onRetry(item.key)}><i aria-hidden="true" className="bi bi-arrow-clockwise" /></button>}
        <button type="button" disabled={disabled || item.status === "removing"} aria-label={t("Quitar {0}", item.file.name)} onClick={() => onRemove(item.key)}><i aria-hidden="true" className="bi bi-trash3" /></button>
      </div>
    </li>)}</ul>;
}
