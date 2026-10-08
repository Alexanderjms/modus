import type { Metadata } from "next";
import { HomeDashboard } from "../components/home-dashboard";
import { getT } from "../i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Inicio | Modus") };
}

export default function InicioPage() {
  return <HomeDashboard />;
}
