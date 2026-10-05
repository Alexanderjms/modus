# Base de datos (Turso / libSQL)

Esquema y utilidades backend. No requiere dependencias: usa la HTTP Pipeline API
de Turso con `fetch` nativo y `node:crypto`.

## Comandos

```bash
node --env-file=.env db/migrate.cjs

```

Requiere `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` en `.env` (ignorado por git).
`migrate.cjs` inspecciona el esquema antes, aplica solo `CREATE ... IF NOT EXISTS`
e `INSERT OR IGNORE`, y no borra datos.

## Archivos

- `schema.sql` — esquema completo (fuente de verdad, en repo).
- `lib.cjs` — cliente mínimo de la Pipeline API.
- `migrate.cjs` — aplica `schema.sql`.
- `password.cjs` — hash/verificación scrypt server-only.

## Contraseñas

Se almacenan como `scrypt$N$r$p$<sal-hex>$<hash-hex>` (sal aleatoria de 16 bytes,
keylen 64, `timingSafeEqual`). La columna `usuarios.contrasena` tiene un `CHECK`
(`LIKE 'scrypt$%'`) que rechaza texto plano. Usa `hashPassword` / `verifyPassword`
solo en el servidor.

---

# Base de datos local (SQLite nativo)

Implementación local server-only mediante `node:sqlite` nativo (requiere Node.js 22.13+ o 24; probado en v24.21.0). No instala dependencias adicionales.

> **Aviso de arquitectura y límites:**
> En Next.js, `node:sqlite` se ejecuta exclusivamente en el runtime del servidor (Node.js). La base de datos reside en la máquina del host donde corre el proceso de Node.js, **no en el navegador del cliente**. Solo reside en el dispositivo del usuario final cuando la aplicación y su servidor se ejecutan localmente en su propia máquina.
> El onboarding crea la base de datos y guarda el perfil después de confirmar. No requiere ejecutar la migración por separado.
> El PIN se guarda como hash scrypt; **no cifra el archivo SQLite**. La pantalla de desbloqueo todavía no está implementada.

## Archivo y Ubicación

- Base de datos física: `.local/modus.sqlite` (ignorado por Git, incluyendo posibles ficheros auxiliares `.sqlite-wal` / `.sqlite-shm`).
- Ruta configurable opcional mediante variable de entorno `MODUS_SQLITE_PATH`.

## Comandos

El comando manual es opcional; el onboarding aplica automáticamente el esquema al confirmar.

```bash
node db/local/migrate.cjs

```

## API de Onboarding Local

La aplicación expone el endpoint server-only:
`POST /api/onboarding/local`

- **Payload JSON:** `{ "name": string, "pinEnabled": boolean, "pin"?: string, "pinConfirmation"?: string }`
- **Modos de respuesta:**
  - **Streaming NDJSON (`Accept: application/x-ndjson`):**
    - `200 OK` (`Content-Type: application/x-ndjson; charset=utf-8`, `Cache-Control: no-store`).
    - Eventos progreso: `{"type":"progress","progress":number,"message":string}` con incremento porcentual calculado por etapas reales completadas (`Math.floor(completadas / total * 100)`: 5 etapas con PIN [0%, 20%, 40%, 60%, 80%], 4 etapas sin PIN [0%, 25%, 50%, 75%]).
    - Evento finalización: `{"type":"complete","progress":100,"message":"Almacenamiento local creado."}` emitido estrictamente tras `COMMIT` exitoso.
    - Evento error: `{"type":"error","error":string,"status":number}` sin llegar a 100 ni complete en caso de fallo (p. ej. `409` si el perfil ya existe).
  - **JSON unificado (sin header Accept de streaming):**
    - `201 { "ok": true }`: Base de datos, tablas y perfil creados exitosamente.
    - `400 { "ok": false, "error": string }`: Validación fallida (nombre inválido, PIN inválido o desajuste de confirmación, cuerpo no JSON o mayor a 8KB).
    - `403 { "ok": false, "error": string }`: Origen no permitido (bloquea orígenes y hosts fuera de loopback `localhost`/`127.0.0.1`/`[::1]`).
    - `409 { "ok": false, "error": string }`: Perfil ya existe (evita sobreescritura o reintentos destructivos).
    - `500 { "ok": false, "error": string }`: Error interno del servidor.

## API de Proyectos Local

La aplicación expone los endpoints server-only para interactuar con SQLite local:

### `GET /api/projects`
- **Seguridad:** Requiere Host/Origin loopback (`localhost`, `127.0.0.1`, `[::1]`) y no cross-site.
- **Respuesta 200:** `{ "projects": Project[] }` ordenados por `id DESC`.
  - Mapea métricas de tareas asociadas (`progress`, `tasks`, `doing`).
  - `status`: Si es null se mapea a `"active"`.
  - `activity`: `"sin actividad"`.
  - `age`: `Number.MAX_SAFE_INTEGER`.
- **Errores:**
  - `403 { "error": string }`: Origen/Host no permitido.
  - `409 { "error": "Configura primero tu perfil local." }`: Base de datos no inicializada o sin perfil creado.
  - `500 { "error": string }`: Error interno del servidor.

### `POST /api/projects`
- **Seguridad:** Requiere Host/Origin loopback y no cross-site. Límite de payload de 8KB, `Content-Type: application/json`.
- **Payload JSON:**
  - `nombre` (string, obligatorio, 1-100 caracteres).
  - `icono` (string, obligatorio, identificador válido de Bootstrap Icons).
  - `descripcion` (string | null, opcional, máx. 5000 caracteres).
  - `estado` (`"active"` | `"completed"` | `"archived"` | null, opcional).
- **Respuesta 201:** `{ "project": Project }` con el proyecto insertado en la base de datos para el perfil activo.
- **Errores:**
  - `400 { "error": string }`: Error de validación en campos o payload.
  - `403 { "error": string }`: Origen no permitido.
  - `409 { "error": "Configura primero tu perfil local." }`: Perfil local no encontrado o inconsistente.
  - `500 { "error": string }`: Error interno del servidor.

## Archivos

- `db/local/schema.sql` — Esquema SQLite local adaptado: tabla `usuarios` con `id, nombre, pin_hash, fecha_creacion, ultimo_acceso` (sin correo, contrasena ni rol). Resto de tablas, índices y catálogos idénticos a Turso.
- `db/local/db.cjs` — Helper de conexión y apertura de base de datos con `PRAGMA foreign_keys = ON;`.
- `db/local/pin.cjs` — Validador y utilidades `hashPin` / `verifyPin` reutilizando scrypt de `db/password.cjs`.
- `db/local/migrate.cjs` — Script de migración transaccional que inspecciona esquemas existentes y evita colisiones destructivas.
