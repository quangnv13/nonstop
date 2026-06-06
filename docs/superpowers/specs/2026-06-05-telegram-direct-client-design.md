# Telegram Direct Client Design

## Goal

Replace the current client/server relay architecture with a single local app that runs entirely inside `apps/client`, talks directly to Telegram, manages local PTY sessions, and supports exactly one active session at a time.

## Scope

This redesign is intentionally narrow:

- One machine only
- One Telegram bot only
- One active session only
- Keep local workspace selection
- Keep CLI presets: `powershell`, `bash`, `codex`, `antigravity`
- Remove `cmd`
- Remove all server/client relay code
- Remove all unit tests for now

The result is a simpler operator tool, not a multi-user or multi-machine control plane.

## Current Problems

The current architecture adds a relay server between Telegram and the machine that actually runs the CLI. That creates extra state replication, extra network hops, and harder debugging. The recent username lookup confusion is a direct example: the same logical state had to be correct in the Telegram bot process, the relay server process, and the local client process.

For the actual use case, that complexity is unnecessary. The operator only needs one local process that owns:

- Telegram updates
- workspace state
- preset launching
- PTY lifecycle
- output rendering and throttling

## Target Architecture

The entire runtime moves into `apps/client`.

`apps/client` will become the only executable app and will contain:

- Telegram bot runtime
- local workspace store
- PTY session manager
- terminal snapshot/output pipeline
- prompt detection and session action buttons

There will be no `socket.io`, no relay server, no server-client auth token, and no cross-process session routing.

## Runtime Model

The app starts on the local machine and immediately:

1. Loads Telegram credentials and local configuration
2. Loads workspace definitions from local storage
3. Starts the Telegram bot
4. Waits for user commands from Telegram

When the user starts a CLI preset:

1. The app validates that no active session is already running
2. It resolves the preset command
3. It spawns the PTY locally in the selected workspace
4. It streams rendered output back to Telegram

When the user stops the session:

1. The PTY is terminated locally
2. Session memory state is cleared
3. Telegram is updated to show there is no running session

## State Model

### Persistent local state

Persistent state stays local on disk:

- `workspaces.json`
- optional lightweight bot config if needed later

Removed persistent files:

- `clients.json`
- `sessions.json`
- `user_workspaces.json`
- any other relay-era runtime registry

### In-memory runtime state

The app will keep a single in-memory session object, containing:

- `sessionId`
- `preset`
- `cwd`
- `status`
- `listenerChatId`
- `lastSentFinalText`
- terminal render state
- output buffers/timers

Only one session may exist at a time. A second start request while one is active should be rejected with a clear Telegram message.

## Telegram UX

The Telegram bot keeps the existing menu-driven style, simplified for one-machine use.

Main flows:

- list/select workspaces
- start a preset in a workspace
- inspect current session
- send interactive input
- use session action buttons

Session controls remain:

- toggle input mode
- toggle auto-enter
- refresh
- interrupt
- up
- down
- enter
- stop

`Interrupt` remains `ESC` for `codex` and `antigravity`.

## Output Behavior

The output pipeline stays conceptually similar to the current local-debugged behavior:

- render terminal output into a stable `finalText`
- send updates on the existing interval
- attach session buttons to output messages
- skip Telegram push when the new `finalText` is exactly equal to the previously sent `finalText`

This preserves useful throttling without reintroducing fuzzy duplicate heuristics.

## Prompt Detection

Confirmation prompt detection remains supported, but with tighter rules only for explicit confirmation-shaped text such as:

- `y/n`
- `yes/no`
- `continue?`
- `are you sure?`
- `press enter to confirm`

Spinner/loading noise from Codex or MCP startup must not trigger confirmation actions.

## Workspace Behavior

Workspace management remains local and Telegram-driven.

Supported operations:

- list workspaces
- add workspace
- edit workspace name
- edit workspace path
- delete workspace
- mark active workspace

Since there is only one machine, workspaces no longer belong to clients. They are just local launch targets.

## Preset Behavior

Supported presets after migration:

- `powershell`
- `bash`
- `codex`
- `antigravity`

Removed preset:

- `cmd`

Preset resolution should stay close to the current client implementation so the migration does not create unnecessary command-path regressions.

## File Structure Direction

`apps/client` should absorb the useful logic currently split across both apps.

Expected retained/adapted responsibilities:

- client terminal spawning/preset resolution logic stays in client
- server bot/menu/output logic moves into client
- server output pipeline logic moves into client
- server workspace/session menu flow moves into client, but simplified for single-machine mode

`apps/server` should be removed entirely once the direct app works.

## Migration Plan Shape

Migration should happen in focused passes:

1. Make `apps/client` capable of running the Telegram bot directly
2. Move session/menu/output logic into `apps/client`
3. Remove socket-based relay paths from client code
4. Simplify workspace ownership to local-only
5. Remove `cmd`
6. Remove `apps/server`
7. Remove all existing unit tests and test scripts
8. Verify behavior end-to-end manually through Telegram

## Verification Strategy

There will be no unit-test coverage in this migration phase by explicit request.

Verification will be manual and runtime-based:

- start the single local app
- confirm Telegram bot starts
- confirm workspace menu works
- launch each supported preset
- verify only one active session can run
- verify output interval behavior
- verify exact-match snapshot skipping
- verify interrupt/enter/up/down/stop controls
- verify prompt detection does not misfire on MCP/Codex loading noise

## Risks

Main risks in this migration:

- carrying over server-era assumptions about multiple clients
- accidentally leaving relay-only files or env vars in the runtime path
- PTY lifecycle regressions during direct integration
- workspace CRUD regressions after removing client ownership

These are acceptable because the target architecture is much simpler than the current one, and manual verification on one machine is the intended validation strategy.

## Explicit Non-Goals

This redesign does not try to preserve:

- multi-client support
- multi-machine support
- multi-user support
- SaaS readiness
- background distributed state
- automated tests in this migration pass

## Final Decision

Proceed with a full simplification:

- one app
- local only
- Telegram direct
- one active session
- workspace-aware launching
- no relay server
- no socket layer
- no unit tests for now
