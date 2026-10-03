"use client";

import { useState, type FormEvent } from "react";
import { subtasks } from "./workspace-data";
import styles from "./workspace.module.css";

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
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    setMessages((current) => [...current, draft.trim()]);
    setDraft("");
    setNotice(
      "El chat con IA aún no está conectado; este mensaje solo aparece en esta sesión.",
    );
  }
  function checkbox(text: string, main = false) {
    return (
      <label key={text} className={main ? styles.proposedTask : styles.subtask}>
        <input
          type="checkbox"
          checked={selected.includes(text)}
          disabled={proposal !== "Pendiente"}
          onChange={(event) =>
            setSelected((current) =>
              event.target.checked
                ? [...current, text]
                : current.filter((item) => item !== text),
            )
          }
        />
        <span>{text}</span>
        {main && (
          <b
            className={text.startsWith("Testing") ? styles.high : styles.medium}
          >
            {text.startsWith("Testing") ? "Alta" : "Media"}
          </b>
        )}
      </label>
    );
  }
  return (
    <section className={styles.chat} aria-labelledby="chat-title">
      <header className={styles.panelHeader}>
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
          className={styles.iconButton}
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
          <div className={styles.proposal}>
            <header>
              <i aria-hidden="true" className="bi bi-stars" />
              <h3>Propuesta de tareas</h3>
              <b>6</b>
              <span role="status">{proposal}</span>
            </header>
            <div className={styles.proposalBody}>
              <h4>PRIORIDAD ALTA</h4>
              {checkbox("Testing del módulo Investigadores", true)}
              <div className={styles.subtasks}>
                {subtasks.map((text) => checkbox(text))}
              </div>
              <h4>PRIORIDAD MEDIA</h4>
              {checkbox("Documentar resultados del testing", true)}
              <div className={styles.subtasks}>
                {["Crear documento de pruebas", "Registrar hallazgos"].map(
                  (text) => checkbox(text),
                )}
              </div>
            </div>
            <footer>
              <p>
                Estos cambios no forman parte del proyecto hasta que los
                apruebes.
              </p>
              <div className={styles.actions}>
                <button
                  disabled={proposal !== "Pendiente"}
                  onClick={() => setProposal("Descartada")}
                >
                  Descartar
                </button>
                <button
                  className={styles.primary}
                  disabled={proposal !== "Pendiente" || !selected.length}
                  onClick={() => {
                    onApply(selected);
                    setProposal("Aplicada");
                  }}
                >
                  Aplicar 6 tareas
                </button>
              </div>
            </footer>
          </div>
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
          <div className={styles.proposal}>
            <div className={styles.proposalBody}>
              <label className={styles.proposedTask}>
                <input
                  type="checkbox"
                  checked={miniSelected}
                  onChange={(event) => setMiniSelected(event.target.checked)}
                  disabled={miniProposal !== "Pendiente"}
                />
                <span>Revisar rendimiento de consultas</span>
                <b className={styles.medium}>Media</b>
              </label>
            </div>
            <footer>
              <div className={styles.actions}>
                <button
                  disabled={miniProposal !== "Pendiente"}
                  onClick={() => setMiniProposal("Descartada")}
                >
                  Descartar
                </button>
                <button
                  className={styles.primary}
                  disabled={miniProposal !== "Pendiente" || !miniSelected}
                  onClick={() => {
                    onApply(["Revisar rendimiento de consultas"]);
                    setMiniProposal("Agregada");
                  }}
                >
                  Agregar
                </button>
              </div>
              {miniProposal !== "Pendiente" && (
                <p role="status">{miniProposal}</p>
              )}
            </footer>
          </div>
        </div>
        {messages.map((message, index) => (
          <div key={index} className={styles.userMessage}>
            <p>{message}</p>
            <Avatar user />
          </div>
        ))}
        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}
      </div>
      <form className={styles.composer} onSubmit={submit}>
        <div>
          <button
            type="button"
            aria-label="Adjuntar archivo"
            title="Los adjuntos aún no están integrados."
            disabled
          >
            <i aria-hidden="true" className="bi bi-paperclip" />
          </button>
          <textarea
            aria-label="Mensaje al chat"
            placeholder="Escribe un mensaje…"
            rows={1}
            maxLength={4000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            className={styles.send}
            aria-label="Enviar mensaje"
            disabled={!draft.trim()}
          >
            <i aria-hidden="true" className="bi bi-send" />
          </button>
        </div>
        <p>Enter para enviar · Shift+Enter para salto de línea</p>
      </form>
    </section>
  );
}
