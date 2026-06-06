# Telegram Direct Client Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the relay-based client/server architecture with a single Telegram-direct local app in `apps/client`, supporting one machine, one bot, one active session, local workspaces, and the `powershell`, `bash`, `codex`, and `antigravity` presets.

**Architecture:** `apps/client` becomes the only runtime app and absorbs Telegram bot menus, workspace CRUD, session lifecycle, output rendering, exact final-text skip, and prompt detection. Relay-specific state and transport (`socket.io`, server auth, multi-client routing, client registries) are removed entirely, and `apps/server` is deleted once the direct app is verified manually.

**Tech Stack:** TypeScript, Node.js, Grammy, node-pty, dotenv

---

### File Structure

**Create:**
- `apps/client/src/bot.ts` — Telegram bot runtime, menus, session controls, workspace CRUD
- `apps/client/src/store.ts` — local workspace persistence and simple local app state helpers
- `apps/client/src/session-controls.ts` — inline keyboard builders for active session actions
- `apps/client/src/session-output.ts` — Telegram-safe chunking and output message construction
- `apps/client/src/session-delivery.ts` — exact final-text skip decision helper
- `apps/client/src/prompt-detection.ts` — explicit confirmation prompt detection

**Modify:**
- `apps/client/src/index.ts` — becomes the single entrypoint for Telegram-direct runtime
- `apps/client/src/terminal.ts` — keep PTY/preset logic but remove relay assumptions if any
- `apps/client/src/types.ts` — redefine types around local-only session/workspace flow
- `apps/client/package.json` — remove relay-era deps/scripts, keep one-app runtime scripts
- `apps/client/.env` — remove server URL/auth token config and keep Telegram/local preset config

**Delete:**
- `apps/server/` entirely
- `apps/server/src/*.test.ts`
- `apps/client` test files if any are introduced elsewhere
- relay-era runtime files and scripts no longer used after migration

---

### Task 1: Establish the direct-client module layout

**Files:**
- Create: `apps/client/src/bot.ts`
- Create: `apps/client/src/store.ts`
- Create: `apps/client/src/session-controls.ts`
- Create: `apps/client/src/session-output.ts`
- Create: `apps/client/src/session-delivery.ts`
- Create: `apps/client/src/prompt-detection.ts`
- Modify: `apps/client/src/types.ts`

- [ ] **Step 1: Define the local-only state model in `apps/client/src/types.ts`**

Replace multi-client assumptions with local-only app types:

```ts
export interface Workspace {
  id: string;
  name: string;
  path: string;
}

export interface ActiveSessionState {
  sessionId: string;
  preset: 'powershell' | 'bash' | 'codex' | 'antigravity';
  cwd: string;
  status: 'running' | 'stopped';
  listenerChatId: number;
  lastSentFinalText: string;
  inputMode: boolean;
  autoEnter: boolean;
}

export interface WorkspaceDraft {
  mode: 'add_name' | 'add_path' | 'edit_name' | 'edit_path';
  workspaceId?: string;
  name?: string;
}
```

- [ ] **Step 2: Add a local store module in `apps/client/src/store.ts`**

Implement only local persistence helpers:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { Workspace } from './types.js';

export const DATA_DIR = findDataDir();
export const workspacesFilePath = path.join(DATA_DIR, 'workspaces.json');

export function loadWorkspaces(): Workspace[] { /* local JSON only */ }
export function saveWorkspaces(workspaces: Workspace[]): void { /* local JSON only */ }
export function createWorkspaceId(): string { /* timestamp/random */ }
```

- [ ] **Step 3: Port the session keyboard builder into `apps/client/src/session-controls.ts`**

Keep the existing local-debugged action layout:

```ts
export function buildSessionActionMarkup(options: {
  sessionId: string;
  inputMode?: boolean;
  autoEnter?: boolean;
  includeBackButton?: boolean;
}) {
  return {
    inline_keyboard: [
      [
        { text: '⌨️ Input OFF', callback_data: `session_cmd:${options.sessionId}:toggle_input` },
        { text: '⏎ AutoEnter OFF', callback_data: `session_cmd:${options.sessionId}:toggle_enter` },
        { text: '🔄 Refresh', callback_data: `session_cmd:${options.sessionId}:refresh` }
      ],
      [
        { text: '⎋ Interrupt', callback_data: `session_cmd:${options.sessionId}:send_escape` },
        { text: '⬅️ Up', callback_data: `session_cmd:${options.sessionId}:send_up` },
        { text: '⬇️ Down', callback_data: `session_cmd:${options.sessionId}:send_down` }
      ],
      [
        { text: '⏎ Enter', callback_data: `session_cmd:${options.sessionId}:send_enter` },
        { text: '⏹️ Stop', callback_data: `session_cmd:${options.sessionId}:stop` }
      ]
    ]
  };
}
```

- [ ] **Step 4: Port output helpers into `apps/client/src/session-output.ts`, `session-delivery.ts`, and `prompt-detection.ts`**

Keep only the logic needed for the direct app:

```ts
export function shouldSkipSessionOutput(previousFinalText: string, nextFinalText: string): boolean {
  return Boolean(previousFinalText) && previousFinalText === nextFinalText;
}

