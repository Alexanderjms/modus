# Base de datos (Turso / libSQL)

Esquema y utilidades backend. No requiere dependencias: usa la HTTP Pipeline API
de Turso con `fetch` nativo y `node:crypto`.

## Comandos

```bash
node --env-file=.env db/migrate.cjs

```

Requiere `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` en `.env` (ignorado por git). La búsqueda web del chat también requiere `TAVILY_API_KEY`.
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

### `PATCH /api/projects/[id]`
- **Seguridad:** Requiere Host/Origin loopback y no cross-site. Límite de payload de 8KB, `Content-Type: application/json`.
- **Parámetros:** `id` entero estrictamente positivo (safe integer).
- **Payload JSON:** Objeto parcial no vacío con campos permitidos (`nombre?`, `descripcion?`, `icono?`, `estado?`). Valida únicamente los campos presentes y rechaza payloads vacíos o con claves desconocidas. `estado: null` permitido.
- **Respuesta 200:** `{ "project": Project }` con las métricas recalculadas en base de datos.
- **Errores:**
  - `400 { "error": string }`: ID inválido, cuerpo vacío, propiedades desconocidas o valores inválidos.
  - `403 { "error": string }`: Origen no permitido.
  - `404 { "error": "Proyecto no encontrado" }`: Proyecto inexistente o ajeno al perfil.
  - `409 { "error": string }`: Perfil local no configurado o inconsistente.
  - `500 { "error": string }`: Error interno del servidor.

### `DELETE /api/projects/[id]`
- **Seguridad:** Requiere Host/Origin loopback y no cross-site.
- **Parámetros:** `id` entero estrictamente positivo (safe integer).
- **Operación transaccional:** Elimina el proyecto y sus `listas_tareas`, `tareas`, `subtareas` y `tarea_etiquetas` vinculadas de forma segura sin eliminar catálogos (`estados`, `prioridades`, `etiquetas`), usuarios ni proyectos de otros registros.
- **Respuesta 204:** Sin cuerpo.
- **Errores:**
  - `400 { "error": string }`: ID de proyecto inválido.
  - `403 { "error": string }`: Origen no permitido.
  - `404 { "error": "Proyecto no encontrado" }`: Proyecto inexistente o ajeno al perfil.
  - `409 { "error": string }`: Perfil local no configurado o inconsistente.
  - `500 { "error": string }`: Error interno del servidor.

### `POST /api/projects/[id]/duplicate`
- **Seguridad:** Requiere Host/Origin loopback y no cross-site.
- **Parámetros:** `id` entero estrictamente positivo (safe integer).
- **Operación transaccional:** Duplica el proyecto copiando exclusivamente `nombre`, `descripcion`, `icono` y `estado` (sin listas ni tareas). El nombre recibe el sufijo `' (copia)'`, truncando la base para respetar el límite de 100 caracteres.
- **Respuesta 201:** `{ "project": Project }`.
- **Errores:**
  - `400 { "error": string }`: ID de proyecto inválido.
  - `403 { "error": string }`: Origen no permitido.
  - `404 { "error": "Proyecto no encontrado" }`: Proyecto inexistente o ajeno al perfil.
  - `409 { "error": string }`: Perfil local no configurado o inconsistente.
  - `500 { "error": string }`: Error interno del servidor.

## Archivos

