export type ChatGPTConnection = {
  id: "chatgpt";
  status: "connected" | "disconnected" | "expired" | "permission_required";
  configured: boolean;
  email: string | null;
  expiresAt: string | null;
  available: boolean;
};
export const COOKIE: string;
export class OAuthError extends Error { status: number; code: string; }
export function profileFor(db: object, userId: number, sessionToken?: string | null): string;
export function publicConnection(profile: string): ChatGPTConnection;
export function beginAuthorization(profile: string, origin: string, sessionToken?: string | null): Promise<{ authorizationUrl: string; cookie: string }>;
export function completeAuthorization(profile: string, cookie: string, callback: URL): Promise<ChatGPTConnection>;
export function getAccessToken(profile: string): Promise<string>;
export function disconnect(profile: string): Promise<{ connection: ChatGPTConnection; revoked: boolean; warning: string | null }>;
