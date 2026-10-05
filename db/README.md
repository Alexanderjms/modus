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

Implementación local server-only mediante `node:sqlite` nativo (requiere Node.js >= 22.5.0; probado en v24.21.0). No instala dependencias adicionales.

> **Aviso de arquitectura y límites:**
> En Next.js, `node:sqlite` se ejecuta exclusivamente en el runtime del servidor (Node.js). La base de datos reside en la máquina del host donde corre el proceso de Node.js, **no en el navegador del cliente**. Solo reside en el dispositivo del usuario final cuando la aplicación y su servidor se ejecutan localmente en su propia máquina.
> La UI actual no está conectada a esta persistencia (la integración con UI/APIs está pendiente).
> El PIN opcional actúa como bloqueo lógico a nivel de aplicación mediante hash scrypt y rechazo de texto plano (`CHECK`); **no constituye cifrado a nivel de archivo de la base de datos SQLite**.

## Archivo y Ubicación

- Base de datos física: `.local/modus.sqlite` (ignorado por Git, incluyendo posibles ficheros auxiliares `.sqlite-wal` / `.sqlite-shm`).
- Ruta configurable opcional mediante variable de entorno `MODUS_SQLITE_PATH`.

## Comandos

```bash
node db/local/migrate.cjs

```

## Archivos

- `db/local/schema.sql` — Esquema SQLite local adaptado: tabla `usuarios` con `id, nombre, pin_hash, fecha_creacion, ultimo_acceso` (sin correo, contrasena ni rol). Resto de tablas, índices y catálogos idénticos a Turso.
- `db/local/db.cjs` — Helper de conexión y apertura de base de datos con `PRAGMA foreign_keys = ON;`.
- `db/local/pin.cjs` — Validador y utilidades `hashPin` / `verifyPin` reutilizando scrypt de `db/password.cjs`.
- `db/local/migrate.cjs` — Script de migración transaccional que inspecciona esquemas existentes y evita colisiones destructivas.
