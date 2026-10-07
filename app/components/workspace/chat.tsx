"use client";

import { useCallback, useEffect, useId, useRef, useState, type DragEvent, type RefObject } from "react";
import type {
  ChatConversation,
  ChatMessage,
  ChatModel,
  ChatProtocol,
  ChatProviderId,
  ChatRequest,
  ChatResponse,
  ChatSummary,
  SaveChatRequest,
  TaskSuggestion,
} from "../../chat-contract";
import type { Project } from "../projects-data";
import { Switch } from "../switch";
import { useChatAttachments } from "./use-chat-attachments";
import { maxAttachments } from "../../chat-attachments.mjs";
import styles from "./chat.module.css";
import shared from "../workspace.module.css";
import { ChatComposer } from "./chat-composer";
import { flyTaskToBoard, pointAtTask } from "./task-flight";
import { optimisticNewTask, optimisticPatch, type TaskChange } from "./optimistic-suggestion";
import { ChatPicker, type ChatPickerOption } from "./chat-picker";
import { ChatActionDialog, type ChatAction } from "./chat-action-dialog";
import { ChatErrors, ChatNotices } from "./chat-notices";
import { ChatSettings } from "./chat-settings";
import { ChatTranscript } from "./chat-transcript";
import { createChat, errorForStatus, readChat, validConversation, validMessages, validSummary } from "./chat-api.mjs";
import { maxMessages, maxTotalCharacters, protocols, providers, regions } from "./chat-data.mjs";
import type { TaskCatalogsDto, TaskDto } from "../../api/tasks/route";
import type { SuggestionTargetTask, TaskSuggestionDraft, TaskSuggestionView } from "./task-suggestion-card";
import { useWorkspaceRequest } from "./workspace-query-provider";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateWorkspaceQueries } from "./workspace-query.mjs";

function toTargetTask(task: Record<string, unknown>): SuggestionTargetTask {
  const list = (value: unknown) => (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  const date = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    title: String(task.title),
    description: typeof task.description === "string" ? task.description : "",
    priority: typeof task.priority === "string" ? task.priority.toLowerCase() : "sin prioridad",
    startDate: date(task.startDate),
    endDate: date(task.endDate),
    column: typeof task.column === "number" ? task.column : 0,
    tags: list(task.tags).flatMap((tag) => typeof tag.name === "string"
      ? [{ name: tag.name, color: typeof tag.color === "string" ? tag.color : undefined }] : []),
    subtasks: list(task.subtasks).flatMap((item) => typeof item.title === "string"
      ? [{ title: item.title, completed: item.completed === true }] : []),
  };
}

const AUTO_APPLY_KEY = "modus-chat-auto-apply";
const CONTEXT_BUDGET_BYTES = 100 * 1024;

function fitContextWindow<T extends { role: string; content: string }>(all: T[]): T[] {
  let start = all.length - 1;
  while (start - 2 >= 0) {
    const candidate = all.slice(start - 2);
    const characters = candidate.reduce((total, item) => total + item.content.length, 0);
    if (
      candidate.length > maxMessages - 1 ||
      characters > maxTotalCharacters ||
      new TextEncoder().encode(JSON.stringify(candidate)).byteLength > CONTEXT_BUDGET_BYTES
    ) break;
    start -= 2;
  }
  return all.slice(start);
}

type UndoSnapshot = {
  taskId: number;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  attachments: string | null;
  priorityId: number | null;
  column: number;
  tagIds: number[];
  subtasks: { id: number; title: string; completed: boolean }[];
};

function draftForSuggestion(item: TaskSuggestionView): TaskSuggestionDraft {
  const kind = item.kind ?? "create";
  if (kind === "add-tags") return { tags: item.tags ?? [] };
  if (kind === "add-subtasks") return { subtasks: item.subtasks };
  if (kind === "edit") return { changes: item.changes ?? {} };
  return { title: item.title, description: item.description, priority: item.priority, subtasks: item.subtasks, ...(item.tags?.length ? { tags: item.tags } : {}) };
}

function isAutoApplicable(item: TaskSuggestionView) {
  if (item.status !== "pending" || !item.targetTaskId) return false;
  if (item.kind === "add-tags" || item.kind === "add-subtasks") return true;
  if (item.kind !== "edit" || !item.changes) return false;
  return !item.changes.removeTags && !item.changes.removeSubtasks && !item.changes.renameSubtasks;
}

async function loadUndoSnapshot(projectId: number, taskId: number, request: (input: string, init?: RequestInit) => Promise<Response>): Promise<UndoSnapshot | null> {
  try {
    const response = await request(`/api/tasks?projectId=${projectId}&catalogs=1`, { cache: "no-store" });
    const data = (await response.json()) as { tasks?: TaskDto[]; catalogs?: TaskCatalogsDto };
    const task = data.tasks?.find((item) => item.id === taskId);
    if (!response.ok || !task) return null;
    const priority = data.catalogs?.priorities.find((item) => item.name.toLowerCase() === task.priority.toLowerCase());
    return {
      taskId,
      title: task.title,
      description: task.description,
      startDate: task.startDate,
      endDate: task.endDate,
      attachments: task.attachments,
      priorityId: priority?.id ?? null,
      column: task.column,
      tagIds: task.tags.map((tag) => tag.id),
      subtasks: task.subtasks.map(({ id, title, completed }) => ({ id, title, completed })),
    };
  } catch {
    return null;
  }
}

type SuggestionTaskData = {
  projectId: number;
  tasks: Map<number, string>;
  details: Map<number, SuggestionTargetTask>;
  catalogs: TaskCatalogsDto | null;
  tags: { name: string; color: string | null }[];
};

