export const UNLOCK_COOKIE: string;
export const USERNAME_REGEX: RegExp;

export function hasPin(): boolean;
export function isUnlocked(token?: string | null): boolean;
export function lockKind(): "pin" | "password" | null;

export function createSession(userId?: number): string;
export function endSession(token?: string | null): void;
export function getSessionUserId(token?: string | null): number | null;
export function getCloudUserId(): number | null;

export function unlock(payload?: { pin?: string; username?: string; password?: string }):
  | { ok: true; token: string; retryAfter?: undefined }
  | { ok: false; token?: undefined; retryAfter?: number };

export function changePin(payload: {
  currentPin?: string;
  newPin: string | null;
}): {
  ok: boolean;
  status?: number;
  error?: string;
  retryAfter?: number;
};

export function getCloudProfile(userId?: number | null): { id: number; username: string } | null;

export function updateCloudProfile(payload: {
  userId?: number | null;
  username: string;
  currentPassword?: string;
  newPassword?: string;
}): {
  ok: boolean;
  status?: number;
  error?: string;
  retryAfter?: number;
};
