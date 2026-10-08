"use client";

import toolbarStyles from "./toolbar.module.css";
import { SortMenu } from "./sort-menu";
import { Icon } from "../ui-icon";
import { useT } from "../../i18n/provider";

const filters = ["Todos", "Activos", "Completados", "Archivados"] as const;

export function ProjectsToolbar({
  filter,
  setFilter,
  query,
  setQuery,
  sort,
  setSort,
}: {
  filter: number;
  setFilter: (value: number) => void;
  query: string;
  setQuery: (value: string) => void;
  sort: string;
  setSort: (value: string) => void;
}) {
  const t = useT();
  return (
    <div className={toolbarStyles.toolbar}>
      <div
        className={toolbarStyles.filters}
        role="group"
        aria-label={t("Filtrar proyectos")}
      >
        {filters.map((name, index) => (
          <button
            key={name}
            aria-pressed={filter === index}
            onClick={() => setFilter(index)}
          >
            {t(name)}
          </button>
        ))}
      </div>
      <label className={toolbarStyles.search}>
        <Icon name="search" className={toolbarStyles.icon} />
        <input
          type="search"
          aria-label={t("Buscar proyectos")}
          placeholder={t("Buscar proyectos…")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <SortMenu sort={sort} setSort={setSort} />
    </div>
  );
}