export function WorkspaceChat({
  project,
  onClose,
  closeButtonRef,
  onTaskCreated,
}: {
  project: Project | null;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onTaskCreated: (projectId: number, change?: TaskChange) => void;
}) {
  const requestFn = useWorkspaceRequest();
  const queryClient = useQueryClient();
  const [configured, setConfigured] = useState<ChatProviderId[]>([]);
  const chatGPTConfigured = configured.includes("chatgpt");
  const [provider, setProvider] = useState<ChatProviderId | "">("");
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState("");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [providersReload, setProvidersReload] = useState(0);
  const [providerRevision, setProviderRevision] = useState(0);
  const [region, setRegion] = useState(regions[1]);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [model, setModel] = useState("");
  const [protocol, setProtocol] = useState<ChatProtocol | "">("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [modelsWarning, setModelsWarning] = useState("");
  const [modelsReload, setModelsReload] = useState(0);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<ChatConversation | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [conversationLoading, setConversationLoading] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [searching, setSearching] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingSuggestions, setStreamingSuggestions] = useState<TaskSuggestion[]>([]);
  const clearStreaming = () => {
    setStreamingText("");
    setStreamingSuggestions([]);
  };
  const [saving, setSaving] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<ChatMessage | null>(null);
  const [sendError, setSendError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveConflict, setSaveConflict] = useState(false);
  const [limitError, setLimitError] = useState("");
  const [chatAction, setChatAction] = useState<ChatAction | null>(null);
  const [actionChatId, setActionChatId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [chatActionError, setChatActionError] = useState("");
  const [chatActionPending, setChatActionPending] = useState(false);
  const [pendingSuggestionId, setPendingSuggestionId] = useState<string | null>(null);
  const [bulkAccepting, setBulkAccepting] = useState(false);
  const [suggestionTaskData, setSuggestionTaskData] = useState<SuggestionTaskData | null>(null);
  const attachments = useChatAttachments(project?.id);
  const [autoApply, setAutoApply] = useState(false);
  const [autoNotice, setAutoNotice] = useState<{ text: string; snapshot: UndoSnapshot | null; busy?: boolean } | null>(null);
  const liveSuggestionIds = useRef<Set<string>>(new Set());
  const [taskRefs, setTaskRefs] = useState<{ id: number; title: string }[]>([]);
  const [taskDragOver, setTaskDragOver] = useState(false);
  const taskDragDepth = useRef(0);
  const draftRef = useRef("");
  const drafts = useRef(new Map<string, string>());
  const newDraftKey = useRef("new");
  const settingsRef = useRef({
    provider: "" as ChatProviderId | "",
    model: "",
    protocol: "" as ChatProtocol | "",
    region: regions[1],
  });
  const sendingRef = useRef(false);
  const pendingSave = useRef<{ chatId: number; request: SaveChatRequest } | null>(null);
  const providerRequest = useRef<AbortController | null>(null);
  const historyRequest = useRef<AbortController | null>(null);
  const conversationRequest = useRef<AbortController | null>(null);
  const retryChatId = useRef<string | null>(null);
  const sendRequest = useRef<AbortController | null>(null);
  const mutationRequest = useRef<AbortController | null>(null);
  const suggestionRequest = useRef<AbortController | null>(null);
  const pendingSuggestionRef = useRef<string | null>(null);
  const projectGeneration = useRef(0);
  const activeChatRef = useRef(activeChat);
  activeChatRef.current = activeChat;
  const actionDialog = useRef<HTMLDialogElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const actionTitleId = useId();
  const messagesRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottom = useRef(true);
  const reloadProviders = useCallback(() => {
    void invalidateWorkspaceQueries(queryClient, "/api/providers");
    setProvidersReload((value) => value + 1);
  }, [queryClient]);
  const silentProvidersReload = useRef(false);
  const lastModelsKey = useRef("");
  const modelsCount = useRef(0);
  modelsCount.current = models.length;

  useEffect(() => {
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ provider?: string; disconnected?: boolean }>).detail;
      if (detail?.provider === "chatgpt" && detail.disconnected && settingsRef.current.provider === "chatgpt") {
        sendRequest.current?.abort();
        setConfigured((current) => current.filter((item) => item !== "chatgpt"));
        setModels([]);
        setSendError("ChatGPT se desconectó. Reconecta la cuenta o elige otro proveedor.");
      }
      void invalidateWorkspaceQueries(queryClient, "/api/chat/models");
      reloadProviders();
      setProviderRevision((revision) => revision + 1);
    };
    window.addEventListener("modus:providers-changed", onChanged);
    return () => {
      window.removeEventListener("modus:providers-changed", onChanged);
    };
  }, [reloadProviders, queryClient]);

  useEffect(() => {
    const controller = new AbortController();
    providerRequest.current?.abort();
    providerRequest.current = controller;
    const silent = silentProvidersReload.current;
    silentProvidersReload.current = false;
    if (!silent) {
      setProvidersLoading(true);
      setProvidersError("");
    }
    void (async () => {
      try {
        const response = await requestFn("/api/providers", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(errorForStatus(response.status));
        const data: unknown = await response.json();
        if (
          typeof data !== "object" ||
          data === null ||
          !("providers" in data) ||
          !Array.isArray(data.providers)
        ) {
          throw new Error("No se pudieron cargar los proveedores.");
        }
        const items: unknown[] = data.providers;
        if (controller.signal.aborted) return;
        setStorageAvailable("storage" in data && typeof data.storage === "object" && data.storage !== null &&
          "available" in data.storage && data.storage.available === true);
        const available = providers.flatMap(({ id }) => items.some((item) =>
          typeof item === "object" && item !== null && "id" in item && item.id === id &&
          "configured" in item && item.configured === true) ? [id] : []);
        setConfigured(available);
        if (settingsRef.current.provider === "chatgpt" && !available.includes("chatgpt") && sendingRef.current) {
          sendRequest.current?.abort();
          setSendError("La conexión de ChatGPT ya no está disponible. Reconecta la cuenta para continuar.");
        }
        setProvider((current) => {
          if (current) return current;
          const fallback = available.includes("opencode") ? "opencode" : available[0] ?? "";
          if (fallback) settingsRef.current.provider = fallback;
          return fallback;
        });
      } catch {
        if (!controller.signal.aborted && !silent) setProvidersError("No se pudieron cargar los proveedores.");
      } finally {
        if (!controller.signal.aborted) setProvidersLoading(false);
      }
    })();
    return () => controller.abort();
  }, [providersReload, requestFn]);

  useEffect(() => {
    projectGeneration.current += 1;
    conversationRequest.current?.abort();
    setConversationLoading(false);
    sendRequest.current?.abort();
    sendRequest.current = null;
    sendingRef.current = false;
    setSending(false);
    setSearching(false);
    clearStreaming();
    setPendingMessage(null);
    setSaving(false);
    mutationRequest.current?.abort();
    mutationRequest.current = null;
    suggestionRequest.current?.abort();
    suggestionRequest.current = null;
    pendingSuggestionRef.current = null;
    setPendingSuggestionId(null);
    setChatActionPending(false);
    setChatAction(null);
    setActionChatId(null);
    setChatActionError("");
    const controller = new AbortController();
    historyRequest.current?.abort();
    historyRequest.current = controller;
    setChats([]);
    setActiveChat(null);
    setHistory([]);
    setHistoryLoading(true);
    setHistoryError("");
    retryChatId.current = null;
    setSaveError("");
    pendingSave.current = null;
    if (!project) {
      setHistoryLoading(false);
      return () => controller.abort();
    }
    void (async () => {
      try {
        const query = new URLSearchParams({ projectId: String(project.id) });
        const response = await requestFn(`/api/chats?${query}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(errorForStatus(response.status));
        const data: unknown = await response.json();
        if (typeof data !== "object" || data === null || !("chats" in data) || !Array.isArray(data.chats) ||
          !data.chats.every(validSummary)) throw new Error("No se pudo cargar el historial del chat.");
        const loaded = data.chats;
        if (controller.signal.aborted) return;
        setChats(loaded);
        if (loaded[0]) {
          const chat = await fetchConversation(loaded[0].id, project.id, controller.signal);
          if (!controller.signal.aborted) activateConversation(chat);
        } else {
          setActiveChat(null);
          setHistory([]);
          restoreSettings(null);
        }
      } catch {
        if (!controller.signal.aborted) setHistoryError("No se pudo cargar el historial.");
      } finally {
        if (!controller.signal.aborted) setHistoryLoading(false);
      }
    })();
    return () => {
      controller.abort();
      mutationRequest.current?.abort();
      suggestionRequest.current?.abort();
    };
  }, [project?.id, requestFn]);

  async function fetchConversation(chatId: number, projectId: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ projectId: String(projectId) });
    const chat = await readChat(await requestFn(`/api/chats/${chatId}?${query}`, { cache: "no-store", signal }));
    if (chat.projectId !== projectId || chat.id !== chatId) {
      throw new Error("El chat no pertenece a este proyecto.");
    }
    return chat;
  }

  function restoreSettings(chat: ChatConversation | null) {
    const next: typeof settingsRef.current = chat?.provider ? {
      provider: chat.provider ?? "",
      model: chat.model ?? "",
      protocol: chat.protocol ?? "",
      region: chat.region ?? regions[1],
    } : settingsRef.current;
    settingsRef.current = next;
    setProvider(next.provider);
    setModel(next.model);
    setProtocol(next.protocol);
    setRegion(next.region);
  }

  function activateConversation(chat: ChatConversation) {
    drafts.current.set(activeChat ? String(activeChat.id) : newDraftKey.current, draftRef.current);
    setActiveChat(chat);
    setHistory(chat.messages);
    draftRef.current = drafts.current.get(String(chat.id)) ?? "";
    setDraft(draftRef.current);
    restoreSettings(chat);
    setSendError("");
    setSaveError("");
    setSaveConflict(false);
    setLimitError("");
  }

  useEffect(() => {
    const key = `${provider}|${provider === "bedrock" ? region : ""}`;
    const silent = lastModelsKey.current === key && modelsCount.current > 0;
    lastModelsKey.current = key;
    if (!silent) {
      setModels([]);
      setModelsError("");
      setModelsWarning("");
    }
    if (!provider || (provider === "chatgpt" && !chatGPTConfigured)) {
      setModelsLoading(false);
      setModel("");
      return;
    }
    const controller = new AbortController();
    if (!silent) setModelsLoading(true);
    const query = new URLSearchParams({ provider });
    if (provider === "bedrock") query.set("region", region);
    void (async () => {
      try {
        const response = await requestFn(`/api/chat/models?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          let message = errorForStatus(response.status);
          const failure: unknown = await response.json().catch(() => null);
          if (typeof failure === "object" && failure !== null && "error" in failure && typeof failure.error === "string") message = failure.error.slice(0, 600);
          if (provider === "chatgpt" && (response.status === 401 || response.status === 403 || response.status === 409)) reloadProviders();
          throw new Error(message);
        }
        const data: unknown = await response.json();
        if (typeof data !== "object" || data === null || !("models" in data) || !Array.isArray(data.models)) {
          throw new Error("No se pudieron cargar los modelos.");
        }
        const result = data as { models: unknown[]; warning?: unknown };
        const available = result.models.filter((item): item is ChatModel =>
          typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" &&
          "name" in item && typeof item.name === "string" && "protocol" in item &&
          (item.protocol === null || protocols.some(({ id }) => id === item.protocol)) &&
          (!("source" in item) || item.source === "go" || item.source === "zen") &&
          (!("badge" in item) || item.badge === "FREE"),
        );
        if (controller.signal.aborted) return;
        setModels(available);
        setModelsWarning(typeof result.warning === "string" ? result.warning : "");
        const saved = settingsRef.current.provider === provider ? settingsRef.current.model : "";
        const chosen =
          saved || available.find((item) => item.protocol !== null)?.id || available[0]?.id || "";
        setModel(chosen);
        settingsRef.current.model = chosen;
      } catch (reason) {
        if (!controller.signal.aborted && !silent) setModelsError(reason instanceof Error ? reason.message : "No se pudieron cargar los modelos.");
      } finally {
        if (!controller.signal.aborted) setModelsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [provider, region, modelsReload, providerRevision, chatGPTConfigured, reloadProviders, requestFn]);

  useEffect(() => () => {
    providerRequest.current?.abort();
    historyRequest.current?.abort();
    conversationRequest.current?.abort();
    sendRequest.current?.abort();
    mutationRequest.current?.abort();
    suggestionRequest.current?.abort();
  }, []);

  useEffect(() => {
    const dialog = actionDialog.current;
    if (!dialog) return;
    if (chatAction && !dialog.open) {
      dialog.showModal();
      if (chatAction === "rename") requestAnimationFrame(() => {
        if (actionDialog.current?.open) renameInput.current?.focus();
      });
    } else if (!chatAction && dialog.open) {
      dialog.close();
    }
  }, [chatAction]);

  useEffect(() => {
    if (shouldStickToBottom.current && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [history, sending, sendError]);

  const hasTagSuggestions = history.some((message) => message.role === "assistant" &&
    (!!message.suggestions?.length || message.content.includes("[tarea:")));

  useEffect(() => queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "invalidate") return;
    const [scope, pathname, search] = event.query.queryKey;
    if (scope === "workspace" && pathname === "/api/tasks" && typeof search === "string" &&
      new URLSearchParams(search).get("projectId") === String(project?.id)) {
      setSuggestionTaskData(null);
    }
  }), [queryClient, project?.id]);

  useEffect(() => {
    const projectId = project?.id;
    if (!projectId || !hasTagSuggestions || suggestionTaskData?.projectId === projectId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const query = new URLSearchParams({ projectId: String(projectId), catalogs: "1" });
        const response = await requestFn(`/api/tasks?${query}`, { cache: "no-store", signal: controller.signal });
        const data: unknown = await response.json();
        if (!response.ok || typeof data !== "object" || data === null || !("tasks" in data) || !Array.isArray(data.tasks) ||
          !("catalogs" in data) || typeof data.catalogs !== "object" || data.catalogs === null ||
          !("tags" in data.catalogs) || !Array.isArray(data.catalogs.tags)) throw new Error();
        if (controller.signal.aborted) return;
        const tasks = new Map<number, string>();
        const details = new Map<number, SuggestionTargetTask>();
        for (const task of data.tasks) {
          if (typeof task === "object" && task !== null && "id" in task && Number.isSafeInteger(task.id) &&
            (task.id as number) > 0 && "title" in task && typeof task.title === "string") {
            tasks.set(task.id as number, task.title);
            details.set(task.id as number, toTargetTask(task as Record<string, unknown>));
          }
        }
        const tags = data.catalogs.tags.flatMap((tag) =>
          typeof tag === "object" && tag !== null && "name" in tag && typeof tag.name === "string" &&
          "color" in tag && (tag.color === null || typeof tag.color === "string")
            ? [{ name: tag.name, color: typeof tag.color === "string" && /^#[0-9a-f]{6}$/i.test(tag.color) ? tag.color : null }]
            : []);
        setSuggestionTaskData({ projectId, tasks, details, tags, catalogs: data.catalogs as unknown as TaskCatalogsDto });
      } catch {
        if (!controller.signal.aborted) setSuggestionTaskData({ projectId, tasks: new Map(), details: new Map(), tags: [], catalogs: null });
      }
    })();
    return () => controller.abort();
  }, [project?.id, hasTagSuggestions, suggestionTaskData, requestFn]);

  const selectedModel = models.find((item) => item.id === model);
  const needsProtocol = selectedModel?.protocol === null;
  const ready = storageAvailable && !providersLoading && !providersError && !modelsLoading && !modelsError &&
    !!project && !!provider && configured.includes(provider) && !!selectedModel &&
    (!needsProtocol || !!protocol) && (provider !== "bedrock" || !!region) && !historyLoading &&
    !conversationLoading && !saving && !pendingSave.current && !chatActionPending && !mutationRequest.current &&
    !suggestionRequest.current;
  const transcript = sending && pendingMessage ? [...history, pendingMessage] : history;
  const canSwitch = !sending && !saving && !attachments.items.length && !pendingSave.current && !conversationLoading &&
    !chatActionPending && !mutationRequest.current && !suggestionRequest.current;
  const canMutateChats = !!project && canSwitch && !historyLoading;
  const suggestionsDisabled = !project || sending || saving || !!pendingSave.current || saveConflict ||
    historyLoading || conversationLoading || chatActionPending || !!suggestionRequest.current || bulkAccepting;

  async function retryHistory() {
    if (!project) return;
    if (attachments.items.length) {
      setHistoryError("Quita los adjuntos del borrador antes de recargar el historial.");
      return;
    }
    if (retryChatId.current) {
      await invalidateWorkspaceQueries(queryClient, `/api/chats/${retryChatId.current}`, project.id);
      await selectChat(retryChatId.current);
      return;
    }
    if (!activeChat && draftRef.current.trim()) {
      setHistoryError("Envía el borrador actual antes de recargar el historial.");
      return;
    }
    const controller = new AbortController();
    historyRequest.current?.abort();
    historyRequest.current = controller;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const query = new URLSearchParams({ projectId: String(project.id) });
      await invalidateWorkspaceQueries(queryClient, "/api/chats", project.id);
      const response = await requestFn(`/api/chats?${query}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error();
      const data: unknown = await response.json();
      if (typeof data !== "object" || data === null || !("chats" in data) || !Array.isArray(data.chats) ||
        !data.chats.every(validSummary)) throw new Error();
      if (controller.signal.aborted) return;
      setChats(data.chats);
      if (data.chats[0]) {
        const chat = await fetchConversation(data.chats[0].id, project.id, controller.signal);
        if (!controller.signal.aborted) activateConversation(chat);
      }
      else { setActiveChat(null); setHistory([]); }
    } catch {
      if (!controller.signal.aborted) setHistoryError("No se pudo cargar el historial.");
    } finally {
      if (!controller.signal.aborted) setHistoryLoading(false);
    }
  }

  async function selectChat(id: string) {
    if (!project || !canSwitch || mutationRequest.current) return;
    retryChatId.current = id;
    const controller = new AbortController();
    conversationRequest.current?.abort();
    conversationRequest.current = controller;
    setConversationLoading(true);
    setHistoryError("");
    try {
      const chat = await fetchConversation(Number(id), project.id, controller.signal);
      if (!controller.signal.aborted) {
        activateConversation(chat);
        retryChatId.current = null;
      }
    } catch {
      if (!controller.signal.aborted) setHistoryError("No se pudo abrir ese chat. Inténtalo de nuevo.");
    } finally {
      if (!controller.signal.aborted) setConversationLoading(false);
    }
  }

  async function startNewChat() {
    if (!project || !canSwitch || mutationRequest.current) return;
    if (!activeChat && draftRef.current.trim()) {
      setHistoryError("Envía el borrador actual antes de crear otro chat.");
      return;
    }
    setHistoryError("");
    setConversationLoading(true);
    try {
      const chat = await createChat(project.id, undefined, requestFn);
      drafts.current.set(activeChat ? String(activeChat.id) : newDraftKey.current, draftRef.current);
      drafts.current.set(String(chat.id), "");
      setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      setActiveChat(chat);
      setHistory([]);
      draftRef.current = "";
      setDraft("");
      setSendError("");
      setSaveError("");
      setSaveConflict(false);
      setLimitError("");
    } catch {
      setHistoryError("No se pudo crear un chat nuevo. Inténtalo de nuevo.");
    } finally {
      setConversationLoading(false);
    }
  }

  function openChatAction(option: ChatPickerOption, action: ChatAction) {
    if (!canMutateChats) return;
    setActionChatId(Number(option.value));
    setRenameValue(option.label);
    setChatActionError("");
    setChatAction(action);
  }

  async function reloadChatsAfterConflict(
    projectId: number,
    generation: number,
    signal: AbortSignal,
    chatId: number,
  ) {
    try {
      const query = new URLSearchParams({ projectId: String(projectId) });
      await invalidateWorkspaceQueries(queryClient, "/api/chats", projectId);
      const response = await requestFn(`/api/chats?${query}`, { cache: "no-store", signal });
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (signal.aborted || projectGeneration.current !== generation ||
        typeof data !== "object" || data === null || !("chats" in data) || !Array.isArray(data.chats) ||
        !data.chats.every(validSummary)) return;
      setChats(data.chats);
      const latest = data.chats.find((chat) => chat.id === chatId);
      if (latest && activeChat?.id === chatId) {
        await invalidateWorkspaceQueries(queryClient, `/api/chats/${chatId}`, projectId);
        const current = await fetchConversation(chatId, projectId, signal);
        if (!signal.aborted && projectGeneration.current === generation) activateConversation(current);
      }
    } catch {
    }
  }

  async function submitChatAction() {
    if (!project || !actionChatId || !chatAction || !canMutateChats || mutationRequest.current) return;
    const title = renameValue.trim();
    if (chatAction === "rename" && (!title || title.length > 80 || /[\x00-\x1F\x7F]/.test(title))) {
      setChatActionError("Usa un nombre de 1 a 80 caracteres sin caracteres de control.");
      return;
    }
    const summary = chats.find((chat) => chat.id === actionChatId);
    if (!summary) {
      setChatActionError("No se encontró este chat. Actualiza el historial e inténtalo de nuevo.");
      return;
    }
    const projectId = project.id;
    const generation = projectGeneration.current;
    const controller = new AbortController();
    mutationRequest.current = controller;
    setChatActionPending(true);
    setChatActionError("");
    const current = () => !controller.signal.aborted && projectGeneration.current === generation;
    try {
      const query = new URLSearchParams({ projectId: String(projectId) });
      const url = `/api/chats/${actionChatId}?${query}`;
      if (chatAction === "rename") {
        const response = await requestFn(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, revision: summary.revision }),
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 409) {
            await reloadChatsAfterConflict(projectId, generation, controller.signal, actionChatId);
            if (current()) setChatActionError("El chat cambió en otra sesión. Se actualizó el historial; revisa y vuelve a guardar el nombre.");
          } else if (current()) {
            setChatActionError(response.status === 404 ? "Este chat ya no existe en el proyecto." :
              response.status === 400 ? "El nombre no es válido. Usa hasta 80 caracteres." :
                "No se pudo renombrar el chat. Inténtalo de nuevo.");
          }
          return;
        }
        const updated = await readChat(response);
        if (!current() || updated.id !== actionChatId || updated.projectId !== projectId) return;
        setChats((items) => [updated, ...items.filter((item) => item.id !== updated.id)]);
        setActiveChat((chat) => chat?.id === updated.id ? updated : chat);
        setChatAction(null);
        setActionChatId(null);
      } else {
        query.set("revision", String(summary.revision));
        const response = await requestFn(`/api/chats/${actionChatId}?${query}`, {
          method: "DELETE",
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 409) {
            await reloadChatsAfterConflict(projectId, generation, controller.signal, actionChatId);
            if (current()) setChatActionError("El chat cambió en otra sesión. Se actualizó el historial; confirma de nuevo para eliminar.");
          } else if (current()) {
            setChatActionError(response.status === 404 ? "Este chat ya no existe en el proyecto." :
              response.status === 400 ? "No se pudo validar el chat. Actualiza el historial e inténtalo de nuevo." :
                "No se pudo eliminar el chat. Inténtalo de nuevo.");
          }
          return;
        }
        if (!current()) return;
        queryClient.removeQueries({ queryKey: ["workspace", `/api/chats/${actionChatId}`] });
        const remaining = chats.filter((chat) => chat.id !== actionChatId);
        setChats(remaining);
        setChatAction(null);
        setActionChatId(null);
        if (activeChat?.id === actionChatId) {
          setConversationLoading(true);
          setActiveChat(null);
          setHistory([]);
          setHistoryError("");
          const next = remaining[0];
          if (next) {
            retryChatId.current = String(next.id);
            try {
              const nextChat = await fetchConversation(next.id, projectId, controller.signal);
              if (current()) {
                activateConversation(nextChat);
                drafts.current.delete(String(actionChatId));
                retryChatId.current = null;
              }
            } catch {
              if (current()) setHistoryError("El chat se eliminó, pero no se pudo abrir el siguiente. Selecciónalo para reintentar.");
            } finally {
              if (current()) setConversationLoading(false);
            }
          } else if (current()) {
            retryChatId.current = null;
            drafts.current.delete(String(actionChatId));
            draftRef.current = "";
            setDraft("");
            restoreSettings(null);
            setConversationLoading(false);
          }
        }
      }
    } catch {
      if (current()) setChatActionError("No se pudo completar la operación. Comprueba la conexión e inténtalo de nuevo.");
    } finally {
      if (mutationRequest.current === controller) mutationRequest.current = null;
      if (current()) setChatActionPending(false);
    }
  }

  async function saveCompleted(chatId: number, request: SaveChatRequest) {
    const generation = projectGeneration.current;
    const pending = { chatId, request };
    pendingSave.current = pending;
    setSaving(true);
    setSaveError("");
    setSaveConflict(false);
    try {
      const query = new URLSearchParams({ projectId: String(project!.id) });
      const response = await requestFn(`/api/chats/${chatId}?${query}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        if (response.status === 409 && projectGeneration.current === generation) setSaveConflict(true);
        throw new Error(response.status === 409
          ? "Este chat cambió en otra sesión. Guarda la respuesta como un chat nuevo."
          : "No se pudo guardar el historial local. Inténtalo de nuevo.");
      }
      const saved = await readChat(response);
      if (projectGeneration.current !== generation) return;
      pendingSave.current = null;
      setActiveChat(saved);
      setHistory(saved.messages);
      setChats((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSaveError("");
    } catch (reason) {
      if (projectGeneration.current === generation) setSaveError(reason instanceof Error ? reason.message : "No se pudo guardar el historial.");
    } finally {
      if (projectGeneration.current === generation) setSaving(false);
    }
  }

  async function retrySave() {
    if (!pendingSave.current || saving) return;
    await saveCompleted(pendingSave.current.chatId, pendingSave.current.request);
  }

  async function saveAsNewChat() {
    if (!project || !pendingSave.current || saving) return;
    const generation = projectGeneration.current;
    setSaving(true);
    setSaveError("");
    try {
      const chat = await createChat(project.id, undefined, requestFn);
      if (projectGeneration.current !== generation || !pendingSave.current) return;
      const request = { ...pendingSave.current.request, revision: 0 };
      pendingSave.current = { chatId: chat.id, request };
      setActiveChat(chat);
      setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      setSaveConflict(false);
      await saveCompleted(chat.id, request);
    } catch {
      if (projectGeneration.current === generation) setSaveError("No se pudo crear una copia nueva. Inténtalo de nuevo.");
    } finally {
      if (projectGeneration.current === generation) setSaving(false);
    }
  }

  async function acceptSuggestion(suggestion: TaskSuggestionView, draft: TaskSuggestionDraft, prepared?: { tempId: number; created: ReturnType<typeof optimisticNewTask> | null }): Promise<string | null> {
    const chat = activeChatRef.current;
    if (!project || !chat || chat.projectId !== project.id || suggestion.status !== "pending" ||
      !chat.messages.some((message) => message.role === "assistant" &&
        message.suggestions?.some((item) => item.id === suggestion.id && item.status === "pending")) ||
      saving || pendingSave.current || saveConflict || sending || historyLoading || conversationLoading ||
      chatActionPending || suggestionRequest.current || pendingSuggestionRef.current) return "Espera a que se guarde el historial antes de aplicar la propuesta.";

    const projectId = project.id;
    const chatId = chat.id;
    const generation = projectGeneration.current;
    const controller = new AbortController();
    suggestionRequest.current = controller;
    pendingSuggestionRef.current = suggestion.id;
    setPendingSuggestionId(suggestion.id);
    const isCurrent = () => !controller.signal.aborted && projectGeneration.current === generation &&
      activeChatRef.current?.id === chatId && project?.id === projectId;
    const fromRect = document.querySelector(`[data-suggestion-id="${suggestion.id}"]`)?.getBoundingClientRect();
    if (!prepared && fromRect && suggestion.kind && suggestion.kind !== "create" && suggestion.targetTaskId) {
      pointAtTask(suggestion.targetTaskId, fromRect);
    }
    const tempId = prepared?.tempId ?? -Date.now();
    const created = prepared ? prepared.created : ((suggestion.kind ?? "create") === "create" ? optimisticNewTask(draft, tempId) : null);
    const patch = created ? null : optimisticPatch(suggestion, draft);
    if (created && !prepared) {
      onTaskCreated(projectId, { task: created, refresh: false });
      if (fromRect) flyTaskToBoard(tempId, fromRect);
    } else if (created) {
      // ya mostrada de forma optimista por acceptAllSuggestions
    } else if (patch && suggestion.targetTaskId && !prepared) {
      onTaskCreated(projectId, { patch: { taskId: suggestion.targetTaskId, apply: patch }, refresh: false });
    }
    const discardOptimistic = () => {
      if (created || patch) onTaskCreated(projectId, {});
    };
    try {
      const response = await requestFn(`/api/chats/${chatId}/suggestions/${encodeURIComponent(suggestion.id)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          suggestion.kind === "add-tags" ? { tags: "tags" in draft ? draft.tags ?? [] : [] }
            : suggestion.kind === "add-subtasks" ? { subtasks: "subtasks" in draft ? draft.subtasks : [] }
              : suggestion.kind === "edit" ? { changes: "changes" in draft ? draft.changes : {} }
              : draft),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errorBody: unknown = await response.json().catch(() => null);
        if (errorBody && typeof errorBody === "object" && "error" in errorBody && typeof errorBody.error === "string") {
          throw new Error(errorBody.error);
        }
        const reason = response.status === 409
          ? "El historial cambió en otra sesión. Actualiza el chat antes de aplicar la propuesta."
          : response.status === 404
            ? "La sugerencia ya no está disponible en este chat."
            : "No se pudo aplicar la propuesta. Inténtalo de nuevo.";
        throw new Error(reason);
      }
      const result: unknown = await response.json();
      if (typeof result !== "object" || result === null || !("conversation" in result) ||
        !validConversation(result.conversation) || result.conversation.id !== chatId ||
        result.conversation.projectId !== projectId ||
        !result.conversation.messages.some((message) => message.role === "assistant" &&
          message.suggestions?.some((item) => item.id === suggestion.id && item.status === "accepted")) ||
        !("task" in result) || (result.task !== null && (typeof result.task !== "object" || result.task === null)) ||
        !("alreadyAccepted" in result) || typeof result.alreadyAccepted !== "boolean") {
        throw new Error("El servidor devolvió una respuesta de aceptación no válida.");
      }
      if (!isCurrent()) {
        discardOptimistic();
        return "El chat cambió. Vuelve a abrir la sugerencia para intentarlo de nuevo.";
      }
      const canonical = result.conversation;
      setActiveChat(canonical);
      activeChatRef.current = canonical;
      setHistory(canonical.messages);
      setChats((current) => [canonical, ...current.filter((item) => item.id !== canonical.id)]);
      setSuggestionTaskData(null);
      onTaskCreated(projectId, { task: (result.task ?? undefined) as TaskDto | undefined, replaceId: created ? tempId : undefined });
      return null;
    } catch (reason) {
      discardOptimistic();
      return isCurrent()
        ? reason instanceof Error ? reason.message : "No se pudo aplicar la propuesta. Inténtalo de nuevo."
        : "El chat cambió. Vuelve a abrir la sugerencia para intentarlo de nuevo.";
    } finally {
      if (suggestionRequest.current === controller) suggestionRequest.current = null;
      if (pendingSuggestionRef.current === suggestion.id) {
        pendingSuggestionRef.current = null;
        if (!controller.signal.aborted && projectGeneration.current === generation) setPendingSuggestionId(null);
      }
    }
  }

  async function acceptAllSuggestions(items: TaskSuggestionView[]): Promise<string | null> {
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setBulkAccepting(true);
    try {
    const projectId = project?.id;
    const prepared = new Map<string, { tempId: number; created: ReturnType<typeof optimisticNewTask> | null }>();
    if (projectId) {
      const base = -Date.now();
      items.forEach((item, index) => {
        const fromRect = document.querySelector(`[data-suggestion-id="${item.id}"]`)?.getBoundingClientRect();
        if ((item.kind ?? "create") !== "create") {
          if (!item.targetTaskId) return;
          const patch = optimisticPatch(item, draftForSuggestion(item));
          prepared.set(item.id, { tempId: 0, created: null });
          if (patch) onTaskCreated(projectId, { patch: { taskId: item.targetTaskId, apply: patch }, refresh: false });
          if (fromRect && smooth) pointAtTask(item.targetTaskId, fromRect);
          return;
        }
        const tempId = base - index;
        const created = optimisticNewTask(draftForSuggestion(item), tempId);
        if (!created) return;
        prepared.set(item.id, { tempId, created });
        onTaskCreated(projectId, { task: created, refresh: false });
        if (fromRect && smooth) flyTaskToBoard(tempId, fromRect);
      });
    }
    for (const [index, item] of items.entries()) {
      const failure = await acceptSuggestion(item, draftForSuggestion(item), prepared.get(item.id));
      if (failure) return `${index} de ${items.length} aplicadas. ${failure}`;
    }
    return null;
    } finally {
      setBulkAccepting(false);
    }
  }

  async function autoApplySuggestion(suggestion: TaskSuggestionView) {
    if (!project || !suggestion.targetTaskId) return;
    const snapshot = await loadUndoSnapshot(project.id, suggestion.targetTaskId, requestFn);
    const failure = await acceptSuggestion(suggestion, draftForSuggestion(suggestion));
    setAutoNotice(failure ? { text: `No se pudo aplicar automáticamente. ${failure}`, snapshot: null } : { text: "La IA aplicó los cambios", snapshot });
  }

  async function undoAutoApply() {
    const notice = autoNotice;
    const snapshot = notice?.snapshot;
    if (!notice || !snapshot || !project || notice.busy) return;
    setAutoNotice({ ...notice, busy: true });
    const patch = (body: Record<string, unknown>) => requestFn("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ projectId: project.id, taskId: snapshot.taskId, ...body }),
    }).then((response) => { if (!response.ok) throw new Error(); });
    try {
      await patch({
        title: snapshot.title,
        description: snapshot.description,
        startDate: snapshot.startDate,
        endDate: snapshot.endDate,
        attachments: snapshot.attachments,
        priorityId: snapshot.priorityId,
        tags: snapshot.tagIds,
        subtasks: snapshot.subtasks,
      });
      await patch({ column: snapshot.column, beforeTaskId: null });
      onTaskCreated(project.id);
      setAutoNotice({ text: "Cambios revertidos", snapshot: null });
    } catch {
      setAutoNotice({ text: "No se pudo deshacer. Revisa la tarea en el tablero.", snapshot: null });
    }
  }

  function toggleAutoApply() {
    const next = !autoApply;
    setAutoApply(next);
    try {
      localStorage.setItem(AUTO_APPLY_KEY, next ? "1" : "0");
    } catch {}
  }

  useEffect(() => {
    try {
      setAutoApply(localStorage.getItem(AUTO_APPLY_KEY) === "1");
    } catch {}
  }, []);

  useEffect(() => {
    if (!autoNotice || autoNotice.busy) return;
    const timer = window.setTimeout(() => setAutoNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [autoNotice]);

  useEffect(() => {
    if (!autoApply || saving || sending || pendingSave.current || !activeChat || !liveSuggestionIds.current.size) return;
    const last = [...history].reverse().find((message) => message.role === "assistant" &&
      message.suggestions?.some((item) => liveSuggestionIds.current.has(item.id)));
    if (!last) return;
    liveSuggestionIds.current.clear();
    const pending = (last.suggestions ?? []).filter((item) => item.status === "pending") as TaskSuggestionView[];
    if (pending.length === 1 && isAutoApplicable(pending[0])) void autoApplySuggestion(pending[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, saving, sending, activeChat, autoApply]);

  function setSuggestionDiscarded(suggestion: TaskSuggestionView, discarded: boolean) {
    const chat = activeChatRef.current;
    const expectedStatus = discarded ? "pending" : "discarded";
    const nextStatus = discarded ? "discarded" as const : "pending" as const;
    if (!project || !chat || chat.projectId !== project.id || suggestion.status !== expectedStatus ||
      saving || pendingSave.current || saveConflict || sending || historyLoading || conversationLoading ||
      chatActionPending || suggestionRequest.current || pendingSuggestionRef.current) return;
    const providerId = chat.provider ?? provider;
    const modelId = chat.model ?? model;
    if (!providerId || !modelId) {
      setSaveError("No se puede guardar esta decisión sin los metadatos del proveedor.");
      return;
    }
    const messages = history.map((message) => message.role === "assistant" && message.suggestions?.some(({ id, status }) => id === suggestion.id && status === expectedStatus)
      ? { ...message, suggestions: message.suggestions.map((item) => item.id === suggestion.id && item.status === expectedStatus ? { ...item, status: nextStatus } : item) }
      : message);
    if (messages.every((message, index) => message === history[index])) return;
    pendingSuggestionRef.current = suggestion.id;
    setPendingSuggestionId(suggestion.id);
    setHistory(messages);
    void saveCompleted(chat.id, {
      revision: chat.revision,
      messages,
      provider: providerId,
      model: modelId,
      protocol: chat.protocol,
      region: chat.region,
    }).finally(() => {
      if (pendingSuggestionRef.current === suggestion.id) {
        pendingSuggestionRef.current = null;
        setPendingSuggestionId(null);
      }
    });
  }

  const isTaskDrag = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("application/x-modus-task");

  function dropTask(event: DragEvent) {
    taskDragDepth.current = 0;
    setTaskDragOver(false);
    try {
      const payload = JSON.parse(event.dataTransfer.getData("application/x-modus-task")) as { taskId?: unknown; projectId?: unknown; title?: unknown };
      if (!project || payload.projectId !== project.id || !Number.isSafeInteger(payload.taskId) || (payload.taskId as number) <= 0) return;
      const id = payload.taskId as number;
      const title = typeof payload.title === "string" ? payload.title.slice(0, 255) : `Tarea ${id}`;
      setTaskRefs((current) => current.some((item) => item.id === id) || current.length >= 10 ? current : [...current, { id, title }]);
    } catch {}
  }

  async function generateChatTitle(chatId: number, projectId: number, settings: Record<string, unknown>) {
    try {
      const response = await requestFn(`/api/chats/${chatId}/title?projectId=${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) return;
      const result = (await response.json()) as { title?: unknown };
      if (typeof result.title !== "string" || !result.title) return;
      const title = result.title;
      setActiveChat((current) => (current && current.id === chatId ? { ...current, title } : current));
      setChats((current) => current.map((item) => (item.id === chatId ? { ...item, title } : item)));
    } catch {}
  }

  async function sendMessage() {
    const content = draft.trim() || (attachments.items.some((item) => item.status === "ready") ? "Archivos adjuntos." : taskRefs.length ? "Tareas adjuntas." : "");
    if (!content || !ready || sendingRef.current || !project || !provider || !selectedModel || attachments.items.some((item) => item.status !== "ready")) return;
    const attached = attachments.items.flatMap((item) => item.attachment ? [item.attachment] : []);
    if (attached.length !== attachments.items.length || attached.length > maxAttachments) return;
    const outgoing = [
      ...history.map(({ role, content: messageContent, attachments: files, tasks }) => ({
        role, content: messageContent,
        ...(role === "user" && files?.length ? { attachmentIds: files.map((file) => file.id) } : {}),
        ...(role === "user" && tasks?.length ? { taskIds: tasks.map((task) => task.id) } : {}),
      })),
      {
        role: "user" as const, content,
        ...(attached.length ? { attachmentIds: attached.map((file) => file.id) } : {}),
        ...(taskRefs.length ? { taskIds: taskRefs.map((task) => task.id) } : {}),
      },
    ];
    const chosenProtocol = selectedModel.protocol ?? (protocol || undefined);
    const request: ChatRequest = {
      projectId: project.id,
      provider,
      model,
      ...(chosenProtocol ? { protocol: chosenProtocol } : {}),
      ...(provider === "bedrock" ? { region } : {}),
      messages: fitContextWindow(outgoing),
    };
    const requestBody = JSON.stringify(request);
    if (new TextEncoder().encode(requestBody).byteLength > 128 * 1024) {
      setLimitError("La solicitud supera el límite del chat. Crea un chat nuevo para continuar.");
      return;
    }
    setLimitError("");
    setSendError("");
    setSearching(false);
    clearStreaming();
    sendingRef.current = true;
    const controller = new AbortController();
    sendRequest.current = controller;
    draftRef.current = "";
    setDraft("");
    drafts.current.set(activeChat ? String(activeChat.id) : newDraftKey.current, "");
    const sentTasks = taskRefs;
    setTaskRefs([]);
    const userMessage: ChatMessage = {
      role: "user", content,
      ...(attached.length ? { attachments: attached } : {}),
      ...(sentTasks.length ? { tasks: sentTasks } : {}),
    };
    setPendingMessage(userMessage);
    setSending(true);
    const detached = attachments.detach(attached.map((item) => item.id));
    let delivered = false;
    try {
      let chat = activeChat;
      if (!chat) {
          chat = await createChat(project.id, controller.signal, requestFn);
        if (controller.signal.aborted) return;
        setActiveChat(chat);
        setChats((current) => [chat!, ...current.filter((item) => item.id !== chat!.id)]);
        drafts.current.set(String(chat.id), draftRef.current);
      }
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: requestBody,
        signal: controller.signal,
      });
      if (!response.ok) {
        let errorMessage = errorForStatus(response.status);
        if (provider === "chatgpt" && (response.status === 401 || response.status === 403 || response.status === 409)) reloadProviders();
        try {
          const data: unknown = await response.json();
          if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string") {
            errorMessage = data.error;
          }
        } catch {}
        throw new Error(errorMessage);
      }
      let message: ChatResponse["message"];
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.includes("application/x-ndjson")) {
        if (!response.body) {
          throw new Error("La respuesta del chat no es válida.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let completedMessage: ChatResponse["message"] | null = null;
        let eventBuffer = "";
        let streamComplete = false;
        const consumeEvent = (line: string) => {
          if (!line.trim() || controller.signal.aborted) return;
          let event: unknown;
          try {
            event = JSON.parse(line);
          } catch {
            throw new Error("La respuesta del chat contiene JSON inválido.");
          }
          if (!event || typeof event !== "object" || !("type" in event)) {
            throw new Error("La respuesta del chat contiene un evento inválido.");
          }
          if (event.type === "searching") {
            setSearching(true);
          } else if (event.type === "thinking") {
            setSearching(false);
          } else if (event.type === "delta" && "text" in event && typeof event.text === "string") {
            setStreamingText(event.text);
          } else if (event.type === "suggestion" && "suggestion" in event && validMessages([{ role: "assistant", content: "", suggestions: [event.suggestion] }])) {
            setStreamingSuggestions((current) => [...current, event.suggestion as TaskSuggestion]);
          } else if (event.type === "error") {
            throw new Error("error" in event && typeof event.error === "string"
              ? event.error : "No se pudo completar el chat.");
          } else if (event.type === "complete" && "message" in event &&
            typeof event.message === "object" && event.message !== null &&
            "role" in event.message && event.message.role === "assistant" &&
            "content" in event.message && typeof event.message.content === "string") {
            if (completedMessage) throw new Error("La respuesta del chat repitió el resultado final.");
            completedMessage = event.message as ChatResponse["message"];
          } else {
            throw new Error("La respuesta del chat contiene un evento inesperado.");
          }
        };
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            eventBuffer += decoder.decode(value, { stream: true });
            const lines = eventBuffer.split("\n");
            eventBuffer = lines.pop() ?? "";
            for (const line of lines) consumeEvent(line);
          }
          if (controller.signal.aborted) return;
          eventBuffer += decoder.decode();
          if (eventBuffer.trim()) consumeEvent(eventBuffer);
          if (!completedMessage) throw new Error("La respuesta del chat terminó sin resultado.");
          streamComplete = true;
        } finally {
          setSearching(false);
          if (!streamComplete) void reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        message = completedMessage as ChatResponse["message"];
      } else if (contentType.includes("application/json")) {
        const data: ChatResponse = await response.json();
        message = data.message;
      } else {
        throw new Error("La respuesta del chat tiene un formato no válido.");
      }
      if (controller.signal.aborted) return;
      if (!message || message.role !== "assistant" || typeof message.content !== "string" ||
        !validMessages([message])) {
        throw new Error("La respuesta del chat no es válida.");
      }
      const completed = [...history, userMessage, message];
      liveSuggestionIds.current = new Set((message.suggestions ?? []).map((item) => item.id));
      setPendingMessage(null);
      clearStreaming();
      setHistory(completed);
      delivered = true;
      attachments.release(detached);
      if (chat) {
        const saveRequest: SaveChatRequest = {
          revision: chat.revision,
          messages: completed,
          provider,
          model,
          protocol: (selectedModel.protocol ?? protocol) || null,
          region: provider === "bedrock" ? region : null,
        };
        await saveCompleted(chat.id, saveRequest);
        if (completed.length === 2) {
          void generateChatTitle(chat.id, project.id, { provider, model, ...(chosenProtocol ? { protocol: chosenProtocol } : {}), ...(provider === "bedrock" ? { region } : {}) });
        }
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        if (!delivered && draftRef.current === "") {
          draftRef.current = content;
          setDraft(content);
          drafts.current.set(activeChat ? String(activeChat.id) : newDraftKey.current, content);
        }
        setSendError(
          reason instanceof Error ? reason.message : "No se pudo enviar el mensaje.",
        );
      }
    } finally {
      if (!delivered) {
        attachments.restore(detached);
        setTaskRefs((current) => (current.length ? current : sentTasks));
      }
      if (sendRequest.current === controller) {
        sendingRef.current = false;
        sendRequest.current = null;
      }
      if (!controller.signal.aborted) {
        setSending(false);
        setSearching(false);
        clearStreaming();
        setPendingMessage(null);
      }
    }
  }

  function changeProvider(value: string) {
    const next = value as ChatProviderId | "";
    settingsRef.current = { ...settingsRef.current, provider: next, model: "", protocol: "" };
    setProvider(next);
    setModel("");
    setProtocol("");
    setSendError("");
  }

  function changeRegion(value: string) {
    settingsRef.current = { ...settingsRef.current, region: value, model: "" };
    setRegion(value);
    setSendError("");
  }

  function changeModel(value: string) {
    settingsRef.current = { ...settingsRef.current, model: value, protocol: "" };
    setModel(value);
    setProtocol("");
    setSendError("");
  }

  function changeProtocol(value: string) {
    const next = value as ChatProtocol | "";
    settingsRef.current = { ...settingsRef.current, protocol: next };
    setProtocol(next);
    setSendError("");
  }

  const providerOptions: ChatPickerOption[] = providers.map(({ id, name, logo, invertInDark }) => ({
    value: id,
    label: name,
    icon: logo ? `/providers/${logo}` : undefined,
    invertInDark,
    detail: configured.includes(id) ? "Configurado" : "No configurado",
    disabled: !configured.includes(id),
  }));
  const activeProvider = providers.find((p) => p.id === provider);
  const modelOptions: ChatPickerOption[] = [
    ...(!model
      ? [{
          value: "",
          label: modelsLoading ? "Cargando modelos…" : "Seleccionar modelo",
          disabled: true,
        }]
      : []),
    ...models.map(({ id, name, source, badge }) => ({
      value: id,
      label: name,
      icon: activeProvider?.logo ? `/providers/${activeProvider.logo}` : undefined,
      invertInDark: activeProvider?.invertInDark,
      detail: source === "zen" ? "OpenCode Zen" : source === "go" ? "OpenCode Go" : undefined,
      ...(badge === "FREE" || (provider === "opencode" && /(?:^|[-:])free$/i.test(id))
        ? { badge: "FREE" as const }
        : {}),
    })),
    ...(model && !models.some((item) => item.id === model)
      ? [{
          value: model,
          label: `${model} (no disponible)`,
          icon: activeProvider?.logo ? `/providers/${activeProvider.logo}` : undefined,
          invertInDark: activeProvider?.invertInDark,
          disabled: true,
        }]
      : []),
  ];
  const chatOptions: ChatPickerOption[] = chats.map((chat) => ({
    value: String(chat.id),
    label: chat.title,
    detail: new Date(chat.updatedAt).toLocaleString("es", { dateStyle: "short", timeStyle: "short" }),
  }));
  const busy = providersLoading || historyLoading || conversationLoading || sending || saving || chatActionPending;
  const currentSuggestionTaskData = suggestionTaskData?.projectId === project?.id ? suggestionTaskData : null;

  const attachmentsDisabled = sending || chatActionPending || !project || !storageAvailable;
  const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");
  const acceptsDrag = (event: DragEvent) => (isTaskDrag(event) && !!project) || (isFileDrag(event) && !attachmentsDisabled);

  return (
    <section
      className={`${styles.chat} ${taskDragOver ? styles.taskDropActive : ""}`}
      aria-labelledby="chat-title"
      onDragEnter={(event) => {
        if (isFileDrag(event)) event.preventDefault();
        if (!acceptsDrag(event)) return;
        event.preventDefault();
        taskDragDepth.current += 1;
        setTaskDragOver(true);
      }}
      onDragOver={(event) => {
        if (isFileDrag(event)) event.preventDefault();
        if (!acceptsDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!isTaskDrag(event) && !isFileDrag(event)) return;
        taskDragDepth.current = Math.max(0, taskDragDepth.current - 1);
        if (!taskDragDepth.current) setTaskDragOver(false);
      }}
      onDrop={(event) => {
        if (isFileDrag(event)) {
          event.preventDefault();
          taskDragDepth.current = 0;
          setTaskDragOver(false);
          if (!attachmentsDisabled && event.dataTransfer.files.length) attachments.add(Array.from(event.dataTransfer.files));
          return;
        }
        if (!isTaskDrag(event)) return;
        event.preventDefault();
        dropTask(event);
      }}
    >
      <header className={`${shared.panelHeader} ${styles.chatHeader}`}>
        <span className={styles.aiHeaderAvatar}>
          <i aria-hidden="true" className="bi bi-stars" />
        </span>
        <div className={styles.headerText}>
          <h2 id="chat-title" className={styles.srOnly}>Chat con IA</h2>
          <ChatPicker
            label="Seleccionar chat"
            value={activeChat ? String(activeChat.id) : ""}
            options={chatOptions}
            onChange={(value) => void selectChat(value)}
            disabled={!project || !canSwitch || historyLoading}
            loading={historyLoading && !activeChat}
            action={{
              label: "Nuevo chat",
              onSelect: () => void startNewChat(),
              disabled: !project || !canSwitch,
            }}
            optionActions={{ disabled: !canMutateChats, onSelect: openChatAction }}
          />
          <p>{provider === "chatgpt" && configured.includes("chatgpt") ? <>Usando tu plan de ChatGPT · <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">Gestionar uso</a></> : provider === "chatgpt" ? "Conecta ChatGPT en Proveedores para usar tu plan." : project ? "Chats de este proyecto" : "Selecciona un proyecto para chatear."}</p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className={shared.iconButton}
          onClick={onClose}
          aria-label="Ocultar chat"
          aria-expanded={true}
          aria-controls="workspace-chat"
        >
          <i aria-hidden="true" className="bi bi-layout-sidebar" />
        </button>
      </header>

      <div
        className={styles.messages}
        ref={messagesRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          shouldStickToBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 64;
        }}
      >
        <ChatTranscript
          messages={transcript}
          loading={historyLoading || conversationLoading}
          saving={saving}
          pendingMessage={pendingMessage}
          searching={searching}
          streamingText={streamingText}
          streamingSuggestions={streamingSuggestions}
          hasProject={!!project}
          suggestionsDisabled={suggestionsDisabled}
          pendingSuggestionId={pendingSuggestionId}
          taskTitles={currentSuggestionTaskData?.tasks ?? new Map()}
          taskDetails={currentSuggestionTaskData?.details ?? new Map()}
          catalogs={currentSuggestionTaskData?.catalogs ?? null}
          catalogTags={currentSuggestionTaskData?.tags ?? []}
          onAcceptSuggestion={acceptSuggestion}
          onAcceptAllSuggestions={acceptAllSuggestions}
          onDiscardSuggestion={(suggestion) => setSuggestionDiscarded(suggestion, true)}
          onUndoDiscardSuggestion={(suggestion) => setSuggestionDiscarded(suggestion, false)}
          projectId={project?.id}
        />
      </div>

      <div className={styles.providerControls}>
        <ChatSettings
          provider={provider}
          model={model}
          region={region}
          protocol={protocol}
          needsProtocol={needsProtocol}
          providerOptions={providerOptions}
          modelOptions={modelOptions}
          providersLoading={providersLoading}
          modelsLoading={modelsLoading}
          modelsError={modelsError}
          modelsCount={models.length}
          busy={sending || !!pendingSave.current}
          onProviderChange={changeProvider}
          onRegionChange={changeRegion}
          onModelChange={changeModel}
          onProtocolChange={changeProtocol}
        />
        <ChatNotices
          providersLoading={providersLoading}
          storageAvailable={storageAvailable}
          providersError={providersError}
          configuredCount={configured.length}
          provider={provider}
          providerConfigured={provider !== "" && configured.includes(provider)}
          modelsLoading={modelsLoading}
          modelsError={modelsError}
          modelsWarning={modelsWarning}
          modelsCount={models.length}
          model={model}
          hasSelectedModel={!!selectedModel}
          onReloadProviders={reloadProviders}
          onReloadModels={() => {
            void invalidateWorkspaceQueries(queryClient, "/api/chat/models");
            setModelsReload((value) => value + 1);
          }}
        />
      </div>

      <ChatErrors
        historyError={historyError}
        busy={busy}
        onRetryHistory={() => void retryHistory()}
        sending={sending}
        historyCount={history.length}
        sendError={sendError}
        ready={ready}
        onRetrySend={() => void sendMessage()}
        saveError={saveError}
        saving={saving}
        saveConflict={saveConflict}
        onRetrySave={() => void retrySave()}
        onSaveAsNew={() => void saveAsNewChat()}
        limitError={limitError}
      />
      {autoNotice && (
        <div className={styles.autoNotice} role="status">
          <span>{autoNotice.text}</span>
          {autoNotice.snapshot && (
            <button type="button" disabled={autoNotice.busy} onClick={() => void undoAutoApply()}>
              {autoNotice.busy ? "Deshaciendo…" : "Deshacer"}
            </button>
          )}
        </div>
      )}
      <div className={styles.autoApply}>
        <Switch checked={autoApply} onChange={toggleAutoApply} labelledBy="auto-apply-label" />
        <span id="auto-apply-label">Aplicar cambios de la IA automáticamente</span>
      </div>
      <ChatComposer
        draft={draft}
        onDraftChange={(value) => {
          draftRef.current = value;
          drafts.current.set(activeChat ? String(activeChat.id) : newDraftKey.current, value);
          setDraft(value);
          setSendError("");
        }}
        onSend={() => void sendMessage()}
        sending={sending}
        canSend={ready}
        attachmentsDisabled={attachmentsDisabled}
        attachments={attachments.items}
        attachmentError={attachments.error}
        projectId={project?.id}
        onFiles={attachments.add}
        onRetryAttachment={attachments.retry}
        onCancelAttachment={attachments.cancel}
        onRemoveAttachment={(key) => void attachments.remove(key)}
        taskRefs={taskRefs}
        onRemoveTask={(id) => setTaskRefs((current) => current.filter((item) => item.id !== id))}
      />
      <ChatActionDialog
        dialogRef={actionDialog}
        renameInputRef={renameInput}
        action={chatAction}
        actionTitleId={actionTitleId}
        renameValue={renameValue}
        actionError={chatActionError}
        pending={chatActionPending}
        chatTitle={chats.find((chat) => chat.id === actionChatId)?.title}
        onClose={() => setChatAction(null)}
        onDialogClose={() => {
          setChatAction(null);
          setActionChatId(null);
          setChatActionError("");
        }}
        onRenameValueChange={(value) => { setRenameValue(value); setChatActionError(""); }}
        onSubmit={() => void submitChatAction()}
      />
    </section>
  );
}
