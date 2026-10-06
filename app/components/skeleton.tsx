import type { CSSProperties } from "react";
import styles from "./skeleton.module.css";

export function Skeleton({
  variant = "rounded",
  width,
  height,
  className,
}: {
  variant?: "text" | "rounded" | "circular";
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.root} ${styles[variant]}${className ? ` ${className}` : ""}`}
      style={{ width, height } as CSSProperties}
    />
  );
}
