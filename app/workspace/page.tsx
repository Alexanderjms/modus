import type { Metadata } from "next";
import { Workspace } from "../components/workspace";

export const metadata: Metadata = { title: "Workspace | Modus" };

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
