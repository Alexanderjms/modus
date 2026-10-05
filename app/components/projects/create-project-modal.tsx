"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { Project } from "../projects-data";
import iconCatalog from "bootstrap-icons/font/bootstrap-icons.json";
import { Modal } from "../shell/modal";
import styles from "./create-project-modal.module.css";

const icons = [
  ["folder-fill", "Carpeta"],
  ["briefcase-fill", "Trabajo"],
  ["file-earmark-code-fill", "Código"],
  ["palette-fill", "Diseño"],
  ["book-fill", "Lectura"],
  ["lightbulb-fill", "Idea"],
  ["rocket-takeoff-fill", "Lanzamiento"],
  ["clipboard-check-fill", "Tareas"],
  ["calendar-event-fill", "Calendario"],
  ["house-fill", "Hogar"],
  ["heart-fill", "Favorito"],
  ["star-fill", "Destacado"],
] as const;

const fillIcons = Object.keys(iconCatalog).filter((name) => name.endsWith("-fill")).sort();

function iconLabel(name: string) {
  return icons.find(([value]) => value === name)?.[1] ?? name.replace(/-fill$/, "").replace(/-/g, " ");
}

function normalizeIconQuery(value: string) {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-_]+/g, " ").trim();
}

const statusOptions = [
  { value: "", label: "Sin estado" },
  { value: "active", label: "Activo" },
  { value: "completed", label: "Completado" },
  { value: "archived", label: "Archivado" },
] as const;

function placePopover(trigger: HTMLElement, popover: HTMLElement, desiredWidth: number) {
  const anchor = trigger.getBoundingClientRect();
  const width = Math.min(desiredWidth, window.innerWidth - 24);
  popover.style.width = `${width}px`;
  const height = popover.offsetHeight;
  const below = window.innerHeight - anchor.bottom - 8;
  const above = anchor.top - 8;
  const placeBelow = below >= height || (below >= above && below > 0);
  const top = Math.max(
    12,
    Math.min(
      placeBelow ? anchor.bottom + 8 : anchor.top - height - 8,
      window.innerHeight - height - 12,
    ),
  );
  const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
  const originX = Math.max(16, Math.min(width - 16, anchor.left + anchor.width / 2 - left));
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.style.transformOrigin = `${originX}px ${placeBelow ? "top" : "bottom"}`;
}

