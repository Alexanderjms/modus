"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useId, useState, type ReactNode } from "react";
import { ThemeToggle } from "./brand-header";
import { initialProjects, type Project } from "./projects-data";
import logo from "../public/Logo.png";
import styles from "./home-dashboard.module.css";

export function AppShell({
  children,
  active = "inicio",
  query,
  onSearch,
  headerLeft,
  projects = initialProjects,
  activeProject,
}: {
  children: ReactNode;
  active?: "inicio" | "tareas" | "proyectos";
  query: string;
  onSearch: (value: string) => void;
  headerLeft?: ReactNode;
  projects?: readonly Project[];
  activeProject?: string;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileId = useId();
  const projectsId = useId();
  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) setSidebarOpen(false);
  }, []);
  const placeholder =
    active === "tareas" ? "Buscar en el proyecto…" : "Buscar en Sona…";
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
        data-collapsed={!sidebarOpen}
      >
        <div className="panel-clip">
          <aside
            id="main-sidebar"
            className={styles.sidebar}
            aria-label="Navegación principal"
            data-collapsed={!sidebarOpen}
          >
            <Link
              href="/inicio"
              aria-label="Inicio"
              title="Inicio"
              aria-current={active === "inicio" ? "page" : undefined}
              className={active === "inicio" ? styles.activeNav : undefined}
            >
              <i aria-hidden="true" className="bi bi-house" />
              <span className={styles.navLabel}>Inicio</span>
            </Link>
            <div
              className={`${styles.projectsNav} ${active === "proyectos" || active === "tareas" ? styles.activeNav : ""}`}
            >
              <Link
                href="/proyectos"
                aria-label="Proyectos"
                title="Proyectos"
                aria-current={active === "proyectos" ? "page" : undefined}
              >
                <i aria-hidden="true" className="bi bi-folder" />
                <span className={styles.navLabel}>Proyectos</span>
              </Link>
              <button
                className={styles.projectsToggle}
                aria-label={
                  projectsOpen ? "Colapsar proyectos" : "Expandir proyectos"
                }
                aria-expanded={projectsOpen}
                aria-controls={projectsId}
                onClick={() => setProjectsOpen((open) => !open)}
              >
                <i aria-hidden="true" className="bi bi-chevron-down" />
              </button>
            </div>
            <div
              id={projectsId}
              className={styles.projectTreeSlot}
              data-closed={!sidebarOpen || !projectsOpen}
              aria-hidden={!sidebarOpen || !projectsOpen}
              inert={!sidebarOpen || !projectsOpen}
            >
              <ul
                className={styles.projectTree}
                aria-label="Proyectos disponibles"
              >
                {projects
                  .filter((project) => project.status !== "archived")
                  .map((project) => (
                    <li key={project.id}>
                      <Link
                        href={`/workspace?project=${encodeURIComponent(project.name)}`}
                        title={project.name}
                        aria-current={
                          activeProject === project.name ? "page" : undefined
                        }
                      >
                        <span>{project.name}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
            <div className={styles.spacer} />
            <button
              className={styles.sidebarUser}
              aria-label="Menú de Alexander"
              aria-expanded={profileOpen}
              aria-controls={profileId}
              popoverTarget={profileId}
              title="Menú de Alexander"
            >
              <span className={styles.avatar} aria-label="Alexander">
                AL
              </span>
              <span className={styles.navLabel}>Alexander</span>
            </button>
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
                sidebarOpen ? "Colapsar navegación" : "Expandir navegación"
              }
              title={
                sidebarOpen ? "Colapsar navegación" : "Expandir navegación"
              }
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
                active === "tareas" ? "Buscar en el proyecto" : "Buscar en Sona"
              }
              placeholder={placeholder}
              value={query}
              onChange={(event) => onSearch(event.target.value)}
            />
          </label>
        </header>
        {children}
      </div>
      <div
        id={profileId}
        popover="auto"
        className={styles.profileMenu}
        aria-label="Opciones de Alexander"
        onToggle={(event) => setProfileOpen(event.newState === "open")}
      >
        <p>Alexander</p>
        <button disabled title="Esta función aún no está integrada.">
          <i aria-hidden="true" className="bi bi-person" />
          Perfil
        </button>
        <button disabled title="Esta función aún no está integrada.">
          <i aria-hidden="true" className="bi bi-gear" />
          Configuración
        </button>
      </div>
    </div>
  );
}
