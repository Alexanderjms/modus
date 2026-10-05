
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
  archivos_enlaces TEXT
);

CREATE TABLE IF NOT EXISTS subtareas (
  id INTEGER PRIMARY KEY,
  tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  estado_id INTEGER REFERENCES estados(id)
);

CREATE TABLE IF NOT EXISTS tarea_etiquetas (
  tarea_id INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  etiqueta_id INTEGER NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
  PRIMARY KEY (tarea_id, etiqueta_id)
);

CREATE INDEX IF NOT EXISTS idx_proyectos_usuario ON proyectos(usuario_id);

CREATE INDEX IF NOT EXISTS idx_listas_proyecto ON listas_tareas(proyecto_id);

CREATE INDEX IF NOT EXISTS idx_tareas_lista ON tareas(lista_id);

CREATE INDEX IF NOT EXISTS idx_subtareas_tarea ON subtareas(tarea_id);

INSERT OR IGNORE INTO prioridades (nombre) VALUES ('Alta'), ('Media'), ('Baja'), ('Sin prioridad');

INSERT OR IGNORE INTO estados (nombre) VALUES ('Pendiente'), ('En curso'), ('Completada'), ('Bloqueada'), ('Cancelada');