export function detectConfirmationPrompt(text: string): boolean {
  // explicit y/n, yes/no, continue?, are you sure?, press enter to confirm
}

export function buildSessionOutputMessages(...) {
  // chunk finalText to Telegram-safe MarkdownV2 code blocks with session buttons
}
```

### Task 2: Convert `apps/client/src/index.ts` into the single runtime

**Files:**
- Modify: `apps/client/src/index.ts`
- Modify: `apps/client/src/terminal.ts`

- [ ] **Step 1: Remove `socket.io-client` bootstrap from `apps/client/src/index.ts`**

Delete:

```ts
import { io, Socket } from 'socket.io-client';
const socket = io(SERVER_URL, { ... });
socket.on('connect', ...);
socket.on('session:start', ...);
socket.on('session:input', ...);
socket.on('session:key', ...);
socket.on('session:stop', ...);
```

Replace with local runtime state:

```ts
const workspaces = loadWorkspaces();
let activeSession: ActiveSessionState | null = null;
const activeDriverRef: { current: TerminalDriver | null } = { current: null };
```

- [ ] **Step 2: Keep preset resolution and PTY spawning in `apps/client/src/terminal.ts`**

Preserve working preset resolution for:

```ts
resolvePreset('powershell');
resolvePreset('bash');
resolvePreset('codex');
resolvePreset('antigravity');
```

Remove `cmd` support from preset maps and any menu-facing definitions.

- [ ] **Step 3: Add local session lifecycle functions in `apps/client/src/index.ts`**

Implement direct helpers:

```ts
function startSession(chatId: number, workspace: Workspace, preset: ActiveSessionState['preset']) { /* spawn locally */ }
function stopSession() { /* kill PTY, clear state */ }
function sendSessionInput(data: string) { /* driver.write */ }
function sendSessionKey(key: string) { /* driver.write */ }
```

Required rules:
- reject start if `activeSession` already exists and is running
- set `ESC` as interrupt key for `codex` and `antigravity`
- clear `lastSentFinalText` on new session

- [ ] **Step 4: Port terminal render and output ticker logic into `apps/client/src/index.ts`**

Move the local-debugged render path out of server and into client:

```ts
const outputBuffer = { current: '' };
const terminalState = createTerminalState();
let outputTicker: NodeJS.Timeout | null = null;

