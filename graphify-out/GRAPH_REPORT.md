# Graph Report - modus (2026-10-03)

## Corpus Check

- 79 files · ~179,352 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 24 file(s) not represented in the graph (top: .css 23, (none) 1)

## Summary

- 452 nodes · 706 edges · 23 communities (19 shown, 4 thin omitted)
- Extraction: 86% EXTRACTED · 13% INFERRED · 1% AMBIGUOUS · INFERRED: 92 edges (avg confidence: 0.84)
- Token cost: 120,770 input · 28,680 output

## Community Hubs (Navigation)

- Onboarding Pages & Routing
- Workspace Board & Chat
- Project Config & Dependencies
- Home & Projects Design Exports
- Projects Overview Components
- Modus Branding & Storage Concepts
- Projects Design System
- Home Dashboard Components
- Workspace Panels Design
- TypeScript Configuration
- Storage Selection Design
- Turso Connection Design
- Turso Profile Design
- Storage Selection UI
- Local Profile Design
- Completion Screen Design
- Workspace Logic
- ESLint Configuration
- Install Logo Branding
- Onboarding Completion Screenshots
- PostCSS Configuration
- Home & Projects Views
- pnpm Build Permissions

## God Nodes (most connected - your core abstractions)

1. `react` - 28 edges
2. `next` - 22 edges
3. `13 · Proyectos — Vista general (Projects Overview Screen)` - 17 edges
4. `compilerOptions` - 16 edges
5. `Project Card` - 14 edges
6. `13 · Proyectos — Vista general (Projects Overview Screen)` - 11 edges
7. `12 · Home — Inicio (Home Screen)` - 10 edges
8. `Projects Grid (3-Column Rows with Spacers)` - 9 edges
9. `Project Card` - 9 edges
10. `Todo listo — All Ready Success Screen` - 9 edges

## Surprising Connections (you probably didn't know these)

- `Local profile setup screen` --semantically_similar_to--> `Local profile screenshot with name field and optional PIN protection` [INFERRED] [semantically similar]
  ref/21 · Onboarding — Perfil local-export.html → public/screenshots/02-perfil-local.png
- `Onboarding completion screen` --semantically_similar_to--> `Onboarding completion screenshot confirming storage setup` [INFERRED] [semantically similar]
  ref/21 · Onboarding — Todo listo-export.html → public/screenshots/05-todo-listo.png
- `Turso profile creation screen` --semantically_similar_to--> `Turso profile screenshot with name and password fields` [INFERRED] [semantically similar]
  ref/22 · Onboarding — Crear perfil Turso-export.html → public/screenshots/04-perfil-turso.png
- `Turso connection setup screen with guided steps` --semantically_similar_to--> `Turso connection screenshot with credentials form and setup guide` [INFERRED] [semantically similar]
  ref/Onboarding — Conecta Turso-export.html → public/screenshots/03-conecta-turso.png
- `Storage choice screen` --semantically_similar_to--> `Storage choice screenshot showing Local and Turso options` [INFERRED] [semantically similar]
  ref/Onboarding — Configura tu almacenamiento-export.html → public/screenshots/01-almacenamiento.png

## Import Cycles

- None detected.

## Hyperedges (group relationships)

