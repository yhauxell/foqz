# Canvas pruning (v0.14)

Status: built on `claude/app-analysis-features-5c2dc5` (not yet merged). See "Build notes" at the end.
Source: the removal list agreed in conversation on 2026-10-23, grounded in `docs/audit-2026-10-23.md`.

## Thesis

Content is text. Drawing primitives are shapes. Everything else (actionable, focused, synced, annotated) is a behavior you switch on where you are standing. Nothing moves a node somewhere else to give it meaning.

## What changes for the user

| Concept | Before | After |
|---|---|---|
| Ways to write intent | Task card, sticky note, text, quick-task modal | One text concept with three styles (plain, sticky, card) |
| Making something a to-do | Create a task | Toggle "actionable" on any text (`Mod+Enter` or the checkbox button) |
| Containers | Project frame, runway frame, sweep inbox | Region (the project frame), never prompts, never deletes children |
| Planning a day | Runway frames with 5 templates | Removed. Focus happens in place. |
| Focus | Full-screen overlay | Camera zooms to the node, the rest of the board dims, a small timer pill floats on top |
| Task metadata | Priority P1–P4, status open/doing/done | Status open/done only |
| Exit friction | Jev / TypeSafe evaluation (paid key, silently disabled without it) | Removed |
| Annotation kinds | comment, question, decision, constraint, todo | comment, question, decision |
| Edge relations | depends, blocks, aggregates | depends, relates |
| AI tools (chat + MCP host) | 17 | 8 |
| AI providers | Ollama, OpenAI, Gemini, TypeSafe | Ollama, OpenAI-compatible |
| Settings tabs | General, AI, Agents & MCP, Data | App, Intelligence, Integrations |
| Capture | Quick-task modal with AI parsing + Spotlight | Spotlight only: type, Enter, text lands where you were |
| Navigation | Waypoint rail | Spotlight search and fit view |

## Removed outright

1. **Runway frames and templates.** `runwayFrame` node type, `RUNWAY_TEMPLATES`, `stageRunway`, `sendTaskToRunway`, `returnTaskToProject`, `advanceRunwayFocus`, `realignRunwayNodes`, runway Spotlight commands, the send-to-runway shortcut and buttons, Eisenhower quadrant rendering.
2. **Jev / TypeSafe.** `src/lib/jev.ts`, exit-friction dialog in the focus flow, Spotlight prioritization, the four `jev_*` tools, TypeSafe settings and provider entry, the `api.typesafe.ai` header rewrite in `electron/main.cjs`.
3. **Priority and the `doing` status.** Priority badge, picker, sort, AI parsing, GitHub priority labels sync. `doing` is folded into `open`.
4. **Image generation.** `generate_image` tool (both declarations), `src/lib/aiImageProvider.ts`, `/image` slash command, image provider settings. Pasting images is unchanged.
5. **Notion and Sentry connector fields.** Nothing read them.
6. **Agent profiles, AGENT.md discovery, custom skills.** Nothing injected them into prompts.
7. **Waypoint rail.** The Logbook moves to a topbar button.
8. **Sweep-to-inbox and `/sweep`.** The scheduled workday sweep of done items stays.
9. **AI layout tools.** `group_nodes`, `arrange_layout`, `connect_nodes`, the arrange-layout Spotlight command. Human grouping (`Mod+G`) stays and creates a region.
10. **Quick-task modal.** Spotlight takes over capture.
11. **Dead code.** `WorkspaceSidebar.tsx`, deprecated store re-exports, duplicate shortcut aliases.
12. **Per-project GitHub token, per-project MCP server picking, per-project custom agent.** One global token in Settings.
13. **Gemini provider.** Existing Gemini settings migrate to the OpenAI-compatible provider using Google's OpenAI endpoint (`https://generativelanguage.googleapis.com/v1beta/openai`), so nobody loses a working setup.
14. **Sticky decoration knobs.** Corner, fold, noise, pattern, tape and pin had no UI besides color; they are no longer written for new stickies or offered to the AI. Existing values still render.

## Merged

### One text concept

