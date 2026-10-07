export type TavilyStatus = {
  configured: boolean;
  source: "saved" | "environment" | null;
  storageAvailable: boolean;
  updatedAt: string | null;
};
export type TavilyValidation = { ok: true } | { ok: false; status: number; error: string };
export function readTavilyRecord(db: any, userId: number): { clave_cifrada: string; fecha_actualizacion: string } | null;
export function getTavilyStatus(db: any, userId: number): TavilyStatus;
export function validTavilyKey(value: unknown): boolean;
export function validateTavilyKey(key: string, signal?: AbortSignal): Promise<TavilyValidation>;
export function saveTavilyKey(db: any, userId: number, key: string, signal?: AbortSignal, authorize?: () => boolean): Promise<TavilyValidation>;
export function getTavilyKey(db: any, userId: number): Promise<string | null>;
export function removeTavilyKey(db: any, userId: number): void;
