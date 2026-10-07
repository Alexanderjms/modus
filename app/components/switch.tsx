"use client";

import styles from "./switch.module.css";

export function Switch({
  checked,
  onChange,
  labelledBy,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelledBy: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      className={styles.switch}
      onClick={() => onChange(!checked)}
    />
  );
}
