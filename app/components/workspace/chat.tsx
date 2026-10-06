"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
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
} from "../../chat-contract";
import type { Project } from "../projects-data";
import styles from "./chat.module.css";
import shared from "../workspace.module.css";
import { ChatComposer } from "./chat-composer";
import { ChatPicker, type ChatPickerOption } from "./chat-picker";
import { ThinkingOrb } from "./thinking-orb";
import { Skeleton } from "../skeleton";

const providers: { id: ChatProviderId; name: string; logo: string; invertInDark?: boolean }[] = [
  { id: "bedrock", name: "AWS Amazon Bedrock", logo: "aws-amazon-bedrock.svg" },
  { id: "cerebras", name: "Cerebras", logo: "cerebras.svg" },
  { id: "deepinfra", name: "DeepInfra", logo: "deepinfra.svg" },
  { id: "google", name: "Google AI Studio", logo: "google.svg" },
  { id: "groq", name: "Groq", logo: "groq.svg" },
  { id: "nvidia", name: "NVIDIA", logo: "nvidia.svg" },
  { id: "opencode", name: "OpenCode Go", logo: "opencode.svg", invertInDark: true },
  { id: "openrouter", name: "OpenRouter", logo: "openrouter-mono.svg", invertInDark: true },
];
const regions = [
  "us-east-2", "us-east-1", "us-west-2", "ap-southeast-3", "ap-south-1",
  "ap-southeast-2", "ap-northeast-1", "eu-central-1", "eu-west-1", "eu-west-2",
  "eu-south-1", "eu-north-1", "sa-east-1", "us-gov-west-1",
];
const protocols: { id: ChatProtocol; name: string }[] = [
  { id: "chat-completions", name: "Chat Completions" },
  { id: "responses", name: "Responses" },
  { id: "messages", name: "Messages" },
];
const maxMessages = 40;
const maxTotalCharacters = 80_000;

function errorForStatus(status: number) {
  if (status === 400) return "Solicitud no válida. Revisa el proveedor y el modelo.";
  if (status === 422) return "Revisa la clave, los permisos y la compatibilidad del modelo en el proveedor.";
  if (status === 401 || status === 403) return "La clave o los permisos del proveedor no son válidos.";
  if (status === 409) {
    return "El perfil local o la configuración del proveedor cambió. Actualiza los proveedores.";
  }
  if (status === 429) return "El proveedor alcanzó su cuota o límite de solicitudes.";
  if (status === 502) return "El proveedor no pudo completar la solicitud.";
  if (status === 504) return "La solicitud agotó el tiempo de espera.";
  return "No se pudo completar la operación. Inténtalo de nuevo.";
}

function validMessages(value: unknown): value is ChatMessage[] {
  return Array.isArray(value) && value.every((item) =>
    typeof item === "object" && item !== null &&
    (item.role === "user" || item.role === "assistant") && typeof item.content === "string",
  );
}

function validSummary(value: unknown): value is ChatSummary {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "number" && typeof item.projectId === "number" &&
    typeof item.title === "string" &&
    typeof item.revision === "number" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string" &&
    (item.provider === null || providers.some(({ id }) => id === item.provider)) &&
    (item.model === null || typeof item.model === "string") &&
    (item.protocol === null || protocols.some(({ id }) => id === item.protocol)) &&
    (item.region === null || typeof item.region === "string");
}

function validConversation(value: unknown): value is ChatConversation {
  return validSummary(value) && "messages" in value && validMessages(value.messages);
}

async function readChat(response: Response): Promise<ChatConversation> {
  if (!response.ok) throw new Error(response.status === 404
    ? "Ese chat no existe en este proyecto."
    : "No se pudo acceder al historial local.");
  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null || !("chat" in data) || !validConversation(data.chat)) {
    throw new Error("No se pudo leer el historial del chat.");
  }
  return data.chat;
}

