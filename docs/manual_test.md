# nonstop - Manual Verification Guide

This document covers manual smoke verification for the root-level `nonstop` CLI/TUI and its background Telegram runtime.

## 1. Prerequisites
- [ ] Node.js LTS is installed.
- [ ] Windows build tools are available if `node-pty` needs native compilation.
- [ ] A Telegram bot token from `@BotFather`.
- [ ] Root `.env` is configured, or you are ready to complete setup in the wizard.

## 2. Root CLI Verification

### Step 2.1: Build and launch
1. Open a terminal at the repository root.
2. Run:
   ```bash
   npm run build
   npm start
   ```
3. If config is incomplete, verify `nonstop` opens the setup wizard.
4. Enter bot token, Telegram username, client name, language, and startup mode.
5. Verify the app writes `.env` at the repository root.

### Step 2.2: Dashboard behavior
1. Re-open `npm start`.
2. Verify the control center dashboard renders.
3. Verify it shows:
   * runtime status
   * client name
   * language
   * startup mode
   * active session info when available

### Step 2.3: Background runtime detection
1. From the dashboard, start the background runtime.
2. Close the UI.
3. Run `npm start` again.
4. Verify the dashboard reports that the runtime is already running instead of starting a duplicate process.

### Step 2.4: Config editing from CLI
1. Open the config editor from the dashboard.
2. Change at least one value such as `CLIENT_NAME` or `ADMIN_USERNAME`.
3. Verify the updated values are saved in `.env`.

### Step 2.5: Workspace editing from CLI
1. Open workspace management from the dashboard.
2. Add a temporary workspace.
3. Edit it.
4. Delete it.
5. Verify `data/workspaces.json` reflects each change.

### Step 2.6: Startup with OS
1. Open startup configuration from the dashboard.
2. Select `background` or `open-ui`.
3. Verify the app creates the expected Windows or Linux startup artifact.
4. Switch back to `disabled` and verify the artifact is removed.

## 3. Telegram Runtime Verification

### Step 3.1: Telegram access
1. Start the background runtime from the dashboard.
2. Open Telegram and message the bot.
3. Send `/start`.
4. Verify the main menu appears.
5. Send `/status`.
6. Verify the bot reports workspace and runtime status.

### Step 3.2: Workspace and session flow
1. Open **Workspaces** from Telegram.
2. Select a workspace.
3. Start a `Powershell` session on Windows, or `Bash` where available.
4. Verify shell output appears in Telegram.

### Step 3.3: Interactive control
1. Send a command such as `pwd`, `dir`, or `Get-Location`.
2. Verify output is returned.
3. Use session buttons for `Enter`, `Up`, `Down`, and `Interrupt`.
4. Verify session controls continue working.

### Step 3.4: Confirmation prompt handling
1. Run a command that triggers a confirmation prompt.
2. Verify the Telegram confirmation keyboard appears.
3. Send a confirmation action.
4. Verify the PTY receives the action.

## 4. Platform Notes
- [ ] On Windows, `powershell.exe` launches cleanly under `node-pty`.
- [ ] On Linux, startup integration writes either a user service or desktop autostart entry.
- [ ] If `codex` or `agy` are not globally available, `CODEX_CMD` or `ANTIGRAVITY_CMD` in the root `.env` work as expected.