- `db/local/schema.sql` — Esquema SQLite local adaptado: tabla `usuarios` con `id, nombre, pin_hash, fecha_creacion, ultimo_acceso` (sin correo, contrasena ni rol). Tabla `proveedor_claves` para almacenamiento cifrado de API keys locales. Resto de tablas, índices y catálogos idénticos a Turso.
- `db/local/db.cjs` — Helper de conexión y apertura de base de datos con `PRAGMA foreign_keys = ON;`.
- `db/local/pin.cjs` — Validador y utilidades `hashPin` / `verifyPin` reutilizando scrypt de `db/password.cjs`.
- `db/local/credentials.cjs` — Adaptador de cifrado Windows DPAPI (`DataProtectionScope.CurrentUser`) mediante subproceso nativo PowerShell (sin dependencias, comunicación exclusiva vía `stdin`/`stdout`, timeout y límites de buffer).
- `db/local/providers.cjs` — Helper de resolución de estado de proveedores de IA y desencriptado server-only de API keys por usuario.
- `db/local/chat.cjs` — Conexión con proveedores de IA (discovery, parsing de respuestas de las familias OpenCode, Google Native, Bedrock Mantle y OpenAI-compatible, mitigación SSRF, timeouts y límites de tamaño). El chat devuelve una respuesta JSON completa, sin streaming hacia el navegador.
- `db/local/migrate.cjs` — Script de migración transaccional que inspecciona esquemas existentes y evita colisiones destructivas.

## API de Chat y Modelos Local (`/api/chat`)

### `GET /api/chat/models`
- **Seguridad:** Requiere Host/Origin loopback y no cross-site.
- **Parámetros:** `provider` (obligatorio, id de proveedor válido) y `region` (obligatorio para Bedrock, validado contra lista de regiones permitidas de Mantle).
- **Respuesta 200:** `Cache-Control: no-store`, `{ "models": [{ "id": string, "name": string, "protocol": "chat-completions" | "responses" | "messages" | null, "source"?: "go" | "zen", "badge"?: "FREE" }], "warning"?: string }`.
- **Comportamiento:** Realiza discovery directo en el upstream usando la clave descifrada con DPAPI. Mapea familias conocidas de OpenCode Go (`responses`, `messages`, `chat-completions`), modelos desconocidos retornan `protocol: null` para selección explícita en frontend. Para el proveedor `opencode`, combina el catálogo de Go (`https://opencode.ai/zen/go/v1/models`) con los modelos gratuitos y compatibles de OpenCode Zen (`https://opencode.ai/zen/v1/models`), prefijados como `zen:<raw-id>`, `source: "zen"` y `badge: "FREE"` (excluye modelos de pago y Jev `/systemone`; Muse Spark Free usa `responses`). Si Zen falla, devuelve los modelos de Go y un campo `warning` parcial sin bloquear el chat. Google maneja paginación hasta agotar o llegar a 10000 modelos. Presupuesto total de timeout de discovery compartido (~30s).

### `POST /api/chat`
- **Seguridad:** Requiere Host/Origin loopback, no cross-site, `Content-Type: application/json`, límite de 128KB en body.
- **Payload:** `ChatRequest` valida pertenencia al perfil local, `model`, `provider` y de 1 a 40 mensajes con roles alternados, comenzando y terminando con `user`. Cada mensaje de usuario admite 4000 caracteres; el historial de asistente y el total admiten 80000. El PIN todavía no constituye un flujo de desbloqueo. Se acepta opcionalmente `webSearch` booleano para compatibilidad retrospectiva, pero la decisión de buscar en la web la toma el propio modelo internamente sin depender de la UI.
- **Conversaciones:** El motor de inferencia no guarda historial por sí mismo. La interfaz guarda cada respuesta recibida mediante `/api/chats`, aislada por proyecto, y permite recuperar conversaciones al recargar. La IA no modifica tareas automáticamente. La generación se limita a 4096 tokens de salida; el consumo depende del proveedor y el modelo.
- **Respuesta (NDJSON streaming):** Formato `Content-Type: application/x-ndjson; charset=utf-8`.
  - Los modelos deben ceñirse estrictamente al formato envelope (`action: "answer"` o `action: "search"`). Si el modelo devuelve un formato inválido o no estructurado, el servidor emite de forma honesta y controlada `{"type":"error","error":"El modelo no emitió una decisión o respuesta estructurada válida.","status":502}` sin exponer envelopes ni texto interno sin validar.
  - Flujo de eventos:
    1. `{"type":"thinking"}`: Mientras el modelo evalúa la consulta con el contexto del proyecto, su cobertura declarada y el contenido acotado de los recursos disponibles. La descarga real de enlaces cargados también puede emitir `{"type":"searching"}` antes de esta evaluación.
    2. Si el modelo responde directamente sin requerir web externa: se reutiliza su respuesta y se emite directamente `{"type":"complete","message":{"role":"assistant","content":string}}` (exactamente 1 llamada a inferencia).
    3. Si el modelo solicita búsqueda externa:
       - Si no está configurado `TAVILY_API_KEY`: emite `{"type":"error","error":string,"status":503}` sin hacer llamadas innecesarias ni simular progreso.
       - Si está configurado: valida que la consulta sea pública, sin tokens ni secretos y acotada a máx. 120 caracteres. Emite `{"type":"searching"}` de inmediato y ejecuta como máximo 1 búsqueda concisa en Tavily.
       - Seguido de `{"type":"thinking"}` para la inferencia contextualizada final (máximo 2 llamadas a inferencia en total).
       - Finalmente `{"type":"complete","message":{"role":"assistant","content":string}}`.
