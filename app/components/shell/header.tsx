"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import logo from "../../public/Logo.png";
import styles from "./header.module.css";
import { ThemeToggle } from "./theme-toggle";
import { useT } from "../../i18n/provider";

export function Header({
  active,
  query,
  onSearch,
  headerLeft,
  themeToggleClassName = styles.themeToggle,
}: {
  active: "inicio" | "tareas" | "proyectos";
  query: string;
  onSearch: (value: string) => void;
  headerLeft?: ReactNode;
  themeToggleClassName?: string;
}) {
  const t = useT();
  const placeholder =
    active === "tareas" ? t("Buscar en el proyecto…") : t("Buscar en modus…");
  return (
    <header
      className={`${styles.header} ${headerLeft ? styles.headerWithSelector : ""}`}
    >
      {headerLeft && <div className={styles.headerLeft}>{headerLeft}</div>}
      <Link href="/inicio" aria-label={t("Modus — Inicio")} className={styles.brand}>
        <Image
          src={logo}
          alt=""
          width={32}
          height={32}
          priority
          className="size-8 object-contain"
        />
        <span className={styles.brandName}>{t("Modus")}</span>
      </Link>
      <label className={styles.search}>
        <i aria-hidden="true" className="bi bi-search" />
        <input
          type="search"
          aria-label={
            active === "tareas" ? t("Buscar en el proyecto") : t("Buscar en modus")
          }
          placeholder={placeholder}
          value={query}
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>
      <ThemeToggle className={themeToggleClassName} />
    </header>
  );
}
