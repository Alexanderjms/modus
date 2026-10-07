import { QueryClient } from "@tanstack/react-query";

export function createWorkspaceQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
}

export function workspaceQueryKey(input) {
  const url = new URL(input, "http://workspace.local");
  url.searchParams.sort();
  return ["workspace", url.pathname, url.search];
}

export function invalidateWorkspaceQueries(client, pathname, projectId) {
  return client.invalidateQueries({
    predicate: ({ queryKey }) => queryKey[0] === "workspace" &&
      (!pathname || queryKey[1] === pathname || queryKey[1].startsWith(`${pathname}/`)) &&
      (projectId === undefined || new URLSearchParams(queryKey[2]).get("projectId") === String(projectId)),
    refetchType: "none",
  });
}

function responseFrom(packet) {
  return new Response(packet.body, { status: packet.status, statusText: packet.statusText, headers: packet.headers });
}

async function readPacket(response) {
  return {
    body: await response.text(),
    status: response.status,
    statusText: response.statusText,
    headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
  };
}

class RequestFailure extends Error {
  constructor(packet) {
    super(`HTTP ${packet.status}`);
    this.packet = packet;
  }
}

async function waitForRequest(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) throw signal.reason ?? new DOMException("Solicitud cancelada", "AbortError");
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(signal.reason ?? new DOMException("Solicitud cancelada", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([promise, cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}

async function synchronizeMutation(client, url, options, response) {
  if (!response.ok && response.status !== 409) return;
  const data = response.ok ? await response.clone().json().catch(() => null) : null;
  let body;
  try { body = typeof options.body === "string" ? JSON.parse(options.body) : null; } catch {}
  const projectId = url.searchParams.get("projectId") ?? body?.projectId ?? data?.conversation?.projectId ?? data?.chat?.projectId ?? url.pathname.match(/^\/api\/projects\/(\d+)\//)?.[1];
  const tasks = url.pathname === "/api/tasks" || /\/tags\/|\/suggestions\//.test(url.pathname);
  const context = url.pathname.match(/^\/api\/projects\/(\d+)\/context$/);
  const pathname = tasks ? "/api/tasks" : context ? url.pathname : url.pathname.startsWith("/api/chats") ? "/api/chats" : null;
  if (!pathname) return;
  const scope = tasks && projectId === undefined ? undefined : projectId ?? undefined;
  const filters = {
    predicate: ({ queryKey }) => queryKey[0] === "workspace" &&
      (queryKey[1] === pathname || queryKey[1].startsWith(`${pathname}/`)) &&
      (context || scope === undefined || new URLSearchParams(queryKey[2]).get("projectId") === String(scope)),
  };
  await client.cancelQueries(filters);
  await client.invalidateQueries({ ...filters, refetchType: "none" });
  if (tasks && Array.isArray(data?.tasks)) {
    client.setQueriesData(filters, (packet) => {
      if (!packet) return packet;
      let previous;
      try { previous = JSON.parse(packet.body); } catch { return undefined; }
      if (previous.catalogs && !data.catalogs) return undefined;
      return { ...packet, body: JSON.stringify({ ...previous, tasks: data.tasks, ...(data.catalogs ? { catalogs: data.catalogs } : {}) }) };
    });
  }
  if (context && data) client.setQueryData(workspaceQueryKey(url.pathname), await readPacket(response.clone()));
  if (url.pathname.startsWith("/api/chats")) {
    await invalidateWorkspaceQueries(client, "/api/chats", projectId ?? undefined);
    const chat = data?.chat ?? data?.conversation;
    if (chat?.id && chat.projectId) {
      client.setQueryData(workspaceQueryKey(`/api/chats/${chat.id}?projectId=${chat.projectId}`), {
        body: JSON.stringify({ chat }), status: 200, statusText: "OK", headers: { "Content-Type": "application/json" },
      });
    }
  }
}

export function createWorkspaceRequest(client, transport = fetch) {
  return async (input, options = {}) => {
    const url = new URL(input, "http://workspace.local");
    const method = (options.method || "GET").toUpperCase();
    const cacheable = /^\/api\/(projects(?:\/\d+\/context)?|tasks|providers|chat\/models|chats(?:\/\d+)?)$/.test(url.pathname);
    if (method !== "GET" || !cacheable) {
      const changesCachedData = method !== "GET" && (url.pathname === "/api/tasks" || url.pathname.startsWith("/api/chats") || /^\/api\/projects\/\d+\/(context$|tags\/)/.test(url.pathname));
      let response;
      try { response = await transport(input, options); }
      catch (error) {
        if (changesCachedData) await synchronizeMutation(client, url, options, new Response(null, { status: 409 }));
        throw error;
      }
      if (changesCachedData) {
        await synchronizeMutation(client, url, options, response);
      }
      return response;
    }
    options.signal?.throwIfAborted();
    try {
      const packet = await waitForRequest(client.fetchQuery({
        queryKey: workspaceQueryKey(input),
        queryFn: async ({ signal }) => {
          const response = await transport(input, { ...options, signal });
          const packet = await readPacket(response);
          if (!response.ok) throw new RequestFailure(packet);
          return packet;
        },
      }), options.signal);
      return responseFrom(packet);
    } catch (error) {
      if (error instanceof RequestFailure) return responseFrom(error.packet);
      throw error;
    }
  };
}