- Toolbar has one **Text** tool (`T`). The node toolbar gets a style switch: **Plain**, **Sticky**, **Card**. Switching keeps the content, position, edges and annotations.
- Storage keeps the three renderers (`text`, `note`, `focusTask`) as the style. Unifying them into one stored type is deferred: it is a large renderer rewrite with no user-visible gain over the style switch.
- **Actionable** is a property (`data.actionable: true` plus `data.status`). Plain and sticky text show a checkbox when actionable; checking it marks it done (strike-through, muted). Card style is always actionable.
- Every place that used `node.type === "focusTask"` to mean "this is a to-do" goes through `isActionable(node)` in `src/lib/nodeBehaviors.ts`: focus, done stamping, workday sweep, Logbook, dependency stubs, AI context, GitHub sync.
- The `A` (new task) shortcut and the Task toolbar button are removed. `N` (sticky) stays as a shortcut for Text in sticky style.

### Region

- The project frame is shown as a **Region**. Dropping a node into a region adopts it silently (undo reverts it). The reparent confirmation modal is removed.
- Deleting a region keeps its children on the canvas at their absolute positions.
- The box stays a drawn rectangle; it is a shape, not a container.

### Annotation kinds and edge relations

- `todo` → `comment` (any text can be actionable now), `constraint` → `decision`.
- `blocks` → `depends`, `aggregates` → `relates`.

### AI tools: 17 → 8

Kept: `get_canvas_summary`, `update_node`, `delete_node`, `expand_task`, `start_focus_session`, `stop_focus_session`, `create_github_issue`.
New: `spawn_text` replaces `spawn_tasks` and `spawn_notes` (`actionable` and `style` parameters).
Removed: `spawn_tasks`, `spawn_notes`, `generate_image` ×2, `connect_nodes`, `group_nodes`, `arrange_layout`, `jev_*` ×4.

This changes the public tool list of the Foqz MCP host on `127.0.0.1:7337`. The executor still accepts `spawn_tasks`, `spawn_notes` and `create_task` as unadvertised aliases of `spawn_text`, so older agents keep working; the removed tools return "Unknown canvas tool".

### Settings: 3 tabs

- **App**: appearance, window, shortcuts, focus durations, working hours, data import/export/reset.
- **Intelligence**: provider (Ollama or OpenAI-compatible), models, local discovery.
- **Integrations**: GitHub token, MCP servers, the Foqz MCP host.

## Focus in place

- Starting focus on any actionable node: the camera fits the node with padding, every other node and edge drops to low opacity and stops taking pointer events, the node gets a ring.
- A timer pill floats at the top: remaining time, pause/resume, +5, mark done, exit.
- The timer reads `defaultFocusMinutes` from settings instead of a hard-coded 25.
- When the timer reaches zero it plays the existing end-of-block feedback (notification and optional chime) and leaves the node focused with a "Time's up" state.
- `Esc` exits focus. Hold-to-exit and Jev friction are gone.

## Board migration (snapshot v1 → v2)

`BOARD_SNAPSHOT_VERSION` becomes 2. `loadBoardSync` runs `migrateBoardSnapshot` on anything older and, before the first v2 write, copies the raw v1 JSON to `foqz_board_backup_v1:<boardId>`. Rules:

1. Runway children: if `originProjectId` exists on the canvas, reparent there at `originProjectPos`; otherwise move to canvas root at the runway position plus the child offset. Restore `stowedEdges` whose endpoints exist. Strip `originProject*`, `stagedAt`, `stowedEdges`. Delete the runway node.
2. Project frames titled like a runway (legacy string sniffing) are treated the same way.
3. `status: "doing"` → `"open"`. `priority` is dropped.
4. `focusTask` nodes get `actionable: true`.
5. Annotation kind `todo` → `comment`, `constraint` → `decision`.
6. Edge relation `blocks` → `depends`, `aggregates` → `relates`.
7. `connectors.githubToken`, `notionWorkspace`, `sentryProject`, `mcpServers`, `customAgent` are stripped from region data. A stripped token is moved into the global GitHub token if that is empty.

The migration is a pure function covered by vitest with a legacy fixture board.

## Acceptance

