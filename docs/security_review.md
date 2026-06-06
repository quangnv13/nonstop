# nonstop - Security Review

This document contains a threat model, code review, and risk mitigation roadmap for `nonstop`.

## 1. Threat Model

Since this application grants direct pseudo-terminal (PTY) shell execution on the host machine to Telegram chat users, security is paramount. The platform is designed strictly for **internal use** (trusted environment) with zero tolerance for external access.

### Identified Assets & Impact
*   **Host System Shell Access (PTY):** An attacker controlling the bot can run arbitrary commands, read sensitive environment variables, download external payloads, or destroy data on the host machine (high impact).
*   **Communication Channels:** Telegram bot polling traffic and local control operations on the host.

### Threat Scenarios
1.  **Unauthorized Bot Interaction:**
    *   *Vector:* An external user finds the bot on Telegram and sends commands.
    *   *Mitigation:* Strict admin authorization checking. If the admin is not yet bootstrapped, the first user becomes the admin. If it is already bootstrapped, any other user ID is rejected unless it is matching a line in `data/allowed_users.txt`.
2.  **Telegram Account Takeover:**
    *   *Vector:* The admin's Telegram account or device is compromised.
    *   *Mitigation:* This grants direct root shell control. **Critical Warning:** Users must secure their Telegram accounts with 2FA and lock screens.

## 2. Security Code Review

### User Authorization Middleware
```typescript
bot.use(async (ctx, next) => {
  const username = normalizeUsername(ctx.from?.username);
  if (allowedUsername && username !== allowedUsername) {
    await ctx.reply('This bot is restricted to the configured local Telegram account.');
    return;
  }
  await next();
});
```
*   *Evaluation:* The middleware intercepts *all* Telegram update events. No commands, callback queries, or text inputs can bypass the configured local-account restriction.

### Command Execution CWD Isolation
PTY commands are launched relative to registered workspace paths:
```typescript
const cwd = path.resolve(workspace.path);
// spawn pty under the cwd, not utilizing "cd <path>" strings in existing terminal shells
```
*   *Evaluation:* This eliminates path traversal exploits inside active terminal windows via shell injection on boot.

## 3. Deployment Safety Guidelines

1.  **Run with Least Privilege:** Run `nonstop` as a dedicated non-administrator user (on Windows) or non-root user (on Linux) if possible. Avoid running the runtime as `Administrator` or `SYSTEM` unless elevated shell access is explicitly required.
2.  **Protect the Telegram Account:** Secure the allowed Telegram account with 2FA and device lock, because Telegram becomes the remote control plane for the local shell.
3.  **Protect the Bot Token:** Keep `TELEGRAM_BOT_TOKEN` private and never commit it into version control.
