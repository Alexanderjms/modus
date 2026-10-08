import { cookies, headers } from "next/headers";
import { DEFAULT_LANG, LANG_COOKIE, isLang, translate, type Lang, type Translate } from "./translate";

export async function getLang(): Promise<Lang> {
  const saved = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(saved)) return saved;
  const preferred = (await headers()).get("accept-language")?.trim().toLowerCase() ?? "";
  return preferred.startsWith("en") ? "en" : DEFAULT_LANG;
}

export async function getT(): Promise<Translate> {
  const lang = await getLang();
  return (key, ...args) => translate(lang, key, ...args);
}
