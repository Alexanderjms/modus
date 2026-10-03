"use client";

import { useState } from "react";
import styles from "./chat.module.css";
import shared from "../workspace.module.css";
import { ChatComposer } from "./chat-composer";
import { MiniProposal, ProposalCard } from "./proposal-card";

function Avatar({ user = false }: { user?: boolean }) {
  return (
    <span className={user ? styles.userAvatar : styles.aiAvatar}>
      {user ? "AL" : <i aria-hidden="true" className="bi bi-stars" />}
    </span>
  );
}

export function WorkspaceChat({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (titles: string[]) => void;
}) {
  const [proposal, setProposal] = useState("Pendiente");
  const [miniProposal, setMiniProposal] = useState("Pendiente");
  const [miniSelected, setMiniSelected] = useState(true);
  const [selected, setSelected] = useState([
    "Testing del módulo Investigadores",
    "Documentar resultados del testing",
  ]);
  const [messages, setMessages] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  function send(text: string) {
    setMessages((current) => [...current, text]);
    setNotice(
      "El chat con IA aún no está conectado; este mensaje solo aparece en esta sesión.",
    );
  }
  function toggle(text: string, checked: boolean) {
    setSelected((current) =>
      checked
        ? [...current, text]
        : current.filter((item) => item !== text),
    );
  }
  return (
    <section className={styles.chat} aria-labelledby="chat-title">
      <header className={shared.panelHeader}>
        <span className={styles.aiHeaderAvatar}>
          <i aria-hidden="true" className="bi bi-stars" />
        </span>
        <div>
          <h2 id="chat-title">Chat con IA</h2>
          <p>
            Habla sobre tu proyecto, agrega tareas, pide planes o resuelve
            dudas.
          </p>
        </div>
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
      <div className={styles.messages}>
        <div className={styles.userMessage}>
          <p>
            Debo terminar de realizar testing en esta aplicación. Quiero probar
            el módulo de investigadores, revisar que las organizaciones se
            actualicen correctamente y validar los filtros.
          </p>
          <Avatar user />
        </div>
        <div className={styles.aiMessage}>
          <Avatar />
          <p>
            Perfecto. Puedo convertir eso en una lista de tareas para el
            proyecto. Revisa la propuesta y decide qué quieres aplicar:
          </p>
        </div>
        <div className={styles.aiMessage}>
          <Avatar />
          <ProposalCard
            proposal={proposal}
            selected={selected}
            onToggle={toggle}
            onDiscard={() => setProposal("Descartada")}
            onApply={(titles) => {
              onApply(titles);
              setProposal("Aplicada");
            }}
          />
        </div>
        <div className={styles.userMessage}>
          <p>
            También agrega una tarea para revisar el rendimiento de las
            consultas.
          </p>
          <Avatar user />
        </div>
        <div className={styles.aiMessage}>
          <Avatar />
          <p>Listo. Aquí tienes la propuesta:</p>
        </div>
        <div className={styles.aiMessage}>
          <Avatar />
          <MiniProposal
            proposal={miniProposal}
            selected={miniSelected}
            onSelected={setMiniSelected}
            onDiscard={() => setMiniProposal("Descartada")}
            onApply={() => {
              onApply(["Revisar rendimiento de consultas"]);
              setMiniProposal("Agregada");
            }}
          />
        </div>
        {messages.map((message, index) => (
          <div key={index} className={styles.userMessage}>
            <p>{message}</p>
            <Avatar user />
          </div>
        ))}
        {notice && (
          <p role="status" className={shared.notice}>
            {notice}
          </p>
        )}
      </div>
      <ChatComposer onSend={send} />
    </section>
  );
}
