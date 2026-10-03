"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import logo from "../../public/Logo.png";
import styles from "./header.module.css";
import { ThemeToggle } from "./theme-toggle";

export function Header({
  active,
  query,
  onSearch,
  headerLeft,
  sidebarOpen,
  onToggleSidebar,
  themeToggleClassName = styles.themeToggle,
}: {
  active: "inicio" | "tareas" | "proyectos";
  query: string;
  onSearch: (value: string) => void;
  headerLeft?: ReactNode;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  themeToggleClassName?: string;
}) {
  const placeholder =
    active === "tareas" ? "Buscar en el proyecto…" : "Buscar en modus…";
  return (
    <header
      className={`${styles.header} ${headerLeft ? styles.headerWithSelector : ""}`}
    >
      <div className={styles.headerLeft}>
        <button
          className={styles.sidebarToggle}
          aria-label={
            sidebarOpen ? "Colapsar navegación" : "Expandir navegación"
          }
          title={sidebarOpen ? "Colapsar navegación" : "Expandir navegación"}
          aria-expanded={sidebarOpen}
          aria-controls="main-sidebar"
          onClick={onToggleSidebar}
        >
          <i aria-hidden="true" className="bi bi-layout-sidebar" />
        </button>
        {headerLeft}
      </div>
      <Link href="/inicio" aria-label="Modus — Inicio" className={styles.brand}>
        <Image
          src={logo}
          alt=""
          width={32}
          height={32}
          priority
          className="size-8 object-contain"
        />
        <span className={styles.brandName}>Modus</span>
      </Link>
      <ThemeToggle className={themeToggleClassName} />
      <label className={styles.search}>
        <i aria-hidden="true" className="bi bi-search" />
        <input
          type="search"
          aria-label={
            active === "tareas" ? "Buscar en el proyecto" : "Buscar en modus"
          }
          placeholder={placeholder}
          value={query}
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>
    </header>
  );
}
