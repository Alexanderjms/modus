"use client";

import { useEffect, useState, type ReactNode } from "react";
import { initialProjects, type Project } from "./projects-data";
import logo from "../public/Logo.png";
import styles from "./shell/app-shell.module.css";
import { Ambient } from "./shell/ambient";
import { Sidebar } from "./shell/sidebar";
import { Header } from "./shell/header";

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
  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) setSidebarOpen(false);
  }, []);
  return (
    <div className={styles.dashboard}>
      <Ambient />
      <Sidebar
        active={active}
        sidebarOpen={sidebarOpen}
        projects={projects}
        activeProject={activeProject}
      />
      <div className={styles.content}>
        <Header
          active={active}
          query={query}
          onSearch={onSearch}
          headerLeft={headerLeft}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
        />
        {children}
      </div>
    </div>
  );
}
