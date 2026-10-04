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
              <label
                htmlFor="profile-confirm-password"
                className={styles.label}
              >
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
  const [keys, setKeys] = useState<Record<string, string>>({});

  const providers = [
    {
      id: "bedrock",
      name: "AWS Amazon Bedrock",
      placeholder: "API key",
      logo: "aws-amazon-bedrock.svg",
    },
    {
      id: "cerebras",
      name: "Cerebras",
      placeholder: "API key",
      logo: "cerebras.svg",
    },
    {
      id: "deepinfra",
      name: "DeepInfra",
      placeholder: "API key",
      logo: "deepinfra.svg",
    },
    { id: "google", name: "Google AI Studio", placeholder: "API key", logo: "google.svg" },
    { id: "groq", name: "Groq", placeholder: "gsk_...", logo: "groq.svg" },
    {
      id: "nvidia",
      name: "NVIDIA",
      placeholder: "API key",
      logo: "nvidia.svg",
    },
    {
      id: "opencode",
      name: "OpenCode",
      placeholder: "API key",
      logo: "opencode.svg",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      placeholder: "API key",
      logo: "openrouter-mono.svg",
    },
  ];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Proveedores y API Keys"
      className={styles.providersDialog}
      onSubmit={handleSubmit}
    >
      <div className={styles.providerList}>
        {providers.map(({ id, name, placeholder, logo }) => (
          <div className={styles.providerCard} key={id}>
            <div className={styles.providerHeader}>
              <img
                alt=""
                aria-hidden="true"
                className={`${styles.providerLogo} ${id === "opencode" || id === "openrouter" ? styles.invertInDark : ""}`}
                src={`/providers/${logo}`}
              />
              <span className={styles.providerName}>{name}</span>
              <span
                className={`${styles.providerBadge} ${keys[id] ? styles.active : ""}`}
              >
                {keys[id] ? "Configurado" : "Sin conectar"}
              </span>
            </div>
            <input
              id={`provider-key-${id}`}
              aria-label={`${name} API key`}
              type="password"
              autoComplete="off"
              placeholder={placeholder}
              value={keys[id] ?? ""}
              onChange={(event) =>
                setKeys((current) => ({ ...current, [id]: event.target.value }))
              }
              className={styles.input}
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}