async function createChat(projectId: number, signal?: AbortSignal) {
  const response = await fetch("/api/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
    signal,
  });
  return readChat(response);
}

export function WorkspaceChat({
  project,
  onClose,
  closeButtonRef,
}: {
  project: Project | null;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const [configured, setConfigured] = useState<ChatProviderId[]>([]);
  const [provider, setProvider] = useState<ChatProviderId | "">("");
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState("");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [providersReload, setProvidersReload] = useState(0);
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
  const [saving, setSaving] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<ChatMessage | null>(null);
  const [sendError, setSendError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveConflict, setSaveConflict] = useState(false);
  const [limitError, setLimitError] = useState("");
  const draftRef = useRef("");
  const drafts = useRef(new Map<string, string>());
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
  const messagesRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottom = useRef(true);
  const reloadProviders = useCallback(() => setProvidersReload((value) => value + 1), []);

  useEffect(() => {
    const onFocus = () => { if (!sendingRef.current) reloadProviders(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reloadProviders]);

  useEffect(() => {
    const controller = new AbortController();
    providerRequest.current?.abort();
    providerRequest.current = controller;
    setProvidersLoading(true);
    setProvidersError("");
    void (async () => {
      try {
        const response = await fetch("/api/providers", { cache: "no-store", signal: controller.signal });
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
        setProvider((current) => {
          if (current) return current;
          const fallback = available.includes("opencode") ? "opencode" : available[0] ?? "";
          if (fallback) settingsRef.current.provider = fallback;
          return fallback;
        });
      } catch {
        if (!controller.signal.aborted) setProvidersError("No se pudieron cargar los proveedores.");
      } finally {
        if (!controller.signal.aborted) setProvidersLoading(false);
      }
    })();
    return () => controller.abort();
  }, [providersReload]);

  useEffect(() => {
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
        const response = await fetch(`/api/chats?${query}`, { cache: "no-store", signal: controller.signal });
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
    return () => controller.abort();
  }, [project?.id]);

  async function fetchConversation(chatId: number, projectId: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ projectId: String(projectId) });
    const chat = await readChat(await fetch(`/api/chats/${chatId}?${query}`, { cache: "no-store", signal }));
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
    drafts.current.set(activeChat ? String(activeChat.id) : "new", draftRef.current);
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
    setModels([]);
    setModelsError("");
    setModelsWarning("");
    if (!provider) {
      setModelsLoading(false);
      setModel("");
      return;
    }
    const controller = new AbortController();
    setModelsLoading(true);
    const query = new URLSearchParams({ provider });
    if (provider === "bedrock") query.set("region", region);
    void (async () => {
      try {
        const response = await fetch(`/api/chat/models?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(errorForStatus(response.status));
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
      } catch {
        if (!controller.signal.aborted) setModelsError("No se pudieron cargar los modelos.");
      } finally {
        if (!controller.signal.aborted) setModelsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [provider, region, modelsReload]);

  useEffect(() => () => {
    providerRequest.current?.abort();
    historyRequest.current?.abort();
    conversationRequest.current?.abort();
    sendRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (shouldStickToBottom.current && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [history, sending, sendError]);

  const selectedModel = models.find((item) => item.id === model);
  const needsProtocol = selectedModel?.protocol === null;
  const ready = storageAvailable && !providersLoading && !providersError && !modelsLoading && !modelsError &&
    !!project && !!provider && configured.includes(provider) && !!selectedModel &&
    (!needsProtocol || !!protocol) && (provider !== "bedrock" || !!region) && !historyLoading &&
    !conversationLoading && !saving && !pendingSave.current;
  const transcript = sending && pendingMessage ? [...history, pendingMessage] : history;
  const canSwitch = !sending && !saving && !pendingSave.current && !conversationLoading;

  async function retryHistory() {
    if (!project) return;
    if (retryChatId.current) {
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
      const response = await fetch(`/api/chats?${query}`, { cache: "no-store", signal: controller.signal });
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
    if (!project || !canSwitch) return;
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
    if (!project || !canSwitch) return;
    if (!activeChat && draftRef.current.trim()) {
      setHistoryError("Envía el borrador actual antes de crear otro chat.");
      return;
    }
    setHistoryError("");
    setConversationLoading(true);
    try {
      const chat = await createChat(project.id);
      drafts.current.set(activeChat ? String(activeChat.id) : "new", draftRef.current);
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

  async function saveCompleted(chatId: number, request: SaveChatRequest) {
    const pending = { chatId, request };
    pendingSave.current = pending;
    setSaving(true);
    setSaveError("");
    setSaveConflict(false);
    try {
      const query = new URLSearchParams({ projectId: String(project!.id) });
      const response = await fetch(`/api/chats/${chatId}?${query}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        if (response.status === 409) setSaveConflict(true);
        throw new Error(response.status === 409
          ? "Este chat cambió en otra sesión. Guarda la respuesta como un chat nuevo."
          : "No se pudo guardar el historial local. Inténtalo de nuevo.");
      }
      const saved = await readChat(response);
      pendingSave.current = null;
      setActiveChat(saved);
      setHistory(saved.messages);
      setChats((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSaveError("");
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "No se pudo guardar el historial.");
    } finally {
      setSaving(false);
    }
  }

  async function retrySave() {
    if (!pendingSave.current || saving) return;
    await saveCompleted(pendingSave.current.chatId, pendingSave.current.request);
  }

  async function saveAsNewChat() {
    if (!project || !pendingSave.current || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const chat = await createChat(project.id);
      const request = { ...pendingSave.current.request, revision: 0 };
      pendingSave.current = { chatId: chat.id, request };
      setActiveChat(chat);
      setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      setSaveConflict(false);
      await saveCompleted(chat.id, request);
    } catch {
      setSaveError("No se pudo crear una copia nueva. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || !ready || sendingRef.current || !project || !provider || !selectedModel) return;
    const outgoing = [...history, { role: "user" as const, content }];
    const characters = outgoing.reduce((total, item) => total + item.content.length, 0);
    if (outgoing.length > maxMessages || characters > maxTotalCharacters) {
      setLimitError("Se alcanzó el límite de esta conversación. Crea un chat nuevo para continuar.");
      return;
    }
    const chosenProtocol = selectedModel.protocol ?? (protocol || undefined);
    const request: ChatRequest = {
      projectId: project.id,
      provider,
      model,
      ...(chosenProtocol ? { protocol: chosenProtocol } : {}),
      ...(provider === "bedrock" ? { region } : {}),
      messages: outgoing,
    };
    const requestBody = JSON.stringify(request);
    if (new TextEncoder().encode(requestBody).byteLength > 128 * 1024) {
      setLimitError("La solicitud supera el límite del chat. Crea un chat nuevo para continuar.");
      return;
    }
    setLimitError("");
    setSendError("");
    sendingRef.current = true;
    const controller = new AbortController();
    sendRequest.current = controller;
    setPendingMessage({ role: "user", content });
    setSending(true);
    try {
      let chat = activeChat;
      if (!chat) {
        chat = await createChat(project.id, controller.signal);
        if (controller.signal.aborted) return;
        setActiveChat(chat);
        setChats((current) => [chat!, ...current.filter((item) => item.id !== chat!.id)]);
        drafts.current.set(String(chat.id), draftRef.current);
      }
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(errorForStatus(response.status));
      const data: ChatResponse = await response.json();
      if (controller.signal.aborted) return;
      if (!data || data.message?.role !== "assistant" || typeof data.message.content !== "string") {
        throw new Error("La respuesta del chat no es válida.");
      }
      const completed = [...outgoing, data.message];
      setPendingMessage(null);
      setHistory(completed);
      if (draftRef.current.trim() === content) {
        draftRef.current = "";
        setDraft("");
        if (chat) drafts.current.set(String(chat.id), "");
      }
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
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        setSendError(
          reason instanceof Error ? reason.message : "No se pudo enviar el mensaje.",
        );
      }
    } finally {
      sendingRef.current = false;
      if (!controller.signal.aborted) {
        setSending(false);
        setPendingMessage(null);
      }
    }
  }

  const providerOptions: ChatPickerOption[] = [
    ...providers.map(({ id, name, logo, invertInDark }) => ({
      value: id,
      label: name,
      icon: `/providers/${logo}`,
      invertInDark,
      detail: configured.includes(id) ? "Configurado" : "No configurado",
      disabled: !configured.includes(id),
    })),
  ];
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
      icon: activeProvider ? `/providers/${activeProvider.logo}` : undefined,
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
          icon: activeProvider ? `/providers/${activeProvider.logo}` : undefined,
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
  const busy = providersLoading || historyLoading || conversationLoading || sending || saving;

  return (
    <section className={styles.chat} aria-labelledby="chat-title">
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
          />
          <p>{project ? "Chats de este proyecto" : "Selecciona un proyecto para chatear."}</p>
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
        {historyLoading || conversationLoading ? (
          <div className={styles.skeletonMessages} role="status" aria-label="Cargando historial…">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className={styles.skeletonBubble}>
                <Skeleton variant="text" width={64} height={8} />
                <Skeleton variant="text" width={key % 2 ? "60%" : "85%"} />
              </div>
            ))}
          </div>
        ) : transcript.length === 0 ? (
          <div className={styles.emptyState}>
            <i aria-hidden="true" className="bi bi-stars" />
            <p>{!project ? "Selecciona un proyecto" : "¿En qué te ayudo?"}</p>
            <span>Elige proveedor y modelo. Las respuestas no cambian tus tareas.</span>
          </div>
        ) : (
          transcript.map((item, index) => (
            <article
              key={`${index}-${item.role}`}
              className={`${styles.message} ${
                item.role === "user" ? styles.userMessage : styles.assistantMessage
              }`}
            >
              <strong>{item.role === "user" ? "Tú" : "Asistente"}</strong>
              <p>{item.content}</p>
            </article>
          ))
        )}
        {(pendingMessage || saving) && (
          <p className={styles.pending} aria-hidden="true">
            {saving ? "Guardando historial…" : (
              <>
                <ThinkingOrb />
                Thinking…
              </>
            )}
          </p>
        )}
      </div>

      <div className={styles.providerControls}>
        <div className={styles.settingsTop}>
          <div className={styles.providerField}>
            <ChatPicker
              label="Proveedor"
              value={provider}
              options={providerOptions}
              disabled={sending || !!pendingSave.current || providersLoading}
              loading={providersLoading}
              onChange={(value) => {
                const next = value as ChatProviderId | "";
                settingsRef.current = { ...settingsRef.current, provider: next, model: "", protocol: "" };
                setProvider(next);
                setModel("");
                setProtocol("");
                setSendError("");
              }}
            />
          </div>
          {provider === "bedrock" && (
            <select
              aria-label="Región de Bedrock"
              value={region}
              disabled={sending || !!pendingSave.current}
              onChange={(event) => {
                settingsRef.current = {
                  ...settingsRef.current,
                  region: event.target.value,
                  model: "",
                };
                setRegion(event.target.value);
                setSendError("");
              }}
            >
              {regions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          )}
          <div className={styles.modelField}>
            <ChatPicker
              label="Modelo"
              value={model}
              options={modelOptions}
              disabled={
                !provider ||
                modelsLoading ||
                sending ||
                !!pendingSave.current ||
                !!modelsError ||
                models.length === 0
              }
              loading={modelsLoading}
              onChange={(value) => {
                settingsRef.current = { ...settingsRef.current, model: value, protocol: "" };
                setModel(value);
                setProtocol("");
                setSendError("");
              }}
            />
          </div>
          {needsProtocol && (
            <select
              aria-label="Formato API"
              value={protocol}
              disabled={sending || !!pendingSave.current}
              onChange={(event) => {
                const next = event.target.value as ChatProtocol | "";
                settingsRef.current = { ...settingsRef.current, protocol: next };
                setProtocol(next);
                setSendError("");
              }}
            >
              <option value="">Elige un formato</option>
              {protocols.map(({ id, name }) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          )}
        </div>
        <div className={styles.settings}>
          {!providersLoading && !storageAvailable && (
            <p role="alert" className={styles.inlineError}>
              Las claves cifradas solo pueden usarse desde Windows.
            </p>
          )}
          {providersError && (
            <p role="alert" className={styles.inlineError}>
              {providersError}
              <button type="button" onClick={reloadProviders}>Reintentar</button>
            </p>
          )}
          {!providersLoading && !providersError && configured.length === 0 && (
            <p className={styles.inlineStatus}>
              Configura un proveedor en Perfil → Proveedores y actualiza la lista.
            </p>
          )}
          {!providersLoading && provider && !configured.includes(provider) && (
            <p className={styles.inlineStatus}>
              Este chat usa un proveedor sin configurar. Elige uno configurado para enviar.
            </p>
          )}
          {provider === "bedrock" && (
            <p className={styles.inlineStatus}>
              Usa una API key de Bedrock; no se admiten credenciales AWS.
            </p>
          )}
          {modelsError && (
            <p role="alert" className={styles.inlineError}>
              {modelsError}
              <button type="button" onClick={() => setModelsReload((value) => value + 1)}>
                Reintentar
              </button>
            </p>
          )}
          {modelsWarning && !modelsError && (
            <p role="status" className={styles.inlineStatus}>
              {modelsWarning}{" "}
              <button type="button" onClick={() => setModelsReload((value) => value + 1)}>
                Reintentar
              </button>
            </p>
          )}
          {!modelsLoading && !modelsError && provider && models.length === 0 && (
            <p className={styles.inlineStatus}>Este proveedor no ofrece modelos disponibles.</p>
          )}
          {!modelsLoading && model && !selectedModel && (
            <p className={styles.inlineStatus}>
              El modelo guardado no está disponible. Selecciona otro para enviar.
            </p>
          )}
        </div>
      </div>

      {historyError && (
        <div className={styles.errorBox} role="alert">
          <span>{historyError}</span>
          <button type="button" disabled={busy} onClick={() => void retryHistory()}>
            Reintentar
          </button>
        </div>
      )}
      <p className={styles.srOnly} role="status" aria-live="polite">
        {sending
          ? "Enviando mensaje."
          : history.length
            ? `Conversación: ${history.length} mensajes.`
            : ""}
      </p>
      {sendError && (
        <div className={styles.errorBox} role="alert">
          <span>{sendError}</span>
          <button
            type="button"
            disabled={!ready || sending}
            onClick={() => void sendMessage()}
          >
            Reintentar envío
          </button>
        </div>
      )}
      {saveError && (
        <div className={styles.errorBox} role="alert">
          <span>Respuesta recibida, no se pudo guardar. {saveError}</span>
          <button type="button" disabled={saving} onClick={() => void retrySave()}>
            Reintentar guardado
          </button>
          {saveConflict && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveAsNewChat()}
            >
              Guardar como nuevo chat
            </button>
          )}
        </div>
      )}
      {limitError && (
        <div className={styles.errorBox} role="alert">
          <span>{limitError}</span>
        </div>
      )}
      <ChatComposer
        draft={draft}
        onDraftChange={(value) => {
          draftRef.current = value;
          drafts.current.set(activeChat ? String(activeChat.id) : "new", value);
          setDraft(value);
          setSendError("");
        }}
        onSend={() => void sendMessage()}
        sending={sending}
        canSend={ready}
      />
    </section>
  );
}
