"use client";

import { useId, type FormEvent } from "react";
import type { Project } from "../projects-data";
import { Icon } from "../icon";
import { Modal } from "../shell/modal";
import styles from "./delete-project-modal.module.css";

export function DeleteProjectModal({
  project,
  error,
  pending,
  onClose,
  onConfirm,
}: {
  project: Project | null;
  error: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const descriptionId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm();
  }

  return (
    <Modal
      open={project !== null}
      onClose={onClose}
      title="Eliminar proyecto"
      descriptionId={descriptionId}
      submitLabel={pending ? "Eliminando…" : "Eliminar proyecto"}
      submitClassName={styles.destructiveButton}
      onSubmit={submit}
      pending={pending}
      className={styles.dialog}
    >
      <div className={styles.content}>
        <span className={styles.iconWrap} aria-hidden="true">
          <Icon name="trash" />
        </span>
        <p id={descriptionId} className={styles.description}>
          ¿Quieres eliminar <strong>{project?.name}</strong>? También se eliminarán sus listas y tareas.
          Esta acción no se puede deshacer.
        </p>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
