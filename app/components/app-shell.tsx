"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { ThemeToggle } from "./brand-header";
import logo from "../public/Logo.png";
import styles from "./home-dashboard.module.css";

export function AppShell({
  children,
  active = "inicio",
  query,
  onSearch,
  headerLeft,
}: {
  children: ReactNode;
  active?: "inicio" | "tareas";
  query: string;
  onSearch: (value: string) => void;
  headerLeft?: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const placeholder =
    active === "inicio" ? "Buscar en Sona…" : "Buscar en el proyecto…";
  return (
    <div className={styles.dashboard}>
      <div aria-hidden="true" className={styles.ambient}>
        <div />
        <div />
        <div />
        <div />
      </div>
      <div
        className={`${styles.navSlot} panel-slot`}
        data-closed={!sidebarOpen}
      >
        <div className="panel-clip">
          <aside
            id="main-sidebar"
            className={`${styles.sidebar} panel-slide-left`}
            aria-label="Navegación principal"
            data-closed={!sidebarOpen}
            aria-hidden={!sidebarOpen}
            inert={!sidebarOpen}
          >
            <Link
              href="/inicio"
              aria-label="Inicio"
              title="Inicio"
              aria-current={active === "inicio" ? "page" : undefined}
              className={active === "inicio" ? styles.activeNav : undefined}
            >
              <i aria-hidden="true" className="bi bi-house" />
            </Link>
            <button
              aria-label="Proyectos"
              title="Esta función aún no está integrada."
              disabled
            >
              <i aria-hidden="true" className="bi bi-folder" />
            </button>
            <Link
              href="/workspace"
              aria-label="Tareas"
              title="Tareas"
              aria-current={active === "tareas" ? "page" : undefined}
              className={active === "tareas" ? styles.activeNav : undefined}
            >
              <i aria-hidden="true" className="bi bi-list-check" />
            </Link>
            <div className={styles.spacer} />
            <button
              aria-label="Configuración"
              title="Esta función aún no está integrada."
              disabled
            >
              <i aria-hidden="true" className="bi bi-gear" />
            </button>
            <span className={styles.avatar} aria-label="Alexander">
              AL
            </span>
          </aside>
        </div>
      </div>
      <div className={styles.content}>
        <header
          className={`${styles.header} ${headerLeft ? styles.headerWithSelector : ""}`}
        >
          <div className={styles.headerLeft}>
            <button
              className={styles.sidebarToggle}
              aria-label={
                sidebarOpen ? "Ocultar navegación" : "Mostrar navegación"
              }
              title={sidebarOpen ? "Ocultar navegación" : "Mostrar navegación"}
              aria-expanded={sidebarOpen}
              aria-controls="main-sidebar"
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <i aria-hidden="true" className="bi bi-layout-sidebar" />
            </button>
            {headerLeft}
          </div>
          <Link
            href="/inicio"
            aria-label="Modus — Inicio"
            className={styles.brand}
          >
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
          <ThemeToggle className={styles.themeToggle} />
          <label className={styles.search}>
            <i aria-hidden="true" className="bi bi-search" />
            <input
              type="search"
              aria-label={
                active === "inicio" ? "Buscar en Sona" : "Buscar en el proyecto"
              }
              placeholder={placeholder}
              value={query}
              onChange={(event) => onSearch(event.target.value)}
            />
          </label>
        </header>
        {children}
      </div>
    </div>
  );
}
