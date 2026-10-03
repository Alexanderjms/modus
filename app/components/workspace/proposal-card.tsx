"use client";

import styles from "./chat.module.css";
import shared from "../workspace.module.css";
import { subtasks } from "./workspace-data";

function ProposalCheckbox({
  text,
  main = false,
  checked,
  disabled,
  onToggle,
}: {
  text: string;
  main?: boolean;
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <label className={main ? styles.proposedTask : styles.subtask}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <span>{text}</span>
      {main && (
        <b className={text.startsWith("Testing") ? styles.high : styles.medium}>
          {text.startsWith("Testing") ? "Alta" : "Media"}
        </b>
      )}
    </label>
  );
}

export function ProposalCard({
  proposal,
  selected,
  onToggle,
  onDiscard,
  onApply,
}: {
  proposal: string;
  selected: string[];
  onToggle: (text: string, checked: boolean) => void;
  onDiscard: () => void;
  onApply: (titles: string[]) => void;
}) {
  const done = proposal !== "Pendiente";
  return (
    <div className={styles.proposal}>
      <header>
        <i aria-hidden="true" className="bi bi-stars" />
        <h3>Propuesta de tareas</h3>
        <b>6</b>
        <span role="status">{proposal}</span>
      </header>
      <div className={styles.proposalBody}>
        <h4>PRIORIDAD ALTA</h4>
        <ProposalCheckbox
          text="Testing del módulo Investigadores"
          main
          checked={selected.includes("Testing del módulo Investigadores")}
          disabled={done}
          onToggle={(checked) =>
            onToggle("Testing del módulo Investigadores", checked)
          }
        />
        <div className={styles.subtasks}>
          {subtasks.map((text) => (
            <ProposalCheckbox
              key={text}
              text={text}
              checked={selected.includes(text)}
              disabled={done}
              onToggle={(checked) => onToggle(text, checked)}
            />
          ))}
        </div>
        <h4>PRIORIDAD MEDIA</h4>
        <ProposalCheckbox
          text="Documentar resultados del testing"
          main
          checked={selected.includes("Documentar resultados del testing")}
          disabled={done}
          onToggle={(checked) =>
            onToggle("Documentar resultados del testing", checked)
          }
        />
        <div className={styles.subtasks}>
          {["Crear documento de pruebas", "Registrar hallazgos"].map((text) => (
            <ProposalCheckbox
              key={text}
              text={text}
              checked={selected.includes(text)}
              disabled={done}
              onToggle={(checked) => onToggle(text, checked)}
            />
          ))}
        </div>
      </div>
      <footer>
        <p>Estos cambios no forman parte del proyecto hasta que los apruebes.</p>
        <div className={styles.actions}>
          <button disabled={done} onClick={onDiscard}>
            Descartar
          </button>
          <button
            className={shared.primary}
            disabled={done || !selected.length}
            onClick={() => onApply(selected)}
          >
            Aplicar 6 tareas
          </button>
        </div>
      </footer>
    </div>
  );
}

export function MiniProposal({
  proposal,
  selected,
  onSelected,
  onDiscard,
  onApply,
}: {
  proposal: string;
  selected: boolean;
  onSelected: (checked: boolean) => void;
  onDiscard: () => void;
  onApply: () => void;
}) {
  const done = proposal !== "Pendiente";
  return (
    <div className={styles.proposal}>
      <div className={styles.proposalBody}>
        <label className={styles.proposedTask}>
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelected(event.target.checked)}
            disabled={done}
          />
          <span>Revisar rendimiento de consultas</span>
          <b className={styles.medium}>Media</b>
        </label>
      </div>
      <footer>
        <div className={styles.actions}>
          <button disabled={done} onClick={onDiscard}>
            Descartar
          </button>
          <button
            className={shared.primary}
            disabled={done || !selected}
            onClick={onApply}
          >
            Agregar
          </button>
        </div>
        {done && <p role="status">{proposal}</p>}
      </footer>
    </div>
  );
}
