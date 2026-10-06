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

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  projectId: number;
  provider: ChatProviderId;
  model: string;
  protocol?: ChatProtocol;
  region?: string;
  messages: ChatMessage[];
};

export type ChatResponse = { message: { role: "assistant"; content: string } };

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
