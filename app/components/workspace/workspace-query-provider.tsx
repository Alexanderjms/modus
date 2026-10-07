"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { createWorkspaceQueryClient, createWorkspaceRequest, invalidateWorkspaceQueries } from "./workspace-query.mjs";

export function WorkspaceQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createWorkspaceQueryClient);
  useEffect(() => {
    const providersChanged = () => {
      void client.cancelQueries({ queryKey: ["workspace", "/api/providers"] });
      void client.cancelQueries({ queryKey: ["workspace", "/api/chat/models"] });
      void invalidateWorkspaceQueries(client, "/api/providers");
      void invalidateWorkspaceQueries(client, "/api/chat/models");
    };
    window.addEventListener("modus:providers-changed", providersChanged);
    return () => {
      window.removeEventListener("modus:providers-changed", providersChanged);
      client.clear();
    };
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function useWorkspaceRequest() {
  const client = useQueryClient();
  return useMemo(() => createWorkspaceRequest(client), [client]);
}
