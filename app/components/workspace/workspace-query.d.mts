import type { QueryClient } from "@tanstack/react-query";
export function createWorkspaceQueryClient(): QueryClient;
export function workspaceQueryKey(input: string): [string, string, string];
export function invalidateWorkspaceQueries(client: QueryClient, pathname?: string, projectId?: number | string): Promise<void>;
export function createWorkspaceRequest(client: QueryClient, transport?: typeof fetch): (input: string, options?: RequestInit) => Promise<Response>;
