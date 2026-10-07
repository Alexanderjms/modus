import type { ChatConversation, ChatMessage, ChatSummary } from "../../chat-contract";

export function errorForStatus(status: number): string;
export function validMessages(value: unknown): value is ChatMessage[];
export function validSummary(value: unknown): value is ChatSummary;
export function validConversation(value: unknown): value is ChatConversation;
export function readChat(response: Response): Promise<ChatConversation>;
export function createChat(projectId: number, signal?: AbortSignal, transport?: (input: string, init?: RequestInit) => Promise<Response>): Promise<ChatConversation>;