- **Modus storage onboarding flow** — readme_storage_selection, readme_local_profile, readme_turso_connection, readme_turso_profile, readme_onboarding_completion [INFERRED 0.85]
- **Collapsible Three-Panel Workspace** — ref_01_workspace_chat_kanban_plan_export_chat_panel, ref_01_workspace_chat_kanban_plan_export_contexto_panel, ref_01_workspace_chat_kanban_plan_export_plan_del_proyecto, ref_01_workspace_chat_kanban_plan_export_panel_collapse_controls [EXTRACTED 1.00]
- **AI Task Intake Flow (Chat to Proposal to Kanban)** — ref_01_workspace_chat_kanban_plan_export_chat_panel, ref_01_workspace_chat_kanban_plan_export_propuesta_de_tareas, ref_01_workspace_chat_kanban_plan_export_kanban_board, ref_01_workspace_chat_kanban_plan_export_ai_assistant_sparkles_glyph [INFERRED 0.95]
- **Project AI Context System (Context, Rules, Resources)** — ref_01_workspace_chat_kanban_plan_export_contexto_panel, ref_01_workspace_chat_kanban_plan_export_reglas_a_seguir, ref_01_workspace_chat_kanban_plan_export_recursos, ref_01_workspace_chat_kanban_plan_export_ai_assistant_sparkles_glyph [INFERRED 0.85]
- **Home Screen Composition (shell + header + working rail + today plan)** — ref_12_home_inicio_export_home_inicio_screen, ref_12_home_inicio_export_app_shell_sidebar, ref_12_home_inicio_export_header_bar, ref_12_home_inicio_export_continuar_trabajando_section, ref_12_home_inicio_export_plan_para_hoy_section [EXTRACTED 1.00]
- **Project Card Component Anatomy (shared by both screens)** — ref_12_home_inicio_export_project_card, ref_12_home_inicio_export_progress_bar, ref_12_home_inicio_export_project_card_meta_row, ref_12_home_inicio_export_project_card_status_row, ref_12_home_inicio_export_project_card_hover_actions, ref_12_home_inicio_export_project_state_chips, ref_12_home_inicio_export_avatar_stack [EXTRACTED 1.00]
- **Demo Project Dataset Reused Across Home and Proyectos Screens** — ref_12_home_inicio_export_observatorio_regional, ref_12_home_inicio_export_portfolio_permodusl, ref_12_home_inicio_export_lista_de_compras, ref_12_home_inicio_export_home_inicio_screen, ref_12_home_inicio_export_proyectos_vista_general_screen [INFERRED 0.85]
- **Project Card Anatomy** — ref_13_proyectos_vista_general_export_project_card, ref_13_proyectos_vista_general_export_progress_bar, ref_13_proyectos_vista_general_export_avatar_stack, ref_13_proyectos_vista_general_export_status_chip, ref_13_proyectos_vista_general_export_hover_actions [EXTRACTED 1.00]
- **Projects Toolbar (scope, search, sort, create)** — ref_13_proyectos_vista_general_export_filter_tabs, ref_13_proyectos_vista_general_export_project_search_field, ref_13_proyectos_vista_general_export_sort_control, ref_13_proyectos_vista_general_export_new_project_button [EXTRACTED 1.00]
- **Project Lifecycle Management Flow** — ref_13_proyectos_vista_general_export_project_card, ref_13_proyectos_vista_general_export_card_menu, ref_13_proyectos_vista_general_export_status_chip, ref_13_proyectos_vista_general_export_archived_actions, ref_13_proyectos_vista_general_export_project_lifecycle_states [INFERRED 0.85]
- **Modus Logo Identity Composition** — app_public_logo_install_modus_logo, app_public_logo_install_m_monogram_mark, app_public_logo_install_blue_gradient_palette, app_public_logo_install_gradient_loop_overlap [INFERRED 0.85]
- **Installable App Icon Presentation Pattern** — app_public_logo_install_modus_logo, app_public_logo_install_app_icon_squircle, app_public_logo_install_pwa_install_branding [INFERRED 0.75]
- **Modus Brand Identity System** — app_public_logo_modus_logo, app_public_logo_brand_mark, app_public_logo_blue_palette, app_public_logo_geometric_rounded_style, app_public_logo_translucent_overlap [INFERRED 0.85]
- **Storage Backend Selection Flow** — public_screenshots_01_almacenamiento_storage_setup_screen, public_screenshots_01_almacenamiento_storage_choice_cards, public_screenshots_01_almacenamiento_local_storage_option, public_screenshots_01_almacenamiento_turso_cloud_option, public_screenshots_01_almacenamiento_selected_state_check_badge, public_screenshots_01_almacenamiento_continue_primary_button [EXTRACTED 1.00]
- **Onboarding Persistence Targets** — public_screenshots_01_almacenamiento_onboarding_flow, public_screenshots_01_almacenamiento_persisted_data_scope, public_screenshots_01_almacenamiento_local_storage_option, public_screenshots_01_almacenamiento_turso_cloud_option [INFERRED 0.85]
- **App Shell Chrome (Brand, Theme, Dev Indicator)** — public_screenshots_01_almacenamiento_modus_brand_header, public_screenshots_01_almacenamiento_theme_toggle_control, public_screenshots_01_almacenamiento_dark_gradient_theme, public_screenshots_01_almacenamiento_nextjs_dev_indicator [INFERRED 0.75]
- **Local Profile Onboarding Form Composition** — public_screenshots_02_perfil_local_local_profile_screen, public_screenshots_02_perfil_local_display_name_field, public_screenshots_02_perfil_local_local_protection_section, public_screenshots_02_perfil_local_pin_protection_toggle, public_screenshots_02_perfil_local_continue_cta_button [INFERRED 0.85]
- **Dark Theme Visual System (backdrop, chrome control, brand lockup)** — public_screenshots_02_perfil_local_gradient_mesh_backdrop, public_screenshots_02_perfil_local_theme_toggle_control, public_screenshots_02_perfil_local_modus_brand_header, public_screenshots_02_perfil_local_local_profile_screen [INFERRED 0.75]
- **Turso Connection Setup Flow (form + guided onboarding steps)** — public_screenshots_03_conecta_turso_credentials_form, public_screenshots_03_conecta_turso_database_url_field, public_screenshots_03_conecta_turso_auth_token_field, public_screenshots_03_conecta_turso_test_connection_button, public_screenshots_03_conecta_turso_turso_onboarding_panel [INFERRED 0.95]
- **Storage Provider Configuration Screen Shell (heading, back nav, theme toggle)** — public_screenshots_03_conecta_turso_connect_turso_screen, public_screenshots_03_conecta_turso_storage_configuration_heading, public_screenshots_03_conecta_turso_back_navigation, public_screenshots_03_conecta_turso_theme_toggle [EXTRACTED 1.00]
- **Turso-backed Profile Creation Flow** — public_screenshots_04_perfil_turso_crea_tu_perfil_onboarding, public_screenshots_04_perfil_turso_credentials_form, public_screenshots_04_perfil_turso_create_profile_cta, public_screenshots_04_perfil_turso_turso_database_persistence [INFERRED 0.85]
- **Password Input UX Pattern (masking, visibility toggle, min length)** — public_screenshots_04_perfil_turso_credentials_form, public_screenshots_04_perfil_turso_password_visibility_toggle, public_screenshots_04_perfil_turso_password_min_length_rule [EXTRACTED 1.00]
- **Onboarding Completion and Workspace Handoff** — public_screenshots_05_todo_listo_all_ready_screen, public_screenshots_05_todo_listo_storage_configured_status, public_screenshots_05_todo_listo_go_home_cta, public_screenshots_05_todo_listo_onboarding_flow, public_screenshots_05_todo_listo_modus_workspace [INFERRED 0.85]
- **Persistent App Chrome Layer (Brand, Theming, Background)** — public_screenshots_05_todo_listo_modus_brand_header, public_screenshots_05_todo_listo_theme_toggle_control, public_screenshots_05_todo_listo_dark_gradient_background, public_screenshots_05_todo_listo_corner_badge_overlay [INFERRED 0.75]