- **Mapeo y Protocolos:**
  - `opencode`: Soporta familias `/responses` (`store: false`), `/messages` (`anthropic-version: 2023-06-01`), y `/chat/completions`. Los modelos Go se enrutan a `https://opencode.ai/zen/go/v1`. Los modelos OpenCode Zen (`zen:<raw-id>`) se enrutan automáticamente a `https://opencode.ai/zen/v1` extrayendo el ID nativo sin prefijo. Ambos usan la misma clave con cabeceras `Authorization: Bearer <key>` y `x-opencode-session`. No sondea ni reintenta entre protocolos.
  - `google`: Endpoint nativo `/models/{model}:generateContent` con `systemInstruction` y filtrado de `thought` y bloqueos de seguridad.
  - `bedrock`: Bedrock Mantle `/responses` con `store: false`.
  - Otros (`groq`, `cerebras`, `openrouter`, `deepinfra`, `nvidia`): `/chat/completions`.
- **Errores:**
  - `400`: Payload inválido, modelo no disponible, o protocolo no coincidente.
  - `403`: Origen no permitido.
  - `404`: Proyecto inexistente o ajeno.
  - `409`: Falta perfil local o clave de proveedor no configurada.
  - `422`: Clave o permisos inválidos reportados por upstream (sin filtrar secretos en mensaje).
  - `429`: Rate limit en upstream.
  - `502`: Error o respuesta malformada del upstream.
  - `504`: Timeout con el upstream (30s en discovery, 90s en chat).


## API de Proveedores IA Local (`/api/providers`)

### Almacenamiento seguro y consideraciones criptográficas

- **Mecanismo:** Las API keys se cifran utilizando **Windows DPAPI** (`[System.Security.Cryptography.ProtectedData]::Protect` con ámbito `CurrentUser`).
- **Secretos:** Nunca se exponen por endpoints HTTP, nunca se devuelven en respuestas GET/PUT, no se imprimen en logs y nunca se escriben en argumentos de línea de comandos ni en ficheros temporales.
- **Base de datos SQLite:** La columna `clave_cifrada` almacena estrictamente el blob DPAPI codificado en Base64. Copiar o mover el archivo `.sqlite` a otra máquina u otro usuario de Windows **no permite descifrar las claves** debido al ligamiento criptográfico de DPAPI con las credenciales del usuario de Windows.
- **PIN local:** El PIN del perfil de Modus se almacena como hash scrypt; el flujo de desbloqueo aún no está implementado. **No cifra ni deriva las claves de proveedores**.
- **Límite de protección:** DPAPI protege las claves en reposo, no frente a procesos con acceso a la misma cuenta de Windows ni frente a un equipo comprometido. La conexión efectiva con proveedores de IA sigue pendiente.

### Endpoints

