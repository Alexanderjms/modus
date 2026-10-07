export type ChatProviderId =
  | "chatgpt"
  | "bedrock"
  | "deepinfra"
  | "groq"
  | "opencode"
  | "openrouter";

export type ChatGPTConnection = {
  id: "chatgpt";
  status: "connected" | "disconnected" | "expired" | "permission_required";
  configured: boolean;
  email: string | null;
  expiresAt: string | null;
  available: boolean;
};

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
  removeTags?: string[];
  removeSubtasks?: string[];
  completeSubtasks?: string[];
  reopenSubtasks?: string[];
  renameSubtasks?: { from: string; to: string }[];
};

export type TaskSuggestion = {
  id: string;
  title: string;
  description: string;
  priority: "alta" | "media" | "baja" | "sin prioridad";
  subtasks: { title: string }[];
  status: "pending" | "accepted" | "discarded";
  taskId?: number | null;
  kind?: "create" | "add-tags" | "add-subtasks" | "edit";
  targetTaskId?: number;
  tags?: TaskSuggestionTag[];
  changes?: TaskSuggestionChanges;
};

export type ChatAttachment = { id: string; name: string; type: string; size: number };

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
  suggestions?: TaskSuggestion[];
  tasks?: { id: number; title: string }[];
};

export type ChatRequest = {
  projectId: number;
  provider: ChatProviderId;
  model: string;
  protocol?: ChatProtocol;
  region?: string;
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
