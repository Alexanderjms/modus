---
trigger: always_on
---

# Efficient Codebase Search

## Search Strategy

- Prioritize fast, targeted searches over exhaustive exploration.
- Search filenames and paths before searching file contents.
- If the user provides a file path, inspect it directly.
- Limit searches to directories relevant to the task.
- Never scan the entire repository unless targeted searches fail.
- Exclude node_modules, .git, .next, dist, build, coverage, and generated files.

## Avoid Repeated Searches

- Never repeat a search that already provided sufficient information.
- Reuse information discovered earlier in the conversation.
- Stop exploring once the relevant implementation and dependencies are identified.
- Expand the search scope only when necessary.

## Implementation

- Start editing as soon as sufficient context is available.
- For simple changes, avoid unnecessary planning or architectural analysis.
- Read only the files required to understand the change.
- Preserve existing functionality.
- Perform targeted verification after changes.

## Performance

- Minimize unnecessary tool calls.
- Avoid repeatedly listing directories.
- Prefer precise searches over broad recursive searches.
- Balance speed with correctness and safety.
