"use client";

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import styles from "./modal.module.css";
import { useT } from "../../i18n/provider";

export function Modal({
  open,
  onClose,
  title,
  children,
  onSubmit,
  submitLabel,
  className = "",
  submitClassName = "",
  descriptionId,
  pending = false,
  submitDisabled = false,
  showFooter = true,
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
  submitDisabled?: boolean;
  showFooter?: boolean;
}) {
  const t = useT();
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
            aria-label={t("Cerrar")}
          >
            <i aria-hidden="true" className="bi bi-x-lg" />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {showFooter && (
          <div className={styles.footer}>
            <button
              type="submit"
              className={`${styles.primaryButton} ${submitClassName}`}
              disabled={pending || submitDisabled}
            >
              {submitLabel ?? t("Guardar")}
            </button>
          </div>
        )}
      </form>
    </dialog>
  );
}
