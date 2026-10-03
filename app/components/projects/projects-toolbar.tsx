"use client";

import toolbarStyles from "./toolbar.module.css";
import { SortMenu } from "./sort-menu";
import { Icon } from "./icon-helper";

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
  return (
    <div className={toolbarStyles.toolbar}>
      <div
        className={toolbarStyles.filters}
        role="group"
        aria-label="Filtrar proyectos"
      >
        {filters.map((name, index) => (
          <button
            key={name}
            aria-pressed={filter === index}
            onClick={() => setFilter(index)}
          >
            {name}
          </button>
        ))}
      </div>
      <label className={toolbarStyles.search}>
        <Icon name="search" className={toolbarStyles.icon} />
        <input
          type="search"
          aria-label="Buscar proyectos"
          placeholder="Buscar proyectos…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <SortMenu sort={sort} setSort={setSort} />
    </div>
  );
}
