# nonstop

`nonstop` is a terminal control center for a local Telegram-driven runtime. It gives you a root-level CLI/TUI for setup, config editing, workspace management, startup-with-OS integration, runtime status, and log inspection, while the Telegram bot controls PTY sessions in the background.

## Core Features
* Full-screen `nonstop` control center at the repository root
* First-run setup wizard for `TELEGRAM_BOT_TOKEN`, Telegram username, language, and startup mode
* Background runtime status detection when the bot is already running hidden
* Workspace editing directly from the CLI
* Telegram bot + PTY shell runtime for PowerShell, Bash, Codex, and Antigravity presets
* Optional startup with OS for Windows and Linux
* English and Vietnamese CLI language support

## Layout

```text
/
  src/         application source
  data/        runtime state, workspaces, logs
  dist/        compiled output
  .env         local runtime config
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Start `nonstop`

```bash
npm start
```

If `.env` is missing or incomplete, `nonstop` opens the setup flow and lets you enter Telegram bot token, allowed username, client name, language, and startup mode directly in the terminal.

You can also start the development version with:

```bash
npm run dev
```

## Config

Config lives in the repository root `.env`. Start from [`.env.example`](.env.example).

Key settings:

```ini
TELEGRAM_BOT_TOKEN=
ADMIN_USERNAME=@your_telegram_username
CLIENT_NAME=nonstop-local
TELEGRAM_USERNAME=@your_telegram_username
APP_LANGUAGE=en
STARTUP_MODE=disabled
```

## Runtime Model

- `nonstop` opens the control center UI
- background runtime is started/stopped from the UI
- when a hidden runtime is already active, opening `nonstop` shows its live status instead of starting a duplicate instance
- runtime heartbeat and logs are stored under `data/`

## Workspace Management

Default workspaces are stored in `data/workspaces.json` and can be edited from the CLI. A template is available at [`data/workspaces.json.template`](data/workspaces.json.template).

## Security

This tool exposes local shell access through Telegram. Keep the bot token private, limit the allowed Telegram account carefully, and avoid running it with unnecessary operating-system privileges.
