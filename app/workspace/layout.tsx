import type { ReactNode } from "react";
import { WorkspaceQueryProvider } from "../components/workspace/workspace-query-provider";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <WorkspaceQueryProvider>{children}</WorkspaceQueryProvider>;
}
