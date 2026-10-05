"use client";

import type { ReactNode } from "react";
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
}: {
  children: ReactNode;
  active?: "inicio" | "tareas" | "proyectos";
  query: string;
  onSearch: (value: string) => void;
  headerLeft?: ReactNode;
}) {
  return (
    <div className={styles.dashboard}>
      <Ambient />
      <Sidebar
        active={active}
      />
      <div className={styles.content}>
        <Header
          active={active}
          query={query}
          onSearch={onSearch}
          headerLeft={headerLeft}
        />
        {children}
      </div>
    </div>
  );
}