#### `GET /api/providers`
- **Seguridad:** Requiere Host/Origin loopback y no cross-site.
- **Headers de respuesta:** `Cache-Control: no-store`.
- **Respuesta 200:**
  ```json
  {
    "providers": [
      { "id": "bedrock", "configured": false },
      { "id": "cerebras", "configured": false },
      { "id": "deepinfra", "configured": false },
      { "id": "google", "configured": false },
      { "id": "groq", "configured": true },
      { "id": "nvidia", "configured": false },
      { "id": "opencode", "configured": false },
      { "id": "openrouter", "configured": false }
    ],
    "storage": {
      "kind": "windows-dpapi",
      "available": true
    }
  }
  ```
- **Errores:**
  - `403`: Origen no permitido.
  - `409`: Perfil local no configurado.
  - `500`: Error interno del servidor.

#### `PUT /api/providers`
- **Seguridad:** Requiere Host/Origin loopback y no cross-site. Límite de payload de 40KB, `Content-Type: application/json`.
- **Headers de respuesta:** `Cache-Control: no-store`.
- **Payload JSON:**
  ```json
  {
    "keys": {
      "groq": "gsk_...",
      "openrouter": null
    }
  }
  ```
  - Cada clave provista debe pertenecer a la allowlist (`bedrock`, `cerebras`, `deepinfra`, `google`, `groq`, `nvidia`, `opencode`, `openrouter`).
  - Un valor `string` (no vacío, máx. 4096 caracteres) se cifra atómicamente con DPAPI y se inserta o actualiza.
  - Un valor `null` elimina la clave para ese proveedor.
  - Payloads sin campo `keys`, con `keys` vacío, proveedores desconocidos o tipos inválidos son rechazados con `400`.
- **Atomicidad:** Todas las claves son pre-cifradas antes de iniciar la transacción en SQLite. Ante cualquier fallo de cifrado o de base de datos, la transacción se aborta (`ROLLBACK`) sin corromper ni sobrescribir los valores existentes.
- **Respuesta 200:** Misma estructura que `GET /api/providers` reflejando los flags actualizados.
- **Errores:**
  - `400`: Error de validación en payload.
  - `403`: Origen no permitido.
  - `409`: Perfil local no configurado.
  - `501`: Plataforma no soportada (sistemas operativos distintos a Windows `win32`).
  - `500`: Error interno en el subsistema de cifrado o base de datos.

## API de Historial de Chats Local (`/api/chats`)

Persistencia local de conversaciones asociadas a un proyecto. Cada conversación almacena sus mensajes en una columna JSON de texto validada (`mensajes`), con metadatos del modelo/proveedor seleccionado y control de concurrencia optimista (CAS) mediante `revision`.

- **Almacenamiento:** Tabla `chats` en SQLite local con clave foránea `proyecto_id REFERENCES proyectos(id) ON DELETE CASCADE`. Al eliminar un proyecto se limpian automáticamente sus chats. La duplicación de proyectos no clona el historial. No requiere Windows DPAPI; usa SQLite local estándar.
- **Privacidad:** Los mensajes se guardan como texto en SQLite; el cifrado DPAPI protege las API keys, no el historial. Los chats que solo vivían en memoria antes de esta función no pueden recuperarse después de una recarga.
- **Evolución del esquema:** `ensureChatsTable` crea automáticamente la tabla y sus índices en bases de datos existentes de forma aditiva y transaccional sin pérdida de datos.
- **Generación de títulos:** Título automático a partir del primer mensaje del usuario (primeros 60 caracteres normalizados de espacios) o `'Nuevo chat'` si aún no hay mensajes.
- **Límites de seguridad:** `Content-Type: application/json`, tamaño máximo de payload de 512 KB, límite de 40 mensajes por chat, máximo 4.000 caracteres por mensaje de usuario, máximo 80.000 caracteres por mensaje de asistente, y hasta 200.000 caracteres en contenido total acumulado.

### Endpoints