function ProjectStatusPicker({
  value,
  modalOpen,
  onChange,
}: {
  value: string;
  modalOpen: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const selectedIndex = Math.max(0, statusOptions.findIndex((option) => option.value === value));
  const selected = statusOptions[selectedIndex];

  function openMenu() {
    const menu = popoverRef.current;
    const trigger = triggerRef.current;
    if (!menu || !trigger) return;
    if (!menu.matches(":popover-open")) menu.showPopover();
    setMenuOpen(true);
    placePopover(trigger, menu, Math.max(224, trigger.getBoundingClientRect().width));
    requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus());
  }

  function closeMenu(restoreFocus = false) {
    const menu = popoverRef.current;
    if (menu?.matches(":popover-open")) menu.hidePopover();
    setMenuOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    const menu = popoverRef.current;
    if (!modalOpen) {
      if (menu?.matches(":popover-open")) menu.hidePopover();
      setMenuOpen(false);
      return;
    }
    if (!menuOpen || !menu || !triggerRef.current) return;
    const reposition = () =>
      placePopover(triggerRef.current!, menu, Math.max(224, triggerRef.current!.getBoundingClientRect().width));
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [menuOpen, modalOpen]);

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = optionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? statusOptions.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + statusOptions.length) % statusOptions.length;
    optionRefs.current[next]?.focus();
  }

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>Estado</span>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.statusTrigger} ${menuOpen ? styles.expanded : ""}`}
        aria-label={`Estado: ${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={`${id}-menu`}
        onClick={() => menuOpen ? closeMenu() : openMenu()}
      >
        <span>{selected.label}</span>
        <i aria-hidden="true" className="bi bi-chevron-down" />
      </button>
      <div
        ref={popoverRef}
        id={`${id}-menu`}
        className={styles.statusPopover}
        popover="auto"
        role="menu"
        aria-label="Opciones de estado"
        onKeyDown={moveFocus}
        onToggle={(event) => {
          const isOpen = event.currentTarget.matches(":popover-open");
          setMenuOpen(isOpen);
          if (
            !isOpen &&
            modalOpen &&
            popoverRef.current?.contains(document.activeElement)
          ) {
            triggerRef.current?.focus();
          }
        }}
        onBlurCapture={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && !popoverRef.current?.contains(next)) {
            closeMenu();
          }
        }}
      >
        {statusOptions.map((option, index) => (
          <button
            key={option.value}
            ref={(button) => { optionRefs.current[index] = button; }}
            type="button"
            role="menuitemradio"
            aria-checked={value === option.value}
            tabIndex={index === selectedIndex ? 0 : -1}
            className={styles.statusOption}
            onClick={() => {
              onChange(option.value);
              closeMenu(true);
            }}
          >
            <span>{option.label}</span>
            {value === option.value && (
              <i aria-hidden="true" className="bi bi-check2" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CreateProjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [iconQuery, setIconQuery] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const iconSearchRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const iconSearch = normalizeIconQuery(iconQuery);
  const matchingIcons = iconSearch
    ? fillIcons.filter((name) => normalizeIconQuery(`${name} ${iconLabel(name)}`).includes(iconSearch))
    : icons.map(([name]) => name);
  const visibleIcons = matchingIcons.slice(0, 36);

  function reset() {
    setName("");
    setDescription("");
    setIcon("");
    setIconQuery("");
    setStatus("");
    setError("");
  }

  function close() {
    if (pendingRef.current) return;
    reset();
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setIcon("");
    setIconQuery("");
    setStatus("");
    setError("");
  }, [open]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    if (!name.trim()) {
      setError("Escribe un nombre para el proyecto.");
      nameRef.current?.focus();
      return;
    }
    if (!icon) {
      setError("Selecciona un icono para el proyecto.");
      iconSearchRef.current?.focus();
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: name.trim(),
          icono: icon,
          descripcion: description.trim() || null,
          estado: status || null,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        project?: Project;
        error?: string;
      };
      if (response.status !== 201) throw new Error(result.error || "No se pudo crear el proyecto.");
      if (!result.project) throw new Error("La respuesta no incluye el proyecto creado.");
      pendingRef.current = false;
      setPending(false);
      onCreated(result.project);
      reset();
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "No se pudo crear el proyecto.",
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nuevo proyecto"
      submitLabel={pending ? "Creando…" : "Crear proyecto"}
      onSubmit={submit}
      pending={pending}
      className={styles.dialog}
    >
      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="new-project-name">
            Nombre <span className={styles.requiredMark} aria-hidden="true">*</span>
          </label>
          <input
            ref={nameRef}
            id="new-project-name"
            name="nombre"
            type="text"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            autoFocus
            placeholder="Ej. Lanzamiento de producto"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="new-project-description">Descripción</label>
          <textarea
            id="new-project-description"
            name="descripcion"
            rows={3}
            maxLength={5000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe brevemente el propósito del proyecto"
          />
        </div>

        <fieldset className={`${styles.field} ${styles.iconField}`}>
          <legend>
            Icono <span className={styles.requiredMark} aria-hidden="true">*</span>
          </legend>
          <input
            ref={iconSearchRef}
            type="search"
            aria-label="Buscar iconos"
            placeholder="Buscar iconos, ej. camera o person"
            value={iconQuery}
            onChange={(event) => setIconQuery(event.target.value)}
          />
          <p className={styles.iconHint} role="status">
            {!iconSearch
              ? "12 sugeridos · Busca por nombre para encontrar más."
              : matchingIcons.length === 0
                ? "No hay iconos que coincidan con tu búsqueda."
                : matchingIcons.length > visibleIcons.length
                  ? `${visibleIcons.length} de ${matchingIcons.length} resultados. Afina tu búsqueda para ver otros.`
                  : `${matchingIcons.length} ${matchingIcons.length === 1 ? "resultado" : "resultados"}`}
          </p>
          {icon && !visibleIcons.includes(icon) && (
            <p className={styles.selectedIcon}>
              <i aria-hidden="true" className={`bi bi-${icon}`} />
              Seleccionado: {iconLabel(icon)}
            </p>
          )}
          <div className={styles.icons}>
            {visibleIcons.map((value, index) => (
              <label key={value} className={styles.iconOption} title={iconLabel(value)}>
                <input
                  type="radio"
                  name="icono"
                  value={value}
                  required={!icon && index === 0}
                  checked={icon === value}
                  onChange={() => setIcon(value)}
                  aria-label={iconLabel(value)}
                />
                <i aria-hidden="true" className={`bi bi-${value}`} />
                {icon === value && (
                  <i
                    aria-hidden="true"
                    className={`bi bi-check2 ${styles.selectedMark}`}
                  />
                )}
              </label>
            ))}
          </div>
        </fieldset>

        <ProjectStatusPicker value={status} modalOpen={open} onChange={setStatus} />

        {error && (
          <p
            ref={errorRef}
            id="new-project-error"
            className={styles.error}
            role="alert"
            tabIndex={-1}
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
