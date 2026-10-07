export const providers = [
  {
    id: "bedrock",
    name: "AWS Amazon Bedrock (API key)",
    placeholder: "API key",
    logo: "aws-amazon-bedrock.svg",
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    placeholder: "API key",
    logo: "deepinfra.svg",
  },
  { id: "groq", name: "Groq", placeholder: "API key", logo: "groq.svg" },
  { id: "opencode", name: "OpenCode Go", placeholder: "API key", logo: "opencode.svg" },
  {
    id: "openrouter",
    name: "OpenRouter",
    placeholder: "API key",
    logo: "openrouter-mono.svg",
  },
];

export const PROVIDER_IDS = providers.map((provider) => provider.id);

const KNOWN_STATUS_ERRORS = new Map([
  [400, "Una o más claves no son válidas. Revísalas e inténtalo de nuevo."],
  [403, "No se pudo autorizar esta solicitud local. Vuelve a intentarlo."],
  [409, "No se encontró el perfil local de Modus."],
  [501, "El almacenamiento cifrado solo está disponible en Windows."],
]);

const FALLBACK_STATUS_ERROR = "No se pudieron cargar o guardar las claves. Inténtalo de nuevo.";
const INVALID_RESPONSE_ERROR = "La respuesta del almacenamiento seguro no es válida.";

export function providerErrorForStatus(status) {
  return KNOWN_STATUS_ERRORS.get(status) ?? FALLBACK_STATUS_ERROR;
}

export function providerRequestError(reason, fallback) {
  if (reason instanceof Error && reason.userMessage) return reason.message;
  const knownErrors = [...KNOWN_STATUS_ERRORS.values(), INVALID_RESPONSE_ERROR];
  return reason instanceof Error && knownErrors.includes(reason.message)
    ? reason.message
    : fallback;
}

export async function readProviderStatus(response) {
  if (!response.ok) {
    if (response.status === 422 || response.status === 502) {
      const body = await response.json().catch(() => null);
      if (body && typeof body.error === "string" && body.error.length <= 300) {
        const error = new Error(body.error);
        error.userMessage = true;
        throw error;
      }
    }
    throw new Error(providerErrorForStatus(response.status));
  }

  const data = await response.json();
  if (
    typeof data !== "object" ||
    data === null ||
    !("providers" in data) ||
    !Array.isArray(data.providers) ||
    !("storage" in data) ||
    typeof data.storage !== "object" ||
    data.storage === null ||
    !("kind" in data.storage) ||
    data.storage.kind !== "windows-dpapi" ||
    !("available" in data.storage) ||
    typeof data.storage.available !== "boolean"
  ) {
    throw new Error(INVALID_RESPONSE_ERROR);
  }

  const status = {};
  for (const item of data.providers) {
    if (
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      "configured" in item &&
      typeof item.id === "string" &&
      typeof item.configured === "boolean" &&
      PROVIDER_IDS.includes(item.id)
    ) {
      status[item.id] = item.configured;
    }
  }
  if (Object.keys(status).length !== providers.length) {
    throw new Error(INVALID_RESPONSE_ERROR);
  }

  return { status, available: data.storage.available };
}