#### `GET /api/chats?projectId={id}`
- **Seguridad:** Requiere Host/Origin loopback, no cross-site.
- **Parámetros:** `projectId` entero positivo obligatorio. Valida que el proyecto exista y pertenezca al usuario activo (404 si es inexistente o ajeno).
- **Headers:** `Cache-Control: no-store`.
- **Respuesta 200:** `{ "chats": ChatSummary[] }` ordenados por `actualizado_en DESC, id DESC`. No incluye la columna `messages`.

#### `POST /api/chats`
- **Seguridad:** Requiere Host/Origin loopback, no cross-site.
- **Payload JSON:** `{ "projectId": number }` exacto (rechaza campos adicionales).
- **Respuesta 201:** `{ "chat": ChatConversation }` inicializado con `revision: 0`, `title: "Nuevo chat"`, `messages: []` y metadatos de inferencia en `null`.

#### `GET /api/chats/[id]?projectId={id}`
- **Seguridad:** Requiere Host/Origin loopback, no cross-site.
- **Parámetros:** `id` del chat y `projectId` (query param) requeridos. Valida pertenencia de proyecto al usuario y pertenencia del chat al proyecto especificado (404 si hay discrepancia).
- **Respuesta 200:** `{ "chat": ChatConversation }`.
#### `PUT /api/chats/[id]?projectId={id}`
- **Seguridad:** Requiere Host/Origin loopback, no cross-site. Límite de 512 KB en cuerpo JSON.
- **Payload JSON:** `SaveChatRequest`:
  - `revision`: Entero seguro `>= 0` (CAS).
  - `messages`: Lista de objetos `{ role: "user" | "assistant", content: string }`. Puede estar vacío o contener pares completos alternados (`user` seguido de `assistant`).
  - `provider`: Uno de los 8 proveedores permitidos en allowlist.
  - `model`: String sin caracteres de control, máx. 1000 caracteres.
  - `protocol`: Uno de `"chat-completions"`, `"responses"`, `"messages"`, o `null`.
  - `region`: String de región (obligatoria y validada contra allowlist para `bedrock`), o `null`.
- **Atomicidad y Concurrencia:** Actualización transaccional mediante `UPDATE ... WHERE id = ? AND proyecto_id = ? AND revision = ?`. Si `revision` no coincide con la versión en base de datos, retorna `409` (`"La conversación cambió. Recárgala antes de guardar."`) sin sobreescribir los datos actuales. En caso de éxito, incrementa `revision` en 1 y actualiza `actualizado_en`.
- **Respuesta 200:** `{ "chat": ChatConversation }`.

## API de Tareas Kanban Local (`/api/tasks`)

Persistencia local de tareas asociadas a las 3 columnas fijas del tablero Kanban ('Por hacer', 'En progreso', 'Terminado').

- **Auto-seed idempotente de listas:** Al consultar o crear tareas para un proyecto, se asegura automáticamente la existencia de las 3 listas predeterminadas (`listas_tareas`) del proyecto ('Por hacer', 'En progreso', 'Terminado') con sus estados asociados si aún no existen.
- **Mapeo de columnas Kanban:**
  - `0`: "POR HACER" (lista 'Por hacer', estado 'Pendiente')
  - `1`: "EN PROGRESO" (lista 'En progreso', estado 'En curso')
  - `2`: "TERMINADO" (lista 'Terminado', estado 'Completada')
- **Límites de seguridad:** Solo loopback (`localhost`, `127.0.0.1`, `[::1]`), rechaza peticiones `cross-site` con `403`. Todas las respuestas incluyen cabecera `Cache-Control: no-store`. Payload JSON de máx. 8 KB. Título máx. 255 caracteres recortados.

### Endpoints

#### `GET /api/tasks?projectId={id}`
- **Seguridad:** Requiere loopback, pertenencia del proyecto al usuario activo local (404 si es ajeno o inexistente, 409 si no hay perfil configurado).
- **Parámetros:** `projectId` entero positivo obligatorio.
- **Respuesta 200:**
  ```json
  {
    "tasks": [
      {
        "id": 1,
        "listId": 1,
        "column": 0,
        "title": "Diseñar wireframes",
        "description": null,
        "startDate": null,
        "endDate": null,
        "attachments": null,
        "priority": "Sin prioridad",
        "priorityColor": null,
        "status": "Pendiente",
        "tags": [
          { "id": 1, "name": "Frontend", "description": null }
        ],
        "subtasks": [
          { "id": 1, "title": "Wireframe móvil", "completed": false }
        ]
      }
    ]
  }
  ```