## Communities (23 total, 4 thin omitted)

### Community 0 - "Onboarding Pages & Routing"

Cohesion: 0.07
Nodes (23): BrandHeader(), LocalProfileForm(), LocalStoragePreparation(), stages, OnboardingBackButton(), EyeIcon(), OnboardingFrame(), TursoGuideStep() (+15 more)

### Community 1 - "Workspace Board & Chat"

Cohesion: 0.09
Nodes (28): Board(), BoardFilter(), app_components_workspace_board_module, ChatComposer(), WorkspaceChatEmpty(), app_components_workspace_chat_module, WorkspaceChat(), app_components_workspace_context_module (+20 more)

### Community 2 - "Project Config & Dependencies"

Cohesion: 0.04
Nodes (41): app_globals, geist, metadata, app_panels, app_theme, dependencies, bootstrap-icons, next (+33 more)

### Community 3 - "Home & Projects Design Exports"

Cohesion: 0.08
Nodes (42): Ambient Glow Background Gradients, App de Recetas (demo project), App Logo (Sparkles Glyph Tile), App Shell Sidebar (52px Icon Rail), Archived Project Actions (Restaurar / Delete), Collaborator Avatar Stack (AL, MG), Continuar trabajando Section (Continue Working Rail), 12 · Home — Inicio HTML Design Export (+34 more)

