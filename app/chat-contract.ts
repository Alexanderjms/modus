export type ChatProviderId =
  | "bedrock"
  | "cerebras"
  | "deepinfra"
  | "google"
  | "groq"
  | "nvidia"
  | "opencode"
  | "openrouter";

export type ChatProtocol = "chat-completions" | "responses" | "messages";

export type ChatModel = {
  id: string;
  name: string;
  protocol: ChatProtocol | null;
  source?: "go" | "zen";
  badge?: "FREE";
};

export type ChatModelsResponse = { models: ChatModel[] };

export type TaskSuggestionTag = {
  name: string;
  color?: string;
};

export type TaskSuggestionChanges = {
  title?: string;
  description?: string;
  priority?: "alta" | "media" | "baja" | "sin prioridad";
  startDate?: string | null;
  endDate?: string | null;
  column?: 0 | 1 | 2;
  addTags?: TaskSuggestionTag[];
  addSubtasks?: { title: string }[];
  /** Nombres de etiquetas y títulos de subtareas ya existentes en la tarea. */
  removeTags?: string[];
  removeSubtasks?: string[];
  completeSubtasks?: string[];
  reopenSubtasks?: string[];
};

export type TaskSuggestion = {
  id: string;
  title: string;
  description: string;
  priority: "alta" | "media" | "baja" | "sin prioridad";
  subtasks: { title: string }[];
  status: "pending" | "accepted" | "discarded";
  /** Tarea creada/afectada tras aceptar. En add-tags apunta a la tarea objetivo. */
  taskId?: number | null;
  /** Ausente equivale a "create" por retrocompatibilidad. */
  kind?: "create" | "add-tags" | "add-subtasks" | "edit";
  /** Obligatorio cuando kind es "add-tags" o "add-subtasks". Nunca confundir con taskId. */
  targetTaskId?: number;
  tags?: TaskSuggestionTag[];
  /** Solo con kind === "edit". Etiquetas y subtareas únicamente se añaden. */
  changes?: TaskSuggestionChanges;
};

export type ChatAttachment = { id: string; name: string; type: string; size: number };

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
  suggestions?: TaskSuggestion[];
};

export type ChatRequest = {
  projectId: number;
  provider: ChatProviderId;
  model: string;
  protocol?: ChatProtocol;
  region?: string;
  /** @deprecated El servidor decide automáticamente si busca en la web según la consulta. Se acepta por retrocompatibilidad. */
  webSearch?: boolean;
  messages: ChatMessage[];
};

export type ChatResponse = {
  message: {
    role: "assistant";
    content: string;
    suggestions?: TaskSuggestion[];
  };
};

export type ChatSummary = {
  id: number;
  projectId: number;
  title: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  provider: ChatProviderId | null;
  model: string | null;
  protocol: ChatProtocol | null;
  region: string | null;
};

export type ChatConversation = ChatSummary & { messages: ChatMessage[] };

export type SaveChatRequest = {
  revision: number;
  messages: ChatMessage[];
  provider: ChatProviderId;
  model: string;
  protocol: ChatProtocol | null;
  region: string | null;
};
