# Proyecto y workspace de Modus

## Alcance

Inventario de `ref/01 · Workspace — Chat · Kanban · Plan-export.html`.

Un proyecto reúne **chat con IA, kanban, contexto y plan del proyecto**. Este documento describe la referencia visual, no funcionalidades ya implementadas: el HTML es una maqueta sin lógica de aplicación, persistencia ni conexión real con una IA.

## 1. Organización del workspace

- Navegación lateral: Inicio, Proyectos, Tareas, Configuración y perfil.
- Cabecera: selector del proyecto activo y búsqueda dentro del proyecto.
- Chat con IA.
- Tablero kanban central.
- Panel de contexto.
- Panel del plan del proyecto.
- Separadores entre paneles y controles visuales para plegar u ocultar paneles.

La referencia contiene composiciones repetidas de la misma interfaz; no deben contabilizarse como funciones adicionales. No demuestra redimensionado interactivo de paneles.

## 2. Información del proyecto

| Campo | Ejemplo de la referencia |
| --- | --- |
| Nombre | Observatorio Regional |
| Descripción | Plataforma para la gestión de investigadores, organizaciones y proyectos de investigación en la región. |
| Objetivo | Facilitar la colaboración y el acceso a información científica regional. |
| Stack | Next.js, PostgreSQL y TypeScript |

Estos campos aparecen en Información general, dentro del resumen del plan, con acción **Editar**. No se muestra el formulario de edición ni su guardado.

## 3. Chat con IA del proyecto

### Propósito y elementos

Conversar sobre el proyecto, agregar tareas, pedir planes y resolver dudas.

- Título «Chat con IA» y descripción.
- Mensajes del usuario y respuestas de la IA.
- Avatar del usuario con iniciales.
- Propuestas de tareas dentro de la conversación.
- Control para plegar el panel.
- Zona para escribir un mensaje y acción de adjuntar.
- Botón de enviar.
- Ayuda: **Enter para enviar · Shift+Enter para salto de línea**.

No se especifica modelo ni proveedor. El envío, los adjuntos y las respuestas son elementos representados, no comportamientos comprobados.

### Propuestas y aprobación

- Título de propuesta, contador y estado «Pendiente».
- Agrupación por prioridad alta y media.
- Títulos, prioridades y subtareas.
- Casillas visuales de selección.
- Acciones **Descartar** y **Aplicar 6 tareas**.
- Propuesta individual con **Descartar** y **Agregar**.

Regla explícita de la vista: **«Estos cambios no forman parte del proyecto hasta que los apruebes»**. La maqueta no ejecuta la incorporación.

Ejemplo de propuesta:

- **Testing del módulo Investigadores**, prioridad alta:
  - Probar cambio de universidad.
  - Validar actualización de organizaciones.
  - Probar filtros de búsqueda.
  - Revisar casos con datos vacíos.
  - Corregir errores encontrados.
- **Documentar resultados del testing**, prioridad media:
  - Crear documento de pruebas.
  - Registrar hallazgos.
- Propuesta posterior: **Revisar rendimiento de consultas**, prioridad media.

El contador «6» es un dato de la maqueta; no define una regla consistente para contar tareas y subtareas.

## 4. Tablero kanban

### Cabecera y acciones

- Título «Tablero Kanban».
- Descripción: «Gestiona y visualiza el progreso de tus tareas».
- **Nueva tarea**.
- **Filtrar**.
- Menú de más opciones.
- **Agregar tarea** al final de cada columna.

No se muestran formularios de creación, opciones del filtro ni contenido del menú.

### Columnas

| Columna | Contador de ejemplo |
| --- | --- |
| Backlog | 6 |
| Por hacer | 3 |
| En progreso | 3 |
| Terminado | 14 |

### Contenido de las tarjetas

- Título.
- Etiquetas: Backend, Rendimiento, Infraestructura, Investigación, UI/UX, Datos, Investigadores, Testing, Bug y Documentación, entre las visibles.
- Prioridad **alta, media o baja**.
- Iniciales de la persona asignada.
- Contador opcional de subtareas completadas/total.
- Indicadores visuales de progreso en algunas tarjetas.
- Estado representado por la columna.

Las tarjetas terminadas son compactas, con marca de completado y fecha relativa como «Ayer» o «Lun».

### Tareas visibles de ejemplo

| Columna | Tarea | Prioridad | Subtareas | Asignado |
| --- | --- | --- | --- | --- |
| Backlog | Optimizar consultas de organizaciones | Baja | 0/3 | MG |
| Backlog | Agregar logs de auditoría | Media | 0/4 | JL |
| Backlog | Investigación: librería de gráficos | Baja | — | AR |
| Backlog | Migrar informes a la nueva API | Media | 0/2 | CP |
| Backlog | Definir criterios de accesibilidad | Baja | — | AL |
| Backlog | Investigar integración con ORCID | Baja | — | AR |
| Por hacer | Testing del módulo Investigadores | Alta | 0/5 | AL |
| Por hacer | Revisar rendimiento de consultas | Media | — | MG |
| Por hacer | Validar exportación de datos | Media | 1/3 | JL |
| En progreso | Corregir error en organizaciones | Alta | 2/4 | AL |
| En progreso | Documentar resultados de testing | Media | 1/2 | AL |
| En progreso | Diseñar estructura de pruebas | Media | 0/2 | JL |

