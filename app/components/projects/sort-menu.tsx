"use client";

import { useRef } from "react";
import menuStyles from "./menu.module.css";
import toolbarStyles from "./toolbar.module.css";
import { Icon } from "./icon-helper";

const sortOptions = [
  { value: "activity", label: "Última actividad" },
  { value: "name", label: "Nombre" },
  { value: "progress", label: "Progreso" },
];

export function SortMenu({
  sort,
  setSort,
}: {
  sort: string;
  setSort: (value: string) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const selectedSort = sort === "reference" ? "activity" : sort;
  function select(value: string) {
    setSort(value);
    if (menu.current) {
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    }
  }
  return (
    <details
      ref={menu}
      className={`${menuStyles.menu} ${menuStyles.sortMenu}`}
    >
      <summary className={toolbarStyles.sort} aria-label="Ordenar proyectos">
        <Icon name="arrow-down-up" className={menuStyles.icon} />
        <span>Ordenar por:</span>
        <strong>
          {sortOptions.find((option) => option.value === selectedSort)?.label}
        </strong>
        <Icon name="chevron-down" className={menuStyles.icon} />
      </summary>
      <div
        className={menuStyles.menuBody}
        role="group"
        aria-label="Opciones de orden"
      >
        {sortOptions.map((option) => (
          <button
            key={option.value}
            className={menuStyles.sortOption}
            aria-pressed={selectedSort === option.value}
            onClick={() => select(option.value)}
          >
            <span>{option.label}</span>
            {selectedSort === option.value && (
              <Icon name="check" className={menuStyles.icon} />
            )}
          </button>
        ))}
      </div>
    </details>
  );
}
