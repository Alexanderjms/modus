"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./chat.module.css";
import { useT } from "../../i18n/provider";

const components: Components = {
  a: ({ href, children }) => {
    if (!href) return <>{children}</>;
    const external = /^(?:https?:)?\/\//i.test(href);
    return (
      <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    );
  },
  img: ({ alt }) => (alt ? <span>{alt}</span> : null),
  table: ({ children }) => (
    <div className={styles.markdownTable} role="region" tabIndex={0} aria-label="Tabla de la respuesta">
      <table>{children}</table>
    </div>
  ),
};

export function ChatMarkdown({ content, taskTitles }: { content: string; taskTitles?: Map<number, string> }) {
  const t = useT();
  const text = content.replace(/\[tarea:(\d+)\]/g, (_, id: string) => {
    const title = taskTitles?.get(Number(id));
    return title ? `**${title.replace(/[\\`*_[\]<>]/g, "\\$&")}**` : t("tarea #{0}", id);
  });
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}