- `tsc --noEmit -p tsconfig.app.json` has no new errors (baseline: 15 pre-existing).
- `vitest run` passes, including the migration tests.
- `playwright test --project=renderer` passes, with the runway, priority and quick-task tests rewritten for the new behavior.
- `tests/pruning.renderer.spec.ts` seeds a legacy board and saves screenshots to `docs/specs/pruning/screenshots/`:
  1. migrated legacy board
  2. plain text made actionable, then done
  3. style switch (plain, sticky, card)
  4. focus in place with the timer pill
  5. region holding children, after deleting the region
  6. settings with three tabs
  7. Spotlight capture
  8. toolbar and topbar without the removed tools
- The Electron spec is not run (it uses the real user profile).

## Deferred

- A single stored node type for text (see above).
- One GitHub panel replacing the issues modal, create-issue modal and card sync controls.
- Durable file storage, flush-on-quit, wall-clock timer (audit section A/B).

## Build notes (2026-10-23)

### What shipped
Everything in "Removed outright", "Merged" (except the deferred items below), "Focus in place" and "Board migration".

- One text concept: `src/lib/nodePredicates.ts` (`isActionable`, `textStyleOf`, `convertTextStyle`, `nodeTitle`) and `src/lib/nodeBehaviors.ts` (`toggleActionable`, `toggleDone`, `setTextStyle`, `startFocus`, `stopFocus`). Every former `type === "focusTask"` check for to-do semantics goes through `isActionable`. The style switch and To-do button live in the floating node toolbar; the checkbox is `src/poc/components/TodoCheckbox.tsx`.
- Restyling drops appearance that belongs to the old style (a plain text color would otherwise become a sticky background).
- Linking or filing a GitHub issue switches the text to card style, because that is where the sync status and assignee controls are.
- Floating node toolbar (`src/poc/components/FlowShapeMenu.tsx`) follows the FigJam/Canva pattern: icon-only buttons, Style and Text size as small dropdowns, an overflow menu (⋯) for center, duplicate, delete and GitHub, and a formatting-only bar while typing. It and its dropdowns slide or flip to stay clear of the top bar and the tool rail.
- Focus in place: `src/components/FocusInPlace.tsx`. The focused card no longer shows its own timer; the floating pill is the only one.
- Command bar: `src/components/GlobalSpotlight.tsx` replaces Spotlight, the quick-task modal and the shortcuts modal. `⌘⇧N` opens it in capture mode.
- Settings: `src/components/FocusSettings.tsx` with App, Intelligence, Integrations.
- Migration: `src/lib/storage/migrate.ts`, wired in `LocalStorageAdapter.loadBoardSync` and in board import. Settings migration in `src/lib/appSettings.ts` and `electron/settingsMigration.cjs` (a parity test keeps them identical). Secrets of removed providers are purged from localStorage.

### Found and fixed along the way
- Annotations marked "visible to AI" were never sent to the AI. `canvasContext` and the inline chat now include open, AI-visible annotations.
- The workday sweep ignored the configured working hours (read `workingHours` from the wrong object).
- `⌘D` and `⌘↵` did nothing on a focused node: React Flow treats Meta/Ctrl as its multi-select key and deselected the node first. The to-do shortcut now runs in the capture phase.
- The timer reaching zero now plays the end-of-block feedback; the focus length comes from settings instead of a hard-coded 25.
- Rules-of-hooks violation in the inline chat (early return before hooks).
- Deleting a region from the floating toolbar called React Flow's `deleteElements`, which deletes children too.
- The 15 pre-existing `tsc` errors are gone.

### Deferred
- A single stored node type for text. The three renderers remain as styles.
- One GitHub panel replacing the issues modal, the create-issue modal and the card controls.
- Durable file storage, flush-on-quit, wall-clock timer (audit sections A and B).
- Labels from GitHub are display-only; priority labels are no longer written.

### Verification
- `npx tsc --noEmit -p tsconfig.app.json`: 0 errors (baseline 15).
- `npx vitest run`: 34 tests pass (baseline 12): board migration, adapter migration with backup, text style conversion, settings migration and renderer/main parity.
- `npx playwright test --project=renderer`: 36 tests pass, including `tests/pruning.renderer.spec.ts`, which writes the screenshots in `docs/specs/pruning/screenshots/`.
- `npx vite build`: passes.
- Not run: `tests/app.electron.spec.ts`, because it launches Electron with the real user profile and the migration would rewrite that data.