function bufferOutput(chunk: string) { /* apply terminal output and schedule ticker */ }
async function flushOutput(forceSnapshot = false) { /* render finalText and push to Telegram */ }
```

Behavior to preserve:
- exact `finalText` skip only
- confirmation prompt detection with explicit patterns only
- session action buttons on every output message
- one listener chat id only

### Task 3: Port Telegram bot UX into `apps/client/src/bot.ts`

**Files:**
- Create: `apps/client/src/bot.ts`
- Modify: `apps/client/src/index.ts`
- Modify: `apps/client/src/store.ts`

- [ ] **Step 1: Create a focused Telegram bot module in `apps/client/src/bot.ts`**

Port menu patterns from server but remove client ownership concepts:

```ts
export function createBotRuntime(deps: {
  getWorkspaces: () => Workspace[];
  saveWorkspaces: (workspaces: Workspace[]) => void;
  getActiveSession: () => ActiveSessionState | null;
  startSession: (chatId: number, workspaceId: string, preset: ActiveSessionState['preset']) => Promise<void>;
  stopSession: () => Promise<void>;
  sendInput: (data: string) => void;
  sendKey: (key: string) => void;
}) { /* register commands + callback handlers */ }
```

- [ ] **Step 2: Simplify menus for one-machine operation**

Remove all flows related to:
- online clients
- active client selection
- client registry
- per-user workspace ownership

Keep flows for:
- main menu
- workspace list/details
- add/edit/delete workspace
- start preset in selected workspace
- session details and controls

- [ ] **Step 3: Restrict session creation to one active session**

When starting a preset from Telegram:

```ts
if (getActiveSession()?.status === 'running') {
  await ctx.reply('Đã có một session đang chạy. Hãy dừng session hiện tại trước.');
  return;
}
```

- [ ] **Step 4: Wire bot startup from `apps/client/src/index.ts`**

Replace relay startup with:

```ts
const bot = createBotRuntime({ ...deps });
bot.start({
  onStart(botInfo) {
    logger.info('Telegram bot started', { username: botInfo.username });
  }
});
```

### Task 4: Clean environment and dependencies in `apps/client`

**Files:**
- Modify: `apps/client/package.json`
- Modify: `apps/client/.env`

- [ ] **Step 1: Remove relay dependencies from `apps/client/package.json`**

Delete:

```json
"socket.io-client": "^4.7.5"
```

Keep:

```json
"dotenv": "^16.4.5",
"grammy": "^1.22.4",
"node-pty": "^1.0.0"
```

- [ ] **Step 2: Add or keep only direct-app env keys in `apps/client/.env`**

Target config:

```env
TELEGRAM_BOT_TOKEN=...
ADMIN_USERNAME=@quangnv1311
CLIENT_NAME=Codex1
TELEGRAM_USERNAME=@quangnv1311
OUTPUT_INTERVAL=20000
MAX_OUTPUT_LINES=50
```

Delete relay-only keys:

```env
SERVER_URL=...
SERVER_CLIENT_AUTH_TOKEN=...
```

### Task 5: Remove tests and relay-era codepaths

**Files:**
- Delete: `apps/server/src/*.test.ts`
- Delete: `apps/server/src/*`
- Delete: `apps/server/package.json`
- Delete: `apps/server/tsconfig.json`
- Delete: `apps/server/.env`
- Modify: repo files affected by imports/scripts

- [ ] **Step 1: Remove all test files requested for this migration**

Delete:

```text
apps/server/src/prompt-detection.test.ts
apps/server/src/session-controls.test.ts
apps/server/src/session-delivery.test.ts
apps/server/src/session-output.test.ts
apps/server/src/username-diagnostics.test.ts
```

- [ ] **Step 2: Remove the entire `apps/server` app**

Delete the directory after client migration is complete and buildable.

- [ ] **Step 3: Remove any remaining socket-specific imports and code**

Search and eliminate:

```text
socket.io
socket.io-client
SERVER_URL
SERVER_CLIENT_AUTH_TOKEN
activeClients
client:hello
session:start
session:input
session:key
session:stop
```

### Task 6: Manual runtime verification

**Files:**
- Modify only if runtime fixes are required during validation

- [ ] **Step 1: Build the direct app**

Run:

```bash
cd apps/client
npm run build
```

Expected: TypeScript build succeeds with no server dependency remaining.

- [ ] **Step 2: Start the single local app with clean logs**

Run:

```bash
cd apps/client
node dist/index.js
```

Expected:
- Telegram bot starts
- no socket connection attempt
- no relay auth logs

- [ ] **Step 3: Validate workspace menu and preset launch**

Manual checks in Telegram:
- list workspaces
- add/edit/delete workspace
- start `powershell`
- stop it
- start `bash`
- stop it
- start `codex`
- stop it
- start `antigravity`
- stop it

- [ ] **Step 4: Validate one-session-only enforcement**

Manual check:
- start one session
- attempt to start another

Expected: bot rejects the second start and keeps the first session active.

- [ ] **Step 5: Validate output behavior**

Manual checks:
- output arrives every configured interval
- identical `finalText` is skipped
- changing `finalText` is sent
- confirmation prompt detection only triggers on explicit confirmation text
- Codex/MCP loading noise does not trigger confirmation prompt actions