#### `POST /api/tasks`
- **Seguridad:** Requiere loopback, pertenencia del proyecto al usuario activo local.
- **Payload JSON:**
  ```json
  {
    "projectId": 1,
    "column": 0,
    "title": "Diseñar wireframes"
  }
  ```
- **Validaciones:** `column` debe ser `0`, `1` o `2`. `title` string recortado no vacío de hasta 255 caracteres.
- **Respuesta 201:**
  ```json
  {
    "task": {
      "id": 1,
      "listId": 1,
      "column": 0,
      "title": "Diseñar wireframes",
      "description": null,
      "startDate": null,
      "endDate": null,
      "attachments": null,
      "priority": "Sin prioridad",
      "priorityColor": null,
      "status": "Pendiente",
      "tags": [],
      "subtasks": []
    }
  }
  ```

#### `PATCH /api/tasks`
- **Seguridad:** Requiere loopback, pertenencia del proyecto al usuario activo local. Límite de payload de 8 KB.
- **Payload JSON:**
  ```json
  {
    "projectId": 1,
    "taskId": 1,
    "column": 2
  }
  ```
- **Validaciones:**
  - `projectId`: Entero positivo seguro.
  - `taskId`: Entero positivo seguro (identificación estricta por `id`, nunca por título).
  - `column`: `0`, `1` o `2`.
- **Comportamiento:**
  - Actualización transaccional de `lista_id` y `estado_id`.
  - Mover a la misma columna es idempotente.
  - No permite mover tareas entre proyectos diferentes (aislamiento estricto por `projectId`).
  - Conserva íntegramente las relaciones (etiquetas, subtareas) y campos de la tarea (fechas, prioridad, descripción, adjuntos).
- **Respuesta 200:**
  ```json
  {
    "task": {
      "id": 1,
      "listId": 3,
      "column": 2,
      "title": "Diseñar wireframes",
      "description": null,
      "startDate": null,
      "endDate": null,
      "attachments": null,
      "priority": "Sin prioridad",
      "priorityColor": null,
      "status": "Completada",
      "tags": [],
      "subtasks": []
    }
  }
  ```
- **Errores:**
  - `400 { "error": string }`: Entradas inválidas, JSON malformado, o columna no válida.
  - `403 { "error": string }`: Origen/Host no loopback o cross-site.
  - `404 { "error": string }`: Proyecto inexistente/ajeno o tarea no encontrada en el proyecto.
  - `409 { "error": string }`: Perfil local no configurado.
  - `500 { "error": string }`: Error interno del servidor.

### Subtareas y Evolución del Esquema

- **Modelo checklist simplificado:** Cada subtarea consta exclusivamente de `id`, `tarea_id`, `nombre` (expuesto en la API como `title`) y `completada` (`INTEGER NOT NULL DEFAULT 0 CHECK(completada IN (0, 1))`, mapeado al DTO como booleano `completed`).
- **Contrato DTO:**
  - Lectura: `{ id: number, title: string, completed: boolean }`.
  - Mutación (`PATCH /api/tasks`): `{ id?: number, title: string, completed?: boolean }[]`.
  - Si una nueva subtarea omite `completed`, toma el valor por defecto `false`.
  - Si una subtarea existente (con `id`) omite `completed`, se preserva estrictamente su estado actual en base de datos.
  - La API valida en la frontera de confianza que `completed` sea estrictamente `boolean` si está presente, rechazando `null`, `string` o `number`.