### Community 4 - "Projects Overview Components"

Cohesion: 0.09
Nodes (23): AppShell(), initialProjects, Project, Icon(), app_components_projects_menu_module, app_components_projects_overview_module, ProjectsOverview(), statuses (+15 more)

### Community 5 - "Modus Branding & Storage Concepts"

Cohesion: 0.08
Nodes (31): Vivid Blue Color Palette with Soft Gradients, Modus Brand Asset (Public Web Asset, White Background), Modus blue glowing M brand mark on a dark background, Geometric Rounded-Capsule Flat Style, Modus install app icon with blue M mark on a light tile, Modus Logo, Translucent Overlapping Strokes (Layered Blend), Storage choice screenshot showing Local and Turso options (+23 more)

### Community 6 - "Projects Design System"

Cohesion: 0.10
Nodes (26): Ambient Glow Backdrop, App Logo (Sparkles Glyph), Archived Actions (Restaurar / Eliminar), Avatar Stack, Card Menu (Project Context Menu), Design Token Palette (#007AFF accent on #F2F2F4 canvas), Filter Tabs (Todos / Activos / Completados / Archivados), Geist Typeface (+18 more)

### Community 7 - "Home Dashboard Components"

Cohesion: 0.15
Nodes (15): EmptyState(), app_components_empty_state_module, HomeDashboard(), app_components_home_dashboard_module, Project, projects, Task, tasks (+7 more)

### Community 8 - "Workspace Panels Design"

Cohesion: 0.15
Nodes (23): 01 · Workspace — Chat · Kanban · Plan, 03 · Chat oculto — Kanban expandido, AI Assistant (Sparkles Glyph), App Sidebar, Card — Información general, Card — Plan sugerido para hoy, Card — Progreso general, Card — Próximos hitos (+15 more)

### Community 9 - "TypeScript Configuration"

Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 10 - "Storage Selection Design"

Cohesion: 0.24
Nodes (13): Local-vs-Cloud Storage Backend Decision, Continue Primary Button, Dark Theme with Radial Gradient Backdrop, Local Storage Option (On This Device), Modus Brand Header (Logo), Next.js Dev Tools Indicator, First-Run Onboarding Flow, Persisted Data Scope: Projects, Tasks, Conversations (+5 more)

### Community 11 - "Turso Connection Design"

Cohesion: 0.26
Nodes (13): Auth Token Masked Input Field, Back Navigation Chevron, Conecta Turso Screen (Storage Configuration), Turso Credentials Form (Intro card), Dark Themed App Shell (Modus), Database URL Input Field, Turso libSQL Remote Database, Unlabeled N Badge (likely Next.js Dev Indicator) (+5 more)

### Community 12 - "Turso Profile Design"

Cohesion: 0.23
Nodes (12): Centered Narrow Single-Column Auth Layout, Crea tu perfil (Profile Onboarding Step), Crear perfil Primary Action Button, Profile Credentials Form (Nombre / Apellido / Contrasena), Dark Glassmorphism App Shell with Radial Gradient Glow, Modus Brand Logo Header, Password Minimum Length Rule (8 caracteres), Password Visibility Toggle (Eye Icon) (+4 more)

### Community 13 - "Storage Selection UI"

Cohesion: 0.22
Nodes (6): BootstrapFillIcon(), BootstrapFillIconName, BootstrapFillIconProps, StorageLocation, StorageOptionProps, StorageSelection()

### Community 14 - "Local Profile Design"

Cohesion: 0.24
Nodes (11): Continuar Primary Action Button, Nombre (Display Name) Text Input with value 'Alexander', First-Run Profile Configuration Flow, Dark Gradient Mesh Backdrop, Local-Only Privacy Model (device-stored profile and PIN, no account), Local Profile Setup Screen (Configura tu perfil), Protección local Settings Group, Modus Brand Header (logo mark + wordmark, top-left) (+3 more)

### Community 15 - "Completion Screen Design"

Cohesion: 0.29
Nodes (11): Todo listo — All Ready Success Screen, Centered Single-Column Empty-State Layout Pattern, 'N' Circular Corner Badge Overlay (bottom-left), Dark Ambient Gradient Background, Ir a Inicio Primary CTA Button, Modus Application, Modus Brand Header (Logo Mark + Wordmark), Onboarding Setup Flow (+3 more)

### Community 17 - "ESLint Configuration"

Cohesion: 0.25
Nodes (7): compat, **dirname, eslintConfig, **filename, ref_eslint_eslintrc, ref_node_path, ref_node_url

### Community 18 - "Install Logo Branding"

Cohesion: 0.67
Nodes (6): App Icon Squircle Container, Blue Gradient Palette, Gradient Loop Overlap Blend, Stylized M Monogram Mark, Modus Install Logo, PWA Install Branding

### Community 19 - "Onboarding Completion Screenshots"

Cohesion: 0.50
Nodes (5): Onboarding completion screenshot confirming storage setup, Onboarding completion, Modus workspace, Workspace with AI chat, Kanban board, and project plan, Onboarding completion screen

## Ambiguous Edges - Review These

- `App Logo (Sparkles Glyph Tile)` → `modus (AI Planning Assistant)` [AMBIGUOUS]
  ref/12 · Home — Inicio-export.html · relation: conceptually_related_to
- `Dark Themed App Shell (Modus)` → `Unlabeled N Badge (likely Next.js Dev Indicator)` [AMBIGUOUS]
  public/screenshots/03-conecta-turso.png · relation: conceptually_related_to
- `modus Workspace` → `Modus Application` [AMBIGUOUS]
  public/screenshots/05-todo-listo.png · relation: conceptually_related_to
- `Modus Application` → `'N' Circular Corner Badge Overlay (bottom-left)` [AMBIGUOUS]
  public/screenshots/05-todo-listo.png · relation: references

## Knowledge Gaps

- **123 isolated node(s):** `BootstrapFillIconName`, `BootstrapFillIconProps`, `stages`, `statuses`, `filters` (+118 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 176 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `App Logo (Sparkles Glyph Tile)` and `modus (AI Planning Assistant)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Dark Themed App Shell (Modus)` and `Unlabeled N Badge (likely Next.js Dev Indicator)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `modus Workspace` and `Modus Application`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Modus Application` and `'N' Circular Corner Badge Overlay (bottom-left)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `react` connect `Workspace Board & Chat` to `Onboarding Pages & Routing`, `Project Config & Dependencies`, `Projects Overview Components`, `Home Dashboard Components`, `Storage Selection UI`?**
  _High betweenness centrality (0.129) - this node is a cross-community bridge._
- **Why does `next` connect `Onboarding Pages & Routing` to `Workspace Board & Chat`, `Project Config & Dependencies`, `Projects Overview Components`, `Home Dashboard Components`, `Storage Selection UI`, `Workspace Logic`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `13 · Proyectos — Vista general (Projects Overview Screen)` (e.g. with `Ambient Glow Backdrop` and `14 · Proyectos — Menú de proyecto (Project Menu Screen)`) actually correct?**
  _`13 · Proyectos — Vista general (Projects Overview Screen)` has 3 INFERRED edges - model-reasoned connections that need verification._
