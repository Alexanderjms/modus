"use client";

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
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
import { ChatErrors, ChatNotices } from "./chat-notices";
import { ChatSettings } from "./chat-settings";
import { ChatTranscript } from "./chat-transcript";
import { createChat, errorForStatus, readChat, validSummary } from "./chat-api.mjs";
import { maxMessages, maxTotalCharacters, protocols, providers, regions } from "./chat-data.mjs";

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
  const [chatAction, setChatAction] = useState<"rename" | "delete" | null>(null);
  const [actionChatId, setActionChatId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [chatActionError, setChatActionError] = useState("");
  const [chatActionPending, setChatActionPending] = useState(false);
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
  const projectGeneration = useRef(0);
  const actionDialog = useRef<HTMLDialogElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const actionTitleId = useId();
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
    projectGeneration.current += 1;
    mutationRequest.current?.abort();
    mutationRequest.current = null;
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
    return () => {
      controller.abort();
      mutationRequest.current?.abort();
    };
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
    mutationRequest.current?.abort();
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

  const selectedModel = models.find((item) => item.id === model);
  const needsProtocol = selectedModel?.protocol === null;
  const ready = storageAvailable && !providersLoading && !providersError && !modelsLoading && !modelsError &&
    !!project && !!provider && configured.includes(provider) && !!selectedModel &&
    (!needsProtocol || !!protocol) && (provider !== "bedrock" || !!region) && !historyLoading &&
    !conversationLoading && !saving && !pendingSave.current && !chatActionPending && !mutationRequest.current;
  const transcript = sending && pendingMessage ? [...history, pendingMessage] : history;
  const canSwitch = !sending && !saving && !pendingSave.current && !conversationLoading &&
    !chatActionPending && !mutationRequest.current;
  const canMutateChats = !!project && canSwitch && !historyLoading;

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
      const chat = await createChat(project.id);
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

  function openChatAction(option: ChatPickerOption, action: "rename" | "delete") {
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
      const response = await fetch(`/api/chats?${query}`, { cache: "no-store", signal });
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (signal.aborted || projectGeneration.current !== generation ||
        typeof data !== "object" || data === null || !("chats" in data) || !Array.isArray(data.chats) ||
        !data.chats.every(validSummary)) return;
      setChats(data.chats);
      const latest = data.chats.find((chat) => chat.id === chatId);
      if (latest && activeChat?.id === chatId) {
        const current = await fetchConversation(chatId, projectId, signal);
        if (!signal.aborted && projectGeneration.current === generation) activateConversation(current);
      }
    } catch {
      // Keep the current chat and draft intact if the refresh itself fails.
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
        const response = await fetch(url, {
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
        const response = await fetch(`/api/chats/${actionChatId}?${query}`, {
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
    draftRef.current = "";
    setDraft("");
    drafts.current.set(activeChat ? String(activeChat.id) : newDraftKey.current, "");
    setPendingMessage({ role: "user", content });
    setSending(true);
    let delivered = false;
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
      delivered = true;
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
      sendingRef.current = false;
      if (!controller.signal.aborted) {
        setSending(false);
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
    icon: `/providers/${logo}`,
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
  const busy = providersLoading || historyLoading || conversationLoading || sending || saving || chatActionPending;

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
            optionActions={{ disabled: !canMutateChats, onSelect: openChatAction }}
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
        <ChatTranscript
          messages={transcript}
          loading={historyLoading || conversationLoading}
          saving={saving}
          pendingMessage={pendingMessage}
          hasProject={!!project}
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
          onReloadModels={() => setModelsReload((value) => value + 1)}
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
      />
      <dialog
        ref={actionDialog}
        className={styles.chatActionDialog}
        aria-labelledby={actionTitleId}
        onClose={() => {
          setChatAction(null);
          setActionChatId(null);
          setChatActionError("");
        }}
        onCancel={(event) => {
          if (chatActionPending) event.preventDefault();
        }}
      >
        <form onSubmit={(event) => { event.preventDefault(); void submitChatAction(); }} aria-busy={chatActionPending || undefined}>
          <header>
            <div>
              <h2 id={actionTitleId}>{chatAction === "rename" ? "Renombrar chat" : "Eliminar chat"}</h2>
              <p>{chatAction === "rename" ? "El nuevo nombre se conservará en este proyecto." : "Esta acción no se puede deshacer."}</p>
            </div>
            <button type="button" aria-label="Cerrar" disabled={chatActionPending} onClick={() => setChatAction(null)}>
              <i aria-hidden="true" className="bi bi-x-lg" />
            </button>
          </header>
          <div className={styles.chatActionBody}>
            {chatAction === "rename" ? (
              <label className={styles.chatActionField}>
                <span>Nombre del chat</span>
                <input
                  ref={renameInput}
                  type="text"
                  value={renameValue}
                  maxLength={80}
                  required
                  disabled={chatActionPending}
                  aria-invalid={!!chatActionError || undefined}
                  onChange={(event) => { setRenameValue(event.target.value); setChatActionError(""); }}
                />
                <small>{renameValue.length}/80</small>
              </label>
            ) : (
              <p className={styles.deleteWarning}>
                ¿Eliminar <strong>{chats.find((chat) => chat.id === actionChatId)?.title}</strong>? Se perderán este chat y todos sus mensajes.
              </p>
            )}
            {chatActionError && <p className={styles.chatActionError} role="alert">{chatActionError}</p>}
          </div>
          <footer>
            <button type="button" disabled={chatActionPending} onClick={() => setChatAction(null)}>Cancelar</button>
            <button
              type="submit"
              className={chatAction === "delete" ? styles.dangerButton : ""}
              disabled={chatActionPending || (chatAction === "rename" &&
                (!renameValue.trim() || renameValue.trim().length > 80 || /[\x00-\x1F\x7F]/.test(renameValue.trim())))}
            >
              {chatActionPending ? chatAction === "rename" ? "Guardando…" : "Eliminando…"
                : chatAction === "rename" ? "Guardar nombre" : "Eliminar chat"}
            </button>
          </footer>
        </form>
      </dialog>
    </section>
  );
}
