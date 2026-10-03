import type { Metadata } from "next";
import { HomeDashboard } from "../components/home-dashboard";

export const metadata: Metadata = { title: "Inicio | Modus" };

export default function InicioPage() {
  return <HomeDashboard />;
}