- **Campos retirados:** Las propiedades `description` y `status`/`statusId` en subtareas ya no existen en el esquema ni son soportadas en los payloads de creación/edición (retornan error de validación `400` para evitar fingir guardado silencioso).
- **Compatibilidad con bases de datos legadas y migración aditiva:**
  - Si la base de datos local contiene columnas legadas (`descripcion`, `estado_id`), el backend opera sin alterarlas.
  - `applySchema(db)` añade de forma aditiva e idempotente la columna `completada` si no existe (`ALTER TABLE subtareas ADD COLUMN completada INTEGER NOT NULL DEFAULT 0 CHECK(completada IN (0, 1))`), sin destruir datos ni requerir migración manual.
- **Migración opt-in reconstructiva:**
  - Para consolidar el esquema en bases de datos existentes eliminando físicamente las columnas obsoletas (`descripcion`, `estado_id`), se requiere ejecución opt-in explícita:
    ```bash
    node db/local/migrate.cjs --migrate-subtasks
    ```
  - La migración es atómica y transaccional (`BEGIN`/`COMMIT`), preserva íntegramente `id`, `tarea_id`, `nombre`, `completada` (y en tablas legadas sin `completada`, mapea `estado_id` a `1` si el nombre normalizado del estado era `'completada'`), conservando las relaciones de tareas (`ON DELETE CASCADE`), y es estrictamente idempotente. Abrir la base de datos o ejecutar la migración estándar (`node db/local/migrate.cjs` sin flag) **nunca** altera destructivamente ni purga datos existentes.

---

# Sistema de Grafo de Proyecto y Registro de Eventos Atómicos

El subsistema backend en `db/local/project-graph.cjs` y sus endpoints asociados derivan la estructura del proyecto como un grafo y mantienen un historial de eventos atómico append-only sin introducir dependencias externas.

## Grafo de Proyecto Derivado (`GET /api/projects/[id]/graph`)
- **Seguridad:** Requiere validación de loopback, resolución de usuario único local y pertenencia estricta de proyecto (`404` si es ajeno o no existe).
- **Fuente de verdad:** Nodos y aristas derivados exclusivamente de registros y relaciones FK oficiales existentes (`proyectos`, `listas_tareas`, `tareas`, `subtareas`, `tarea_etiquetas`, `proyecto_contexto`, `proyecto_archivos`).
- **Sin inventar relaciones:** No se realizan inferencias semánticas ni extracción de dependencias por lenguaje de texto; las aristas representan únicamente vínculos relacionales reales (`contains`, `has_subtask`, `tagged_with`, `has_context`, `mandates`, `references`, `has_file`).
- **Seguridad de datos:** El grafo expone solo metadatos de archivos. Para el chat, los archivos de texto admitidos pueden aportar extractos de su contenido; nunca se envían los BLOB completos ni archivos de otros proyectos.

## Registro de Eventos Atómicos (`proyecto_eventos`)
- **Tabla append-only:** `proyecto_eventos` registra `(proyecto_id, actor_usuario_id, entidad_tipo, entidad_id, accion, datos, creado_en)`.
- **Cobertura exhaustiva mediante triggers SQLite:**
  - Inserciones, actualizaciones sustanciales y eliminaciones en `tareas`, `subtareas`, `tarea_etiquetas`, `proyecto_contexto`, `proyecto_archivos` y `chats` se capturan de forma atómica y transaccional en todos los flujos de escritura (creación, edición, arrastre Kanban, duplicación, etc.).
  - Las operaciones que no modifican datos relevantes (no-ops) no generan eventos espurios.
  - El borrado de proyectos limpia en cascada (`ON DELETE CASCADE`) todos los eventos asociados, previniendo registros huérfanos.
  - Nunca se registran secretos, claves de proveedores ni contenidos binarios BLOB.

