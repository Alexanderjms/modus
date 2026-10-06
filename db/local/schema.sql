
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  pin_hash TEXT CHECK (pin_hash IS NULL OR pin_hash LIKE 'scrypt$%'),
  fecha_creacion TEXT,
  ultimo_acceso TEXT
);

CREATE TABLE IF NOT EXISTS proyectos (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  icono TEXT NOT NULL,
  estado TEXT
);

CREATE TABLE IF NOT EXISTS listas_tareas (
  id INTEGER PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  estado TEXT
);

CREATE TABLE IF NOT EXISTS prioridades (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  color TEXT,
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS estados (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS etiquetas (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  color TEXT,
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS tareas (
  id INTEGER PRIMARY KEY,
  lista_id INTEGER NOT NULL REFERENCES listas_tareas(id),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  prioridad_id INTEGER REFERENCES prioridades(id),
  estado_id INTEGER REFERENCES estados(id),
  fecha_inicio TEXT,
  fecha_fin TEXT,
  archivos_enlaces TEXT,
  posicion INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subtareas (
  id INTEGER PRIMARY KEY,
  tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  completada INTEGER NOT NULL DEFAULT 0 CHECK(completada IN (0, 1))
);

CREATE TABLE IF NOT EXISTS tarea_etiquetas (
  tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  etiqueta_id INTEGER NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
  PRIMARY KEY (tarea_id, etiqueta_id)
);

CREATE INDEX IF NOT EXISTS idx_proyectos_usuario ON proyectos(usuario_id);

CREATE INDEX IF NOT EXISTS idx_listas_proyecto ON listas_tareas(proyecto_id);

CREATE INDEX IF NOT EXISTS idx_tareas_lista ON tareas(lista_id);

CREATE INDEX IF NOT EXISTS idx_tareas_lista_posicion ON tareas(lista_id, posicion);

CREATE INDEX IF NOT EXISTS idx_subtareas_tarea ON subtareas(tarea_id);

CREATE TABLE IF NOT EXISTS proveedor_claves (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  proveedor TEXT NOT NULL,
  clave_cifrada TEXT NOT NULL,
  fecha_actualizacion TEXT NOT NULL,
  UNIQUE(usuario_id, proveedor)
);

CREATE INDEX IF NOT EXISTS idx_proveedor_claves_usuario ON proveedor_claves(usuario_id);

CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  titulo_manual INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  mensajes TEXT NOT NULL DEFAULT '[]',
  proveedor TEXT,
  modelo TEXT,
  protocolo TEXT,
  region TEXT,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chats_proyecto_actualizado ON chats(proyecto_id, actualizado_en DESC, id DESC);

CREATE TABLE IF NOT EXISTS proyecto_contexto (
  proyecto_id INTEGER PRIMARY KEY REFERENCES proyectos(id) ON DELETE CASCADE,
  contexto TEXT NOT NULL DEFAULT '',
  reglas TEXT NOT NULL DEFAULT '[]',
  recursos TEXT NOT NULL DEFAULT '[]',
  actualizado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proyecto_archivos (
  id TEXT PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  nombre_archivo TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamano INTEGER NOT NULL,
  datos BLOB NOT NULL,
  creado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proyecto_archivos_proyecto ON proyecto_archivos(proyecto_id);

CREATE TABLE IF NOT EXISTS tarea_completaciones (
  id INTEGER PRIMARY KEY,
  tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  completada_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tarea_completaciones_proyecto_fecha ON tarea_completaciones(proyecto_id, completada_en);
CREATE INDEX IF NOT EXISTS idx_tarea_completaciones_tarea ON tarea_completaciones(tarea_id);

INSERT OR IGNORE INTO prioridades (nombre) VALUES ('Alta'), ('Media'), ('Baja'), ('Sin prioridad');

INSERT OR IGNORE INTO estados (nombre) VALUES ('Pendiente'), ('En curso'), ('Completada'), ('Bloqueada'), ('Cancelada');
