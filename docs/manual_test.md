# Remote CLI Telegram Control Platform - Manual & Integration Testing Guide

This document guides you through smoke testing and validating the platform features.

## 1. Prerequisites Checklist
- [ ] Node.js LTS (v22+) is installed.
- [ ] Windows Build Tools (or Visual Studio Build Tools with C++) installed if compiling native binaries on Windows.
- [ ] A Telegram Bot Token from `@BotFather`.
- [ ] The server and client environment files configured (`.env`).

---

## 2. Step-by-Step Smoke Test

### Step 2.1: Server Setup
1. Open a terminal in `apps/server` or root and ensure `.env` has your `TELEGRAM_BOT_TOKEN`.
2. Clean database data (optional): Delete the `data` directory if you want a fresh run.
3. Start the server:
   ```bash
   npm run dev:server
   ```
4. Verify server output:
   * `[Server] Socket.IO server running on port 3000`
   * `[Bot] Telegram bot @YourBotName started successfully.`

### Step 2.2: First Admin Bootstrap
1. Open your Telegram client and search for your bot.
2. Send the `/start` command.
3. Verify that the bot replies with:
   `🎉 First User Bootstrap: You are now the Admin!`
4. Open the `data/admin.json` file on the server. Ensure your Telegram ID is saved there.
5. Send `/status` to the bot and verify the stats match.

### Step 2.3: Allowed User list testing
1. Ask a friend or use a second Telegram account to message the bot with `/start`.
2. Verify they get a `❌ Unauthorized: You do not have access.` message.
3. From the Admin account, send `/allow <second-user-id>`.
4. Verify the bot replies with `✅ Added user ID ... to allowed list.`
5. Check `data/allowed_users.txt` to confirm the ID was written.
6. Send `/start` from the second account again; verify they can now view the Main Menu.

### Step 2.4: Client Connection
1. In another terminal, run:
   ```bash
   npm run dev:client
   ```
2. Verify client console logs:
   * `🔌 Connecting to Remote CLI Server...`
   * `🟢 Connected to server successfully. Socket ID: ...`
3. Verify server logs:
   * `[Socket] Client connected: ...`
   * `[Socket] client:hello from ...`
4. On Telegram, tap **🖥️ Clients** from the Main Menu. Verify your client machine shows up as `🟢 MyWorkstation - Online`.

### Step 2.5: Spawn Terminal Sessions
1. In Telegram, go back to **Main Menu** -> **📁 Workspaces**.
2. Select one of the auto-generated workspaces (e.g. `Server Backend`).
3. Under CLI Presets, select **Powershell** (or **CMD** if on Windows).
4. Verify the bot replies:
   `🚀 Starting powershell in workspace Server Backend...`
5. Verify you get the initial shell banner output in Telegram.
6. Verify the active session details keypad is shown.

### Step 2.6: Interactive Input & Controls
1. Type a command (e.g. `whoami` or `dir` / `ls`) directly into the Telegram chat box and send it.
2. Verify the command gets sent, and the output is streamed back inside a code block.
3. Tap the **⏎ Send Enter** button. Verify a carriage return is transmitted.
4. Run a persistent command (e.g. `ping 127.0.0.1 -t` on Windows or `ping 127.0.0.1` on Linux).
5. Let it stream for a few seconds. Tap the **🛑 Ctrl+C** button.
6. Verify that the ping execution halts and returns control to the shell prompt.

### Step 2.7: Confirmation Prompt Flow
1. Run a command that prompts for confirmation. For example, run:
   * On CMD/Powershell: `rmdir /s non_existent_folder` (it will ask `..., Are you sure (Y/N)?`)
2. Verify that the bot intercepts this prompt and pops up a custom menu:
   * `Yes (y)`
   * `No (n)`
   * `Enter`
   * `Ctrl+C`
3. Tap `Yes (y)` or `No (n)` and verify the terminal processes the response correctly.

---

## 3. Windows-Specific Verification Checklist
Since Windows command paths and terminal shell behaviors are distinct from Unix:
- [ ] Command resolution: Ensure `powershell.exe` and `cmd.exe` spawn clean shells (no crash or loop).
- [ ] Backslash resolution: Paths in `data/workspaces.json` should support either forward slashes (`/`) or escaped backslashes (`\\`). The client converts them properly to prevent PTY spawning crashes.
- [ ] global commands: If `codex` or `antigravity` are installed, check if `codex.cmd` and `antigravity.cmd` are properly located within the user's `PATH`. If they throw errors, utilize the `CODEX_CMD` or `ANTIGRAVITY_CMD` overrides in `apps/client/.env`.
