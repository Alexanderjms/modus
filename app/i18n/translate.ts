import { en } from "./en";

export type Lang = "es" | "en";
export const LANG_COOKIE = "modus-lang";
export const DEFAULT_LANG: Lang = "es";

export const isLang = (value: unknown): value is Lang => value === "es" || value === "en";

export function translate(lang: Lang, key: string, ...args: (string | number)[]): string {
  let text = lang === "en" ? en[key] ?? key : key;
  args.forEach((value, index) => {
    text = text.split(`{${index}}`).join(String(value));
  });
  return text;
}

export type Translate = (key: string, ...args: (string | number)[]) => string;
