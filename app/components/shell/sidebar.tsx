"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { Project } from "../projects-data";
import styles from "./sidebar.module.css";
import { ProfileMenu } from "./profile-menu";

export function Sidebar({
  active = "inicio",
  sidebarOpen,
  projects,
  activeProject,
}: {
  active?: "inicio" | "tareas" | "proyectos";
  sidebarOpen: boolean;
  projects: readonly Project[];
  activeProject?: string;
}) {
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileId = useId();
  const projectsId = useId();
  return (
    <>
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
      <ProfileMenu id={profileId} onToggle={(open) => setProfileOpen(open)} />
    </>
  );
}
