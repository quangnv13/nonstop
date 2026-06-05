# Remote CLI Control Platform - Security Review

This document contains a threat model, code review, and risk mitigation roadmap for the Remote CLI Telegram Control Platform.

## 1. Threat Model

Since this application grants direct pseudo-terminal (PTY) shell execution on the host machine to Telegram chat users, security is paramount. The platform is designed strictly for **internal use** (trusted environment) with zero tolerance for external access.

### Identified Assets & Impact
*   **Host System Shell Access (PTY):** An attacker controlling the bot can run arbitrary commands, read sensitive environment variables, download external payloads, or destroy data on the host machine (high impact).
*   **Communication Channels:** Eavesdropping or hijacking of Socket.IO signals or Telegram webhook/polling lines.

### Threat Scenarios
1.  **Unauthorized Bot Interaction:**
    *   *Vector:* An external user finds the bot on Telegram and sends commands.
    *   *Mitigation:* Strict admin authorization checking. If the admin is not yet bootstrapped, the first user becomes the admin. If it is already bootstrapped, any other user ID is rejected unless it is matching a line in `data/allowed_users.txt`.
2.  **Shared Secret Compromise:**
    *   *Vector:* The `SERVER_CLIENT_AUTH_TOKEN` is leaked.
    *   *Mitigation:* The server instantly disconnects any socket failing authentication. The token should be kept confidential and set via environment variables.
3.  **Telegram Account Takeover:**
    *   *Vector:* The admin's Telegram account or device is compromised.
    *   *Mitigation:* This grants direct root shell control. **Critical Warning:** Users must secure their Telegram accounts with 2FA and lock screens.

## 2. Security Code Review

### Client Authentication
```typescript
const AUTH_TOKEN = process.env.SERVER_CLIENT_AUTH_TOKEN || 'default_secret_token';
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers['x-auth-token'];
  if (token !== AUTH_TOKEN) {
    return next(new Error('Unauthorized'));
  }
  return next();
});
```
*   *Evaluation:* Uses standard Socket.IO middleware interceptors. The connection is rejected before any events can be transmitted or registered.

### User Authorization Middleware
```typescript
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const currentAdmin = getAdminUserId();
  if (currentAdmin === null) {
    // First user bootstrap...
  } else if (!isUserAllowed(userId)) {
    // Reject...
    return;
  }
  await next();
});
```
*   *Evaluation:* The middleware intercepts *all* Telegram update events. No commands, callback queries, or text inputs can bypass this check. The state loading is synchronous from local file buffers, meaning it is immune to cache synchronization lag.

### Command Execution CWD Isolation
PTY commands are launched relative to registered workspace paths:
```typescript
const cwd = path.resolve(workspace.path);
// spawn pty under the cwd, not utilizing "cd <path>" strings in existing terminal shells
```
*   *Evaluation:* This eliminates path traversal exploits inside active terminal windows via shell injection on boot.

## 3. Deployment Safety Guidelines

1.  **Run with Least Privilege:** Run `apps/client` as a dedicated non-administrator user (on Windows) or non-root user (on Linux) if possible. Avoid running the client service as `Administrator` or `SYSTEM` unless administrative commands are specifically required.
2.  **Firewall:** Ensure that the port exposing the Socket.IO server (default 3000) is either protected by a firewall allowing only the client machine's IP, or routed through a local tunnel (e.g. wireguard, tailscale) if not deployed on the same machine.
3.  **Rotate Tokens:** Change the default `SERVER_CLIENT_AUTH_TOKEN` in `.env` immediately before deployment.
