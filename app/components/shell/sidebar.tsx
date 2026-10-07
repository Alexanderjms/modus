"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import styles from "./sidebar.module.css";
import { ProfileMenu } from "./profile-menu";
import { ProfileModal, ProvidersModal } from "./profile-modals";
import { TavilyModal } from "./tavily-modal";

export function Sidebar({
  active = "inicio",
}: {
  active?: "inicio" | "tareas" | "proyectos";
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showProvidersModal, setShowProvidersModal] = useState(false);
  const [showTavilyModal, setShowTavilyModal] = useState(false);
  const [chatGPTCallbackError, setChatGPTCallbackError] = useState(false);
  const [storageType, setStorageType] = useState<"local" | "cloud">("local");

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("chatgpt")) return;
    setChatGPTCallbackError(url.searchParams.get("chatgpt") === "error");
    setShowProvidersModal(true);
    url.searchParams.delete("chatgpt");
    window.history.replaceState(window.history.state, "", url.toString());
    window.dispatchEvent(new Event("modus:providers-changed"));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/storage", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { mode?: string } | null) => {
        if (result?.mode === "turso") setStorageType("cloud");
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const profileId = useId();

  return (
    <>
      <div
        className={`${styles.navSlot} panel-slot`}
        data-collapsed="true"
      >
        <div className="panel-clip">
          <aside
            id="main-sidebar"
            className={styles.sidebar}
            aria-label="Navegación principal"
            data-collapsed="true"
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
      <ProfileMenu
        id={profileId}
        onToggle={(open) => setProfileOpen(open)}
        onOpenProfile={() => setShowProfileModal(true)}
        onOpenProviders={() => setShowProvidersModal(true)}
        onOpenTavily={() => setShowTavilyModal(true)}
        onLogout={() => {
          void fetch("/api/auth/logout", { method: "POST" })
            .catch(() => {})
            .finally(() => window.location.assign("/"));
        }}
      />
      <ProfileModal
        open={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        storageType={storageType}
      />
      <ProvidersModal
        open={showProvidersModal}
        onClose={() => { setShowProvidersModal(false); setChatGPTCallbackError(false); }}
        callbackError={chatGPTCallbackError}
      />
      <TavilyModal open={showTavilyModal} onClose={() => setShowTavilyModal(false)} />
    </>
  );
}
