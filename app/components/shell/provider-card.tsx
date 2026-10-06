"use client";

import styles from "./profile-modals.module.css";
import { Skeleton } from "../skeleton";
import type { ProviderId } from "./provider-data.mjs";

export function ProviderCard({
  id,
  name,
  placeholder,
  logo,
  configured,
  isRemoved,
  loading,
  canEdit,
  value,
  onKeyChange,
  onToggleRemoval,
}: {
  id: ProviderId;
  name: string;
  placeholder: string;
  logo: string;
  configured: boolean;
  isRemoved: boolean;
  loading: boolean;
  canEdit: boolean;
  value: string;
  onKeyChange: (value: string) => void;
  onToggleRemoval: () => void;
}) {
  return (
    <div className={styles.providerCard}>
      <div className={styles.providerHeader}>
        <img
          alt=""
          aria-hidden="true"
          className={`${styles.providerLogo} ${
            id === "opencode" || id === "openrouter" ? styles.invertInDark : ""
          }`}
          src={`/providers/${logo}`}
        />
        <span className={styles.providerName}>{name}</span>
        <span
          className={`${styles.providerBadge} ${configured ? styles.active : ""}`}
        >
          {loading ? (
            <Skeleton variant="text" width={56} height={9} />
          ) : configured ? (
            "Clave guardada"
          ) : (
            "Sin configurar"
          )}
        </span>
      </div>
      <label htmlFor={`provider-key-${id}`} className={styles.keyLabel}>
        API key
      </label>
      <input
        id={`provider-key-${id}`}
        aria-label={`${name} API key`}
        type="password"
        autoComplete="off"
        maxLength={4096}
        placeholder={
          configured ? "Clave guardada · introduce una nueva para reemplazar" : placeholder
        }
        value={value}
        disabled={!canEdit || isRemoved}
        onChange={(event) => onKeyChange(event.target.value)}
        className={styles.input}
      />
      {configured && (
        <button
          type="button"
          className={styles.removeButton}
          onClick={onToggleRemoval}
          disabled={!canEdit}
          aria-pressed={isRemoved}
        >
          {isRemoved ? "Cancelar eliminación" : "Eliminar clave guardada"}
        </button>
      )}
    </div>
  );
}
