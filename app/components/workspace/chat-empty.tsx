"use client";

import styles from "./chat.module.css";
import shared from "../workspace.module.css";

export function WorkspaceChatEmpty({ onClose }: { onClose: () => void }) {
  return (
    <section className={styles.chat}>
      <header className={shared.panelHeader}>
        <h2>Chat con IA</h2>
        <button
          className={shared.iconButton}
          onClick={onClose}
          aria-label="Ocultar chat"
          aria-expanded={true}
          aria-controls="workspace-chat"
        >
          <i aria-hidden="true" className="bi bi-layout-sidebar" />
        </button>
      </header>
      <p className={shared.notice}>No hay conversaciones en este proyecto.</p>
    </section>
  );
}
