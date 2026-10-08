"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import styles from "./task-context-menu.module.css";
import type { TaskPriorityCatalogDto } from "../../api/tasks/route";
import type { BoardTask } from "./workspace-data";
import { fallbackPriorityColor } from "./task-card";
import { useT } from "../../i18n/provider";

const columnOptions: { column: 0 | 1 | 2; label: string }[] = [
  { column: 0, label: "Por hacer" },
  { column: 1, label: "En progreso" },
  { column: 2, label: "Terminado" },
];

type MenuItem = {
  key: string;
  label: string;
  icon: string;
  danger?: boolean;
  color?: string;
  dot?: boolean;
  radio?: boolean;
  checked?: boolean;
  keepOpen?: boolean;
  onSelect: () => void;
};

type MenuBlock =
  | { kind: "item"; item: MenuItem }
  | { kind: "separator" }
  | { kind: "confirm"; key: string; text: string }
  | { kind: "group"; key: string; label: string; items: MenuItem[] };

export function TaskContextMenu({
  task,
  priorities,
  anchor,
  point,
  onClose,
  onOpenDetail,
  onMove,
  onSetPriority,
  onDuplicate,
  onDelete,
}: {
  task: BoardTask;
  priorities: TaskPriorityCatalogDto[];
  anchor: { left: number; top: number; bottom: number };
  point: { x: number; y: number };
  onClose: () => void;
  onOpenDetail: () => void;
  onMove: (column: 0 | 1 | 2) => void;
  onSetPriority: (priorityId: number | null) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const popoverRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [confirming, setConfirming] = useState(false);

  const currentPriorityId = priorities.find((priority) => priority.name === task.priority)?.id ?? null;
  const priorityName = task.priority.trim().toLocaleLowerCase("es");
  const hasPriority = priorityName !== "" && priorityName !== "sin prioridad";

  const blocks: MenuBlock[] = [
    { kind: "item", item: { key: "open", label: t("Abrir detalle"), icon: "bi-eye", onSelect: onOpenDetail } },
    { kind: "item", item: { key: "duplicate", label: t("Duplicar"), icon: "bi-copy", onSelect: onDuplicate } },
    { kind: "separator" },
    {
      kind: "group",
      key: "move",
      label: t("Mover a"),
      items: columnOptions.map((option) => ({
        key: `move-${option.column}`,
        label: t(option.label),
        icon: "bi-arrow-right",
        radio: true,
        checked: task.column === option.column,
        onSelect: () => onMove(option.column),
      })),
    },
    ...(priorities.length > 0
      ? ([
          { kind: "separator" },
          {
            kind: "group",
            key: "priority",
            label: t("Prioridad"),
            items: priorities.map((priority) => ({
              key: `priority-${priority.id}`,
              label: t(priority.name),
              icon: "bi-circle-fill",
              color: priority.color ?? fallbackPriorityColor(priority.name.trim().toLocaleLowerCase("es")) ?? "var(--muted)",
              dot: true,
              radio: true,
              checked: hasPriority && currentPriorityId === priority.id,
              onSelect: () => onSetPriority(priority.id),
            })),
          },
        ] satisfies MenuBlock[])
      : []),
    { kind: "separator" },
    confirming
      ? { kind: "confirm", key: "confirm", text: t("¿Eliminar «{0}»?", task.title) }
      : { kind: "item", item: { key: "delete", label: t("Eliminar"), icon: "bi-trash", danger: true, keepOpen: true, onSelect: () => setConfirming(true) } },
  ];

  useLayoutEffect(() => {
    const menu = popoverRef.current;
    if (!menu) return;
    const margin = 8;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const preferredX = point.x > 0 || point.y > 0 ? point.x : anchor.left;
    const preferredY = point.x > 0 || point.y > 0 ? point.y : anchor.bottom;
    const left = Math.max(margin, Math.min(preferredX, window.innerWidth - width - margin));
    const top = Math.max(margin, Math.min(preferredY, window.innerHeight - height - margin));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.transformOrigin = `${Math.max(10, preferredX - left)}px ${Math.max(6, preferredY - top)}px`;
    if (!menu.matches(":popover-open")) menu.showPopover();
    itemRefs.current[0]?.focus();
  }, [anchor.bottom, anchor.left, point.x, point.y, confirming]);

  useEffect(() => {
    const menu = popoverRef.current;
    return () => {
      if (menu?.matches(":popover-open")) menu.hidePopover();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && confirming) {
      event.preventDefault();
      event.stopPropagation();
      setConfirming(false);
      return;
    }
    moveFocus(event);
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  const run = (item: MenuItem) => () => {
    item.onSelect();
    if (!item.keepOpen) onClose();
  };

  let itemIndex = 0;
  itemRefs.current.length = 0;
  const renderItem = (item: MenuItem) => {
    const index = itemIndex++;
    return (
      <button
        key={item.key}
        ref={(button) => { itemRefs.current[index] = button; }}
        type="button"
        role={item.radio ? "menuitemradio" : "menuitem"}
        aria-checked={item.radio ? item.checked : undefined}
        className={`${styles.item} ${item.danger ? styles.danger : ""}`}
        onClick={run(item)}
      >
        <i
          aria-hidden="true"
          className={`bi ${item.icon} ${item.dot ? styles.priorityDot : ""}`}
          style={item.color ? { color: item.color } : undefined}
        />
        <span>{item.label}</span>
        {item.checked && <i aria-hidden="true" className={`bi bi-check2 ${styles.check}`} />}
      </button>
    );
  };

  return (
    <div
      ref={popoverRef}
      className={styles.menu}
      popover="auto"
      role="menu"
      aria-label={t("Acciones para {0}", task.title)}
      onKeyDown={handleKeyDown}
      onToggle={(event) => {
        if (!event.currentTarget.matches(":popover-open")) onClose();
      }}
    >
      {blocks.map((block, blockIndex) => {
        if (block.kind === "separator") {
          return <div key={`sep-${blockIndex}`} className={styles.separator} role="presentation" />;
        }
        if (block.kind === "item") {
          return renderItem(block.item);
        }
        if (block.kind === "confirm") {
          return (
            <div key={block.key} className={styles.confirm} role="group" aria-label={block.text}>
              <p>{block.text}</p>
              <div className={styles.confirmActions}>
                <button
                  ref={(button) => { itemRefs.current[itemIndex++] = button; }}
                  type="button"
                  role="menuitem"
                  className={styles.confirmCancel}
                  onClick={() => setConfirming(false)}
                >
                  {t("Cancelar")}
                </button>
                <button
                  ref={(button) => { itemRefs.current[itemIndex++] = button; }}
                  type="button"
                  role="menuitem"
                  className={styles.confirmDelete}
                  onClick={() => { onDelete(); onClose(); }}
                >
                  {t("Eliminar")}
                </button>
              </div>
            </div>
          );
        }
        const labelId = `task-menu-${block.key}`;
        return (
          <div key={block.key} role="group" aria-labelledby={labelId}>
            <p id={labelId} className={styles.groupLabel} role="presentation">{block.label}</p>
            {block.items.map(renderItem)}
          </div>
        );
      })}
    </div>
  );
}
