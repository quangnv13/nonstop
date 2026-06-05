# Remote CLI Telegram Control Platform

This platform enables real-time, interactive terminal control of remote hosts using a Telegram Bot UI. It is specifically designed to support long-running tasks via terminal CLI tools (such as Codex CLI, Antigravity CLI, Powershell, Bash, and CMD) with live output streaming and interactive prompt confirmation handling.

## Core Features
*   **Workspace-Aware Execution:** Spawn terminals immediately under defined workspaces (`cwd`), without relying on messy `cd` commands.
*   **Interactive PTY Streaming:** Real interactive terminal simulation utilizing `node-pty`, allowing Ctrl+C signals and raw input transmission.
*   **Intelligent Output Buffering:** Buffers output stream chunks (500-1000ms) to avoid spamming the Telegram API.
*   **Interactive Input Mode:** Automatically forwards typed chat messages directly to the active session.
*   **Confirmation Prompts:** Detects questions like `y/n`, `continue?`, `press enter` and shows dedicated quick-reply keyboards (Yes / No / Enter / Ctrl+C).
*   **Bootstrap Authorization:** Zero-config start: the first Telegram user to send `/start` is registered as the owner/admin. Additional users are disallowed unless manually added by ID to `allowed_users.txt`.

---

## 🏗️ Core Architecture

```
       Telegram
          │
          ▼
      grammY Bot
          │
          ▼
   [Server Node.js]
          │
          ▼ (Socket.IO Connection with X-Auth-Token)
   [Client Node.js]
          │
          ▼
       node-pty
          │
    ┌─────┼─────┬──────────────┬─────────────┐
    ▼     ▼     ▼              ▼             ▼
Powershell CMD Bash        Codex CLI   Antigravity CLI
```

---

## ⚡ Quick Start

### 1. Prerequisites
Ensure you have **Node.js LTS (v22+)** and npm installed. On Windows, compiling native node-pty bindings requires build tools:
```powershell
npm install --global windows-build-tools
# Or install Visual Studio Desktop Development with C++ workloads
```

### 2. Install Dependencies
Clone the repository and run the installation script at the monorepo root:
```bash
npm install
```

### 3. Configuration Setup
Create local environmental files based on templates.

#### Server Configuration (`apps/server/.env`):
```ini
PORT=3000
TELEGRAM_BOT_TOKEN=your_bot_token_here
SERVER_CLIENT_AUTH_TOKEN=super_secure_client_token_123
STRIP_ANSI=true
```

#### Client Configuration (`apps/client/.env`):
```ini
SERVER_URL=http://localhost:3000
SERVER_CLIENT_AUTH_TOKEN=super_secure_client_token_123
CLIENT_NAME=MyWorkstation
```

---

## 🚀 Running the Platform

1.  **Start the Server:**
    ```bash
    npm run dev:server
    ```
2.  **Bootstrap Admin:**
    Search for your bot username on Telegram and click `/start`. You are now registered as the Admin.
3.  **Start the Client:**
    ```bash
    npm run dev:client
    ```
    This will auto-generate a `data/workspaces.json` registry file containing local directory configuration pointers.
4.  **Control via Telegram:**
    Navigate workspaces and spawn interactive CLI shells directly from your Telegram client inline keyboards!

---

## 📁 Workspace Management
Workspaces are registered on the client machine inside `data/workspaces.json`. You can add, edit, or customize paths as needed:
```json
[
  {
    "id": "project_backend",
    "name": "HTS Backend",
    "path": "D:/Projects/HTS/backend"
  },
  {
    "id": "project_dashboard",
    "name": "Dashboard CLI",
    "path": "D:/Projects/dashboard"
  }
]
```
Clients will report workspace updates to the server registry dynamically on reconnect/startup.

---

## ⌨️ Telegram Commands
*   `/start` - Shows the interactive menu launcher.
*   `/help` - Lists bot commands and parameters.
*   `/status` - Displays active client registrations and session stats.
*   `/allow <telegram_user_id>` - (Admin Only) Allow another Telegram user access to the bot.
*   `/send <raw text>` - Send a specific input string to the active terminal session.
*   `/enter` - Send a carriage return key.
*   `/ctrlc` - Transmit a cancellation signal (`SIGINT`).
*   `/input_on` / `/input_off` - Toggle Interactive Input Mode.
*   `/input_enter_on` / `/input_enter_off` - Toggle automatic Enter suffix appending.

---

## ⚠️ Critical Security Warning
> [!CAUTION]
> This application gives direct, authenticated shell terminal access on your client machine to Telegram users.
> 1. Ensure your `SERVER_CLIENT_AUTH_TOKEN` is rotated, complex, and confidential.
> 2. Secure your Telegram account with Two-Factor Authentication (2FA) and device passcode locks.
> 3. Do not run the client agent under root or administrative shell privileges if possible.
