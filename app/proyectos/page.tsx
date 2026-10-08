import type { Metadata } from "next";
import { ProjectsOverview } from "../components/projects-overview";
import { getT } from "../i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Proyectos | Modus") };
}

export default function ProjectsPage() {
  return <ProjectsOverview />;
}
