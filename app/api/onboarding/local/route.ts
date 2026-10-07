import { getDatabase, getDefaultDbPath } from "../../../../db/local/db.cjs";
import { setStorageMode } from "../../../../db/local/storage.cjs";
import { applySchema } from "../../../../db/local/migrate.cjs";
import { hashPin, hashPinAsync, isValidPinFormat } from "../../../../db/local/pin.cjs";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8192;
const MAX_NAME_LENGTH = 100;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLoopbackHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  try {
    const parsed = new URL(`http://${hostHeader}`);
    return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase()) && parsed.host === hostHeader.toLowerCase();
  } catch {
    return false;
  }
}

function isAllowedOrigin(originHeader: string | null, request: Request): boolean {
  if (!originHeader) return true;
  try {
    const parsed = new URL(originHeader);
    const expected = new URL(request.url);
    expected.host = request.headers.get("host")!;
    return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase()) && parsed.origin === expected.origin;
  } catch {
    return false;
  }
}

function yieldCooperative(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

class PipelineError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface PipelineParams {
  trimmedName: string;
  pinEnabled: boolean;
  pin?: string;
  onProgress?: (progress: number, message: string) => Promise<void> | void;
  shouldAbort?: () => boolean;
}

async function executeLocalSetup({
  trimmedName,
  pinEnabled,
  pin,
  onProgress,
  shouldAbort = () => false,
}: PipelineParams): Promise<void> {
  const totalStages = pinEnabled ? 5 : 4;
  let doneStages = 0;

  async function notifyProgress(message: string) {
    if (onProgress) {
      const progress = Math.floor((doneStages / totalStages) * 100);
      await onProgress(progress, message);
    }
  }

  await notifyProgress("Iniciando almacenamiento local...");

  if (shouldAbort()) return;

  let db;
  try {
    db = getDatabase(process.env.MODUS_SQLITE_PATH || getDefaultDbPath());
  } catch {
    throw new PipelineError("Error interno al inicializar la base de datos", 500);
  }

  let inTransaction = false;

  try {
    doneStages++;
    await notifyProgress("Base de datos inicializada...");

    if (shouldAbort()) return;

    try {
      applySchema(db);
    } catch {
      throw new PipelineError("Error interno al inicializar el esquema de la base de datos", 500);
    }

    doneStages++;
    await notifyProgress("Esquema y catálogos aplicados...");

    if (shouldAbort()) return;

    let computedPinHash: string | null = null;
    if (pinEnabled) {
      try {
        computedPinHash = onProgress ? await hashPinAsync(pin as string) : hashPin(pin as string);
      } catch {
        throw new PipelineError("Error al procesar el PIN", 400);
      }
      doneStages++;
      await notifyProgress("PIN de acceso protegido...");

      if (shouldAbort()) return;
    }

    db.exec("BEGIN IMMEDIATE;");
    inTransaction = true;

    const existingUser = db.prepare("SELECT id FROM usuarios LIMIT 1").get();
    if (existingUser) {
      db.exec("ROLLBACK;");
      inTransaction = false;
      throw new PipelineError("El perfil local ya ha sido configurado previamente", 409);
    }

    if (shouldAbort()) {
      db.exec("ROLLBACK;");
      inTransaction = false;
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO usuarios (nombre, pin_hash, fecha_creacion, ultimo_acceso) VALUES (?, ?, ?, ?)",
    ).run(trimmedName, computedPinHash, now, now);

    doneStages++;

    if (shouldAbort()) {
      db.exec("ROLLBACK;");
      inTransaction = false;
      return;
    }

    db.exec("COMMIT;");
    inTransaction = false;
    setStorageMode("local");
    await notifyProgress("Perfil de usuario registrado...");
  } catch (err) {
    if (inTransaction) {
      try {
        db.exec("ROLLBACK;");
      } catch {}
    }
    if (err instanceof PipelineError) {
      throw err;
    }
    throw new PipelineError("Error interno al guardar el perfil local", 500);
  } finally {
    try {
      db.close();
    } catch {}
  }
}

export async function POST(request: Request) {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");

  if (!isLoopbackHost(host) || !isAllowedOrigin(origin, request) || request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ ok: false, error: "Origen no permitido" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (contentType.split(";")[0].trim().toLowerCase() !== "application/json") {
    return Response.json(
      { ok: false, error: "Content-Type debe ser application/json" },
      { status: 400 },
    );
  }

  let rawBodyText: string;
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > MAX_BODY_BYTES) {
            await reader.cancel();
            return Response.json(
              { ok: false, error: "El cuerpo de la solicitud excede el tamaño permitido" },
              { status: 400 },
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    rawBodyText = Buffer.concat(chunks).toString("utf8");
  } catch {
    return Response.json(
      { ok: false, error: "Error leyendo la solicitud" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBodyText);
  } catch {
    return Response.json(
      { ok: false, error: "JSON inválido" },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json(
      { ok: false, error: "El cuerpo debe ser un objeto JSON" },
      { status: 400 },
    );
  }

  const record = body as Record<string, unknown>;
  const { name, pinEnabled, pin, pinConfirmation } = record;

  if (typeof name !== "string") {
    return Response.json(
      { ok: false, error: "El nombre es obligatorio y debe ser una cadena de texto" },
      { status: 400 },
    );
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return Response.json(
      { ok: false, error: "El nombre no puede estar vacío" },
      { status: 400 },
    );
  }

  if (trimmedName.length > MAX_NAME_LENGTH) {
    return Response.json(
      { ok: false, error: `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres` },
      { status: 400 },
    );
  }

  if (typeof pinEnabled !== "boolean") {
    return Response.json(
      { ok: false, error: "pinEnabled debe ser un booleano" },
      { status: 400 },
    );
  }

  if (pinEnabled) {
    if (typeof pin !== "string" || !isValidPinFormat(pin)) {
      return Response.json(
        { ok: false, error: "El PIN debe ser una cadena no vacía compuesta solo por dígitos" },
        { status: 400 },
      );
    }
    if (typeof pinConfirmation !== "string" || pin !== pinConfirmation) {
      return Response.json(
        { ok: false, error: "La confirmación del PIN no coincide con el PIN" },
        { status: 400 },
      );
    }
  }

  const acceptHeader = request.headers.get("accept") || "";
  const wantsStream = acceptHeader.includes("application/x-ndjson");

  if (!wantsStream) {
    try {
      await executeLocalSetup({
        trimmedName,
        pinEnabled,
        pin: pin as string | undefined,
      });
      return Response.json({ ok: true }, { status: 201 });
    } catch (err) {
      if (err instanceof PipelineError) {
        return Response.json({ ok: false, error: err.message }, { status: err.status });
      }
      return Response.json(
        { ok: false, error: "Error interno al guardar el perfil local" },
        { status: 500 },
      );
    }
  }

  let isCancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function sendEvent(data: Record<string, unknown>) {
        if (isCancelled || request.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        } catch {}
      }

      function sendProgress(progress: number, message: string) {
        sendEvent({ type: "progress", progress, message });
      }

      function sendError(error: string, status: number) {
        sendEvent({ type: "error", error, status });
        try {
          controller.close();
        } catch {}
      }

      try {
        await executeLocalSetup({
          trimmedName,
          pinEnabled,
          pin: pin as string | undefined,
          shouldAbort: () => isCancelled || request.signal.aborted,
          onProgress: async (progress: number, message: string) => {
            sendProgress(progress, message);
            await yieldCooperative();
          },
        });

        if (isCancelled || request.signal.aborted) {
          try {
            controller.close();
          } catch {}
          return;
        }

        sendEvent({
          type: "complete",
          progress: 100,
          message: "Almacenamiento local creado.",
        });
        try {
          controller.close();
        } catch {}
      } catch (err) {
        if (err instanceof PipelineError) {
          sendError(err.message, err.status);
        } else {
          sendError("Error interno al guardar el perfil local", 500);
        }
      }
    },
    cancel() {
      isCancelled = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
