import type { Metadata } from "next";
import { ProjectsOverview } from "../components/projects-overview";

export const metadata: Metadata = { title: "Proyectos | Modus" };

export default function ProjectsPage() {
  return <ProjectsOverview />;
}
