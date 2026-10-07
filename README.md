<div align="center">
  <img src="app/public/Logo.png" alt="Modus logo" width="88" />

  # Modus

  **Plan projects, manage tasks and work with an AI assistant that proposes — and you approve.**

  <p>
    <a href="#getting-started">Getting started</a> ·
    <a href="docs/guia-tecnica.md">Technical guide</a> ·
    <a href="https://github.com/Alexanderjms/modus/issues">Issues</a>
  </p>

  <br />

  <img src="docs/media/demo.gif" alt="Modus walkthrough: an AI assistant proposes tasks, the user accepts them all at once, and they appear on the Kanban board" width="860" />

  <sub>Walkthrough · <a href="docs/media/demo.mp4">Watch the full-quality video</a></sub>
</div>

<br />

## <img src="docs/media/icons/target.svg" width="24" height="24" align="top" alt="" /> Overview

Modus is a project workspace that combines a Kanban board, per-project context and an AI assistant in a single place. It is built for people who need to turn ideas into structured, trackable work without losing control over what changes.

The assistant reads the context of your project, suggests tasks, subtasks, tags and edits, and waits for your decision. **Nothing is applied until you accept it.**

| | Principle | What it means |
| --- | --- | --- |
| <img src="docs/media/icons/shield-check.svg" width="20" height="20" alt="" /> | **Human in control** | Every AI proposal is reviewed before it reaches your board. |
| <img src="docs/media/icons/zap.svg" width="20" height="20" alt="" /> | **Fast to structure** | Go from a rough idea to a complete task list in minutes. |
| <img src="docs/media/icons/lock.svg" width="20" height="20" alt="" /> | **Your data, your machine** | Modus runs locally and stores data where you choose. |
| <img src="docs/media/icons/plug-zap.svg" width="20" height="20" alt="" /> | **Bring your own AI** | Connect the provider and model you already use. |

> **Note:** the application interface is currently in Spanish. The screenshots below reflect the current interface.

## <img src="docs/media/icons/layout-dashboard.svg" width="24" height="24" align="top" alt="" /> Features

### <img src="docs/media/icons/kanban.svg" width="20" height="20" align="top" alt="" /> Kanban board

Organize work across three columns — **To do**, **In progress** and **Done** — and move cards as work advances.

<p align="center">
  <img src="docs/media/board.png" alt="Kanban board with the assistant panel, task columns and project context" width="900" />
</p>

Each task supports:

| | |
| --- | --- |
| <img src="docs/media/icons/flag.svg" width="18" height="18" alt="" /> | Priority levels |
| <img src="docs/media/icons/calendar-days.svg" width="18" height="18" alt="" /> | Start and end dates |
| <img src="docs/media/icons/tags.svg" width="18" height="18" alt="" /> | Color-coded tags, shared across the project |
| <img src="docs/media/icons/list-checks.svg" width="18" height="18" alt="" /> | A checklist of steps with progress |
| <img src="docs/media/icons/paperclip.svg" width="18" height="18" alt="" /> | Attached files and links |

<p align="center">
  <img src="docs/media/task.png" alt="Task detail with description, priority, tags, dates and checklist" width="900" />
</p>

### <img src="docs/media/icons/sparkles.svg" width="20" height="20" align="top" alt="" /> AI assistant with review

Each project has its own conversation. The assistant knows the project description, its rules, its existing tasks and your tags, so its suggestions fit the work you already have.

Proposals arrive as cards you can **accept** or **discard**. Responses stream in as they are written, and proposed tasks appear one by one. Accepting several proposals applies them to the board at the same time.

<p align="center">
  <img src="docs/media/assistant.png" alt="Assistant panel showing proposed tasks with accept and discard actions" width="360" />
</p>

The assistant can propose to:

| | |
| --- | --- |
| <img src="docs/media/icons/plus.svg" width="18" height="18" alt="" /> | Create new tasks, with subtasks and tags |
| <img src="docs/media/icons/pencil.svg" width="18" height="18" alt="" /> | Rename a task or change its description, priority and dates |
| <img src="docs/media/icons/tags.svg" width="18" height="18" alt="" /> | Add or remove tags |
| <img src="docs/media/icons/square-check.svg" width="18" height="18" alt="" /> | Add, complete or reopen checklist items |
| <img src="docs/media/icons/arrow-left-right.svg" width="18" height="18" alt="" /> | Move a task to another column |

Prefer a faster flow? Enable **automatic apply** and changes are applied as they arrive, with a one-click undo.

### <img src="docs/media/icons/globe.svg" width="20" height="20" align="top" alt="" /> Web search

When a question needs outside information, the assistant can search the web and cite its sources. This requires a search API key, which you configure once in your profile menu.

