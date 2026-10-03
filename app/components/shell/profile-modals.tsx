"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "./modal";
import styles from "./profile-modals.module.css";

export function ProfileModal({
  open,
  onClose,
  storageType = "local",
}: {
  open: boolean;
  onClose: () => void;
  storageType?: "local" | "cloud";
}) {
  const isLocal = storageType === "local";

  const [name, setName] = useState("Alexander");
  const [lastName, setLastName] = useState("Molina");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLocal && password && password !== confirmPassword) {
      alert("Las contraseñas no coinciden.");
      return;
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Perfil" onSubmit={handleSubmit}>
      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="profile-name" className={styles.label}>
            Nombre
          </label>
          <input
            id="profile-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.input}
          />
        </div>

        {isLocal ? (
          <div className={styles.field}>
            <label htmlFor="profile-pin" className={styles.label}>
              PIN de acceso
            </label>
            <input
              id="profile-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="Introduce nuevo PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className={styles.input}
            />
          </div>
        ) : (
          <>
            <div className={styles.field}>
              <label htmlFor="profile-last-name" className={styles.label}>
                Apellido
              </label>
              <input
                id="profile-last-name"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="profile-password" className={styles.label}>
                Nueva contraseña
              </label>
              <input
                id="profile-password"
                type="password"
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="profile-confirm-password" className={styles.label}>
                Confirmar contraseña
              </label>
              <input
                id="profile-confirm-password"
                type="password"
                minLength={8}
                placeholder="Repite la contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={styles.input}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function ProvidersModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [groqKey, setGroqKey] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Proveedores y API Keys"
      onSubmit={handleSubmit}
    >
      <div className={styles.providerList}>
        <div className={styles.providerCard}>
          <div className={styles.providerHeader}>
            <i aria-hidden="true" className="bi bi-cpu text-[16px] text-[#007AFF]" />
            <span className={styles.providerName}>OpenAI</span>
            <span
              className={`${styles.providerBadge} ${openaiKey ? styles.active : ""}`}
            >
              {openaiKey ? "Configurado" : "Sin conectar"}
            </span>
          </div>
          <input
            type="password"
            placeholder="sk-..."
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            className={styles.input}
          />
        </div>

        <div className={styles.providerCard}>
          <div className={styles.providerHeader}>
            <i
              aria-hidden="true"
              className="bi bi-stars text-[16px] text-[#AF52DE]"
            />
            <span className={styles.providerName}>Anthropic</span>
            <span
              className={`${styles.providerBadge} ${anthropicKey ? styles.active : ""}`}
            >
              {anthropicKey ? "Configurado" : "Sin conectar"}
            </span>
          </div>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            className={styles.input}
          />
        </div>

        <div className={styles.providerCard}>
          <div className={styles.providerHeader}>
            <i
              aria-hidden="true"
              className="bi bi-lightning-charge text-[16px] text-[#FF9500]"
            />
            <span className={styles.providerName}>Groq</span>
            <span
              className={`${styles.providerBadge} ${groqKey ? styles.active : ""}`}
            >
              {groqKey ? "Configurado" : "Sin conectar"}
            </span>
          </div>
          <input
            type="password"
            placeholder="gsk_..."
            value={groqKey}
            onChange={(e) => setGroqKey(e.target.value)}
            className={styles.input}
          />
        </div>
      </div>
    </Modal>
  );
}