En Terminado aparecen:

- Configurar entorno de testing — Ayer.
- Crear cuentas de prueba — Ayer.
- Revisar casos de uso — Lun.
- Instalar dependencias — Lun.
- Acción **Ver 10 tareas más**.

### Funciones no demostradas

La referencia no implementa arrastrar y soltar, mover tarjetas, editar o eliminar tareas, abrir su detalle, marcar subtareas ni cambiar asignaciones. Tampoco muestra una ficha con descripción, comentarios, adjuntos o fecha límite. No deben darse por existentes.

## 5. Contexto del proyecto

Panel descrito como **«Información que la IA tendrá en cuenta»**.

### Contexto descriptivo

El ejemplo explica que el Observatorio Regional centraliza información de investigación científica de universidades de Centroamérica y facilita la colaboración y el acceso a información científica regional.

- Texto resumido.
- Acción **Ver más**.
- Acción **Editar contexto**.
- Control para ocultar el panel.

### Reglas a seguir

Se muestran cuatro de siete reglas:

1. Dividir funcionalidades grandes en subtareas.
2. Priorizar correcciones antes de nuevas funcionalidades.
3. Utilizar TypeScript para código nuevo.
4. No sugerir fechas límite automáticamente.

Acción **Ver todas (7)**. Las otras tres reglas no se especifican.

### Recursos

- **Documentación API** — `docs.proyecto.com`.
- **Diseño principal** — Figma.
- **requerimientos.pdf** — PDF de 2.4 MB.
- Acción **Ver todos (6)**.

Solo tres recursos son visibles. No se demuestra gestión de archivos, lectura de enlaces ni indexación automática para la IA.

## 6. Plan del proyecto

### Navegación

- Título «Plan del proyecto» y nombre del proyecto activo.
- Pestañas **Resumen**, **Estructura**, **Cronograma** y **Notas**.

Solo **Resumen** muestra contenido. Las demás pestañas no tienen contenido definido en esta referencia.

### Resumen

Incluye información general editable, progreso, próximos hitos y plan sugerido para hoy.

#### Progreso general

- Porcentaje y barra de progreso.
- Tareas completadas frente al total.
- Distribución por estados.

Ejemplo: **35% · 14 de 40 tareas completadas**.

| Estado | Cantidad del panel de plan |
| --- | --- |
| Por hacer | 5 |
| En progreso | 3 |
| Terminado | 14 |
| Backlog | 18 |

Los contadores no coinciden con todos los del kanban. Son datos de maqueta; no prueban sincronización ni una fórmula implementada.

#### Próximos hitos

Acción visual **Hito**, títulos y contadores de avance:

| Hito | Avance |
| --- | --- |
| Módulo de investigadores completo | 3/6 |
| Testing general de la aplicación | 1/8 |
| Despliegue en producción | 0/5 |

No se define cómo se vinculan tareas con hitos ni cómo se actualiza el avance.

#### Plan sugerido para hoy

- Acción **Generar nuevo**.
- Tareas sugeridas y estimaciones individuales.
- Total de tareas y tiempo estimado.

| Tarea | Estimación |
| --- | --- |
| Probar cambio de universidad | ~30 min |
| Validar actualización organizaciones | ~45 min |
| Revisar filtros de búsqueda | ~40 min |
| Revisar rendimiento de consultas | ~1 h |

Resumen: **4 tareas · Tiempo estimado ≈ 2 h 55 min**. No se demuestra generación real ni criterio de selección.

## 7. Relación entre las partes

```text
Proyecto activo
├── Información general: nombre, descripción, objetivo y stack
├── Chat IA: conversación y propuestas pendientes de aprobación
├── Kanban: tareas por estado y subtareas
├── Contexto: descripción, reglas y recursos para la IA
└── Plan: resumen, progreso, hitos y sugerencias para hoy
```

La intención representada es que la IA ayude a organizar el proyecto con su contexto, que las propuestas requieran aprobación y que el plan resuma el trabajo. El HTML no implementa el intercambio ni la sincronización entre paneles.

## 8. Aspectos pendientes de especificar

- Modelo/proveedor de IA y credenciales.
- Backend, base de datos y persistencia local/remota.
- Autenticación, permisos y colaboración multiusuario.
- Historial de conversaciones y cambios de tareas.
- Reglas para mover, completar, editar o eliminar tareas.
- Formularios de creación y edición.
- Contenido de Estructura, Cronograma y Notas.
- Interacciones de paneles y comportamiento responsive.
- Estados de carga, error y ausencia de datos.

Estos puntos no son funciones confirmadas por la maqueta.
