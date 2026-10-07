export type ProviderId =
  | "bedrock"
  | "deepinfra"
  | "google"
  | "groq"
  | "nvidia"
  | "opencode"
  | "openrouter";

export type ProviderStatus = Partial<Record<ProviderId, boolean>>;

export type ProviderCatalogEntry = {
  id: ProviderId;
  name: string;
  placeholder: string;
  logo: string;
};

export const providers: ProviderCatalogEntry[];
export const PROVIDER_IDS: ProviderId[];

export function providerErrorForStatus(status: number): string;
export function providerRequestError(reason: unknown, fallback: string): string;
export function readProviderStatus(
  response: Response,
): Promise<{ status: ProviderStatus; available: boolean }>;