### <img src="docs/media/icons/paperclip.svg" width="20" height="20" align="top" alt="" /> Files in the conversation

Attach images, PDFs, text documents and spreadsheets to a message, or drag a task from the board into the chat to discuss it directly.

### <img src="docs/media/icons/house.svg" width="20" height="20" align="top" alt="" /> Home and activity

The home page lists your projects with their progress and shows a year-long activity grid of completed tasks.

<p align="center">
  <img src="docs/media/home.png" alt="Home page with project progress and an activity grid" width="900" />
</p>

### <img src="docs/media/icons/sun-moon.svg" width="20" height="20" align="top" alt="" /> Light and dark themes

The interface follows your preference and adapts from large desktop screens to mobile widths.

<p align="center">
  <img src="docs/media/board-dark.png" alt="Kanban board in dark theme" width="900" />
</p>

## <img src="docs/media/icons/play.svg" width="24" height="24" align="top" alt="" /> How it works

| Step | Action | Result |
| :---: | --- | --- |
| **1** | Create a project | A board and a conversation are ready. |
| **2** | Describe your goal to the assistant | It uses your project context to understand the work. |
| **3** | Review the proposals | Accept, discard or adjust each suggested task. |
| **4** | Track progress | Move cards across the board until the work is done. |

## <img src="docs/media/icons/plug-zap.svg" width="24" height="24" align="top" alt="" /> AI providers

Connect the account or API key of the service you prefer, then choose the model from the chat.

| Provider | Connection |
| --- | --- |
| <img src="public/providers/chatgpt.svg" width="18" height="18" alt="" /> **ChatGPT** | Sign in with your ChatGPT account |
| <img src="public/providers/opencode.svg" width="18" height="18" alt="" /> **OpenCode Go** | API key |
| <img src="public/providers/groq.svg" width="18" height="18" alt="" /> **Groq** | API key |
| <img src="public/providers/deepinfra.svg" width="18" height="18" alt="" /> **DeepInfra** | API key |
| <img src="public/providers/aws-amazon-bedrock.svg" width="18" height="18" alt="" /> **Amazon Bedrock** | API key |
| <img src="public/providers/openrouter-mono.svg" width="18" height="18" alt="" /> **OpenRouter** | API key |

The board works fully without an AI provider.

## <img src="docs/media/icons/database.svg" width="24" height="24" align="top" alt="" /> Storage and privacy

Choose where your data lives the first time you open Modus.

<p align="center">
  <img src="docs/media/onboarding-storage.png" alt="Storage selection between this device and the cloud" width="48%" />
  <img src="docs/media/onboarding-profile.png" alt="Local profile creation with an optional PIN" width="48%" />
</p>

| | Option | Description |
| --- | --- | --- |
| <img src="docs/media/icons/server.svg" width="20" height="20" alt="" /> | **Local** | Data is stored in a database on your computer. An optional PIN protects access. |
| <img src="docs/media/icons/cloud.svg" width="20" height="20" alt="" /> | **Cloud** | Data is stored in a [Turso](https://turso.tech/) database that you own, with username and password sign-in. |

<p align="center">
  <img src="docs/media/onboarding-cloud.png" alt="Connect a cloud database with a URL and token" width="640" />
</p>

- Modus runs on your own computer; it is not a hosted service.
- Provider keys are stored encrypted (Windows credential protection).
- Only the content needed to answer a request is sent to the AI provider you select.

## <img src="docs/media/icons/rocket.svg" width="24" height="24" align="top" alt="" /> Getting started

**Requirements:** Node.js 24 and pnpm.

```bash
git clone https://github.com/Alexanderjms/modus.git
cd modus
pnpm install
pnpm dev
```

Open **http://127.0.0.1:3000**, choose where to store your data, create your profile and add your first project.

For configuration details, cloud storage, provider setup, troubleshooting and architecture, see the [technical guide](docs/guia-tecnica.md).

## <img src="docs/media/icons/package.svg" width="24" height="24" align="top" alt="" /> Project status

Modus is under active development (version 0.1.0). Interfaces and behavior may change as the product evolves.

## <img src="docs/media/icons/message-square.svg" width="24" height="24" align="top" alt="" /> Support

| | |
| --- | --- |
| <img src="docs/media/icons/bug.svg" width="18" height="18" alt="" /> | [Report a problem](https://github.com/Alexanderjms/modus/issues) |
| <img src="docs/media/icons/lightbulb.svg" width="18" height="18" alt="" /> | [Suggest an improvement](https://github.com/Alexanderjms/modus/issues/new) |
| <img src="docs/media/icons/book-open.svg" width="18" height="18" alt="" /> | [Technical guide](docs/guia-tecnica.md) |

<br />

<div align="center">
  <sub>Icons by <a href="https://lucide.dev">Lucide</a>.</sub>
</div>
