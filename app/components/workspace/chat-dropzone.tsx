"use client";

import { useRef, type ReactNode } from "react";
import { attachmentAccept } from "../../chat-attachments.mjs";
import styles from "./chat-attachments.module.css";

export function ChatDropzone({ disabled, onFiles, children }: { disabled: boolean; onFiles: (files: File[]) => void; children: (openPicker: () => void) => ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const handleFiles = (files: FileList | null) => { if (!disabled && files?.length) onFiles(Array.from(files)); };
  return <div className={styles.dropzone}>
    {children(() => { if (!disabled) input.current?.click(); })}
    <input ref={input} className={styles.fileInput} type="file" aria-label="Seleccionar archivos adjuntos" tabIndex={-1} accept={attachmentAccept} multiple disabled={disabled} onChange={(event) => { handleFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
  </div>;
}
