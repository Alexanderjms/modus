import type { Metadata } from "next";
import { Workspace } from "../components/workspace";
import { getT } from "../i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Workspace | Modus") };
}

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const { project } = await searchParams;
  const initialProject =
    typeof project === "string" && project.trim() ? project : undefined;
  return <Workspace key={initialProject} initialProject={initialProject} />;
}
