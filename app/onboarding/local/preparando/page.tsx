import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getT } from "../../../i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Preparando almacenamiento | Modus") };
}

export default function LocalPreparingPage() {
  redirect("/onboarding/local");
}