## Compilador de Contexto para Modelos de IA (`compileProjectContext`)
- **Presupuesto determinístico (`maxBudgetChars`):** Tamaño máximo de caracteres documentado (por defecto 12.000 caracteres) sin contar tokens de forma heurística o imprecisa.
- **Reglas obligatorias:** Las directivas de negocio en `proyecto_contexto.reglas` tienen prioridad absoluta y no se truncan en silencio; si superan el presupuesto asignado, la compilación falla con error controlado.
- **Cobertura explícita:** El contexto informa si el snapshot kanban es completo o parcial (`coverage.isComplete`, `includedSummaryTasks`, `truncatedSummaryTasks`) y delimita los datos para evitar que instrucciones no confiables del usuario actúen como comandos privilegiados.
- **Integración con System Prompt:** `buildSystemPrompt` establece un contrato de rigor con el modelo: distinguir hechos confirmados de hipótesis, citar tareas existentes mediante `[tarea:id]`, no alucinar herramientas ni accesos directos inexistentes, y pedir aclaraciones cuando sea necesario.
- **Alcance actual y límites conocidos:** Se trata de un mecanismo de recuperación y compilación previa de contexto (retrieval previo determinístico snapshot), no de un agente autónomo de lectura o ejecución de tools dinámicas.

## Lectura de recursos en el chat
- Los archivos de texto del proyecto (Markdown, texto, JSON, CSV y código fuente común) aportan extractos al modelo antes de su primera respuesta. PDF, imágenes y binarios no se interpretan como texto.
- Se consideran hasta 10 archivos y 3 enlaces públicos HTTPS. El bloque completo de recursos está limitado a 8.000 caracteres, con hasta 4.000 por recurso y notas de omisión o recorte.
- Un enlace a la raíz de un repositorio GitHub permite leer su `README.md`; no equivale a recorrer ni auditar todo el repositorio.
- Las descargas validan las direcciones IP, fijan la resolución DNS y revalidan las redirecciones. No envían credenciales ni cookies. El presupuesto total de red es de 10 segundos y se cancela junto con la petición del chat.
- Los contenidos son datos no privilegiados. Los fallos de lectura se informan al modelo y no autorizan a afirmar que un recurso fue leído. Los enlaces pueden reutilizarse desde una caché de proceso durante cinco minutos.

## Etiquetas por proyecto
- Cada etiqueta pertenece a un proyecto. Su edición o eliminación afecta únicamente a las tareas de ese proyecto; quitarla de una tarea no elimina la etiqueta.
- `PATCH /api/projects/{projectId}/tags/{tagId}` acepta `{name, color}`; `DELETE` en la misma ruta elimina la etiqueta y sus asociaciones, previa confirmación en la interfaz.
- La inicialización migra el catálogo global anterior en una transacción: conserva una copia independiente de cada etiqueta para cada proyecto existente y reasigna sus asociaciones. Los proyectos nuevos no heredan ese catálogo antiguo.

## Propuestas de tareas en el chat
- El asistente puede devolver hasta tres sugerencias estructuradas por mensaje. Permanecen en el historial y no son tareas del proyecto hasta su aceptación explícita.
- «Aceptar» abre una revisión editable de nombre, descripción, prioridad y subtareas. «Descartar» solo guarda esa decisión en la conversación.
- `POST /api/chats/{chatId}/suggestions/{suggestionId}/accept` crea la tarea en «Por hacer» y actualiza la conversación en una misma transacción. Los reintentos para la misma sugerencia no crean duplicados, incluso si la tarea aceptada se elimina después.
- Los mensajes anteriores mantienen compatibilidad. Para inferencia solo se envían los campos `role` y `content`; las sugerencias estructuradas se conservan al guardar el historial.
- Las propuestas pueden incluir hasta diez etiquetas por nombre y color opcional. Al crear una tarea se guardan junto con sus demás campos.
- Una propuesta `kind: "add-tags"` referencia una tarea existente con `targetTaskId`. Su aceptación recibe únicamente `{tags}` y añade esas etiquetas sin quitar las actuales ni cambiar nombre, descripción, prioridad o subtareas. La tarea debe pertenecer al proyecto del chat; las etiquetas existentes conservan su color y los reintentos son idempotentes.
