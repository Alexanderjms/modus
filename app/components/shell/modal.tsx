"use client";

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import styles from "./modal.module.css";

export function Modal({
  open,
  onClose,
  title,
  children,
  onSubmit,
  submitLabel = "Guardar",
  className = "",
  submitClassName = "",
  descriptionId,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  className?: string;
  submitClassName?: string;
  descriptionId?: string;
  pending?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${className}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
      }}
    >
      <form onSubmit={onSubmit} aria-busy={pending || undefined}>
        <div className={styles.header}>
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={pending}
            aria-label="Cerrar"
          >
            <i aria-hidden="true" className="bi bi-x-lg" />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        <div className={styles.footer}>
          <button
            type="submit"
            className={`${styles.primaryButton} ${submitClassName}`}
            disabled={pending}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
