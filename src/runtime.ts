import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createBotRuntime, BotRuntime, loadLastChatId } from './bot.js';
import { getCurrentVersion } from './runtime-manager.js';
import { AppConfig, saveConfigToDisk, applyConfigToProcessEnv } from './config.js';
import { logger, cleanOldLogs } from './logger.js';
import { RuntimeStateSnapshot, saveRuntimeState, clearRuntimeState, getIpcSocketPath } from './runtime-state.js';
import * as net from 'net';
import { shouldSkipSessionOutput } from './session-delivery.js';
import { buildSessionOutputMessages, SessionOutputMessage } from './session-output.js';
import { loadWorkspaces, saveWorkspaces as persistWorkspaces } from './store.js';
import {
  NodePtyTerminalDriver,
  resolvePreset,
  SUPPORTED_PRESETS,
  TerminalDriver,
  VirtualTerminal
} from './terminal.js';
import { ActiveSessionState, SessionPreset, Workspace } from './types.js';

// VirtualTerminal represents the terminal screen buffer.

type SessionOutputPushCallback = (
  chatId: number,
  text: string,
  options?: SessionOutputMessage['options']
) => Promise<void>;

export class NonstopRuntime {
  private config: AppConfig;
  private mode: 'background' | 'foreground';
  private startedAt = new Date().toISOString();
  private lastError: string | null = null;
  private workspaces = loadWorkspaces();
  private activeSession: ActiveSessionState | null = null;
  private activeDriverRef: { current: TerminalDriver | null } = { current: null };
  private outputBuffer = { current: '' };
  private terminalState: VirtualTerminal;
  private outputTicker: NodeJS.Timeout | null = null;
  private actionOutputTimeout: NodeJS.Timeout | null = null;
  private heartbeatTicker: NodeJS.Timeout | null = null;
  private connectionCheckTicker: NodeJS.Timeout | null = null;
  private telegramConnected = false;
  private lastLogCleanupAt: number = 0;
  private onSessionOutputPush: SessionOutputPushCallback | null = null;
  private bot: BotRuntime | null = null;
  private ipcServer: net.Server | null = null;
  private activeIpcSockets = new Set<net.Socket>();
  private activeFlushPromise: Promise<void> | null = null;
  private nextFlushPromise: Promise<void> | null = null;
  private nextFlushResolve: (() => void) | null = null;
  private nextFlushIgnoreDuplicate = false;
  private nextFlushForceSnapshot = false;

  constructor(config: AppConfig, mode: 'background' | 'foreground') {
    this.config = config;
    this.mode = mode;
    const cols = 80;
    const rows = Math.max(24, this.config.maxOutputLines);
    this.terminalState = new VirtualTerminal(cols, rows);
  }

  getStatus(): RuntimeStateSnapshot {
    return {
      pid: process.pid,
      startedAt: this.startedAt,
      lastHeartbeatAt: new Date().toISOString(),
      mode: this.mode,
      clientName: this.config.clientName || os.hostname() || 'LocalClient',
      botRunning: this.bot !== null,
      telegramConnected: this.telegramConnected,
      workspaceCount: this.workspaces.length,
      activeSession: this.activeSession,
      lastError: this.lastError
    };
  }

  getWorkspaces(): Workspace[] {
    return this.workspaces;
  }

  saveWorkspaces(nextWorkspaces: Workspace[]): void {
    this.workspaces = [...nextWorkspaces];
    persistWorkspaces(this.workspaces);
    this.writeHeartbeat();
  }

  getActiveSession(): ActiveSessionState | null {
    return this.activeSession;
  }

  getConfig(): AppConfig {
    return this.config;
  }

  async saveConfig(nextConfig: AppConfig): Promise<void> {
    const tokenChanged = this.config.telegramBotToken !== nextConfig.telegramBotToken;
    this.config = nextConfig;
    saveConfigToDisk(nextConfig);
    applyConfigToProcessEnv(nextConfig);
    this.writeHeartbeat();

    if (tokenChanged) {
      setTimeout(() => {
        void this.restartBot();
      }, 1000);
    }
  }

  async restartBot(): Promise<void> {
    logger.info('Restarting Telegram bot due to token change...');
    await this.stopBot();
    await this.startBot();
  }

  async startBot(): Promise<void> {
    if (this.bot) {
      return;
    }

    const ipcPath = path.join(process.cwd(), 'data', 'ipc-command.json');
    if (fs.existsSync(ipcPath)) {
      try {
        fs.unlinkSync(ipcPath);
      } catch {
        // ignore
      }
    }

    logger.info('nonstop runtime bootstrap complete', {
      clientName: this.config.clientName,
      telegramUsername: this.config.telegramUsername,
      workspaceCount: this.workspaces.length,
      supportedPresets: SUPPORTED_PRESETS,
      mode: this.mode
    });

    this.bot = createBotRuntime({
      getConfig: () => this.getConfig(),
      saveConfig: async (config) => {
        await this.saveConfig(config);
      },
      getWorkspaces: () => this.getWorkspaces(),
      saveWorkspaces: (workspaces) => this.saveWorkspaces(workspaces),
      getActiveSession: () => this.getActiveSession(),
      startSession: async (chatId, workspaceId, preset) => {
        await this.startSession(chatId, this.resolveWorkspaceById(workspaceId), preset);
      },
      stopSession: async () => this.stopSession(),
      sendInput: (data) => this.sendSessionInput(data),
      sendKey: (key) => this.sendSessionKey(key),
      setInputMode: (inputMode) => this.setSessionInputMode(inputMode),
      setAutoEnter: (autoEnter) => this.setSessionAutoEnter(autoEnter),
      flushSessionOutput: () => this.flushSessionOutput()
    });

    this.setSessionOutputPushCallback(async (chatId, text, options) => {
      await this.bot?.pushSessionOutput(chatId, text, options);
    });

    // Ghi heartbeat TRƯỚC khi bot connect để UI polling nhận ngay trạng thái RUNNING
    this.startHeartbeat();
    this.startIpcServer();

    await this.bot.start({
      onStart: async (botInfo) => {
        logger.info('Telegram bot started', {
          username: botInfo.username,
          mode: this.mode
        });

        // Send startup notification to Telegram
        const lastChatId = loadLastChatId();
        if (lastChatId && this.bot) {
          try {
            const version = getCurrentVersion();
            const startupMsg = this.config.language === 'vi'
              ? `✅ nonstop client (v${version}) đã khởi động thành công và đang chạy!\n🖥 Client: ${this.config.clientName}`
              : `✅ nonstop client (v${version}) started successfully and is running!\n🖥 Client: ${this.config.clientName}`;
            await this.bot.pushSessionOutput(lastChatId, startupMsg);
          } catch {
            // ignore
          }
        }
      }
    });

    // Setup connection healthcheck
    if (this.connectionCheckTicker) {
      clearInterval(this.connectionCheckTicker);
    }
    this.connectionCheckTicker = setInterval(async () => {
      if (this.bot) {
        this.telegramConnected = await this.bot.checkConnection();
        this.writeHeartbeat();
      }
    }, 15000);

    // Initial check
    if (this.bot) {
      this.bot.checkConnection().then((connected) => {
        this.telegramConnected = connected;
        this.writeHeartbeat();
      });
    }
  }

  async stopBot(): Promise<void> {
    await this.stopSession();

    if (this.connectionCheckTicker) {
      clearInterval(this.connectionCheckTicker);
      this.connectionCheckTicker = null;
    }
    this.telegramConnected = false;

    if (this.bot) {
      await this.bot.stop();
      this.bot = null;
    }

    if (this.heartbeatTicker) {
      clearInterval(this.heartbeatTicker);
      this.heartbeatTicker = null;
    }

    this.stopIpcServer();
    clearRuntimeState();
  }

  setSessionInputMode(inputMode: boolean): void {
    if (this.activeSession) {
      this.activeSession.inputMode = inputMode;
      this.writeHeartbeat();
    }
  }

  setSessionAutoEnter(autoEnter: boolean): void {
    if (this.activeSession) {
      this.activeSession.autoEnter = autoEnter;
      this.writeHeartbeat();
    }
  }

  async flushSessionOutput(): Promise<void> {
    this.triggerActionOutputTimeout();
  }

  private triggerActionOutputTimeout(): void {
    if (this.outputTicker) {
      clearInterval(this.outputTicker);
      this.outputTicker = null;
    }
    if (this.actionOutputTimeout) {
      clearTimeout(this.actionOutputTimeout);
      this.actionOutputTimeout = null;
    }
    this.actionOutputTimeout = setTimeout(async () => {
      this.actionOutputTimeout = null;
      await this.flushOutput(true, true);
      this.ensureOutputTicker();
    }, this.config.actionInterval);
  }

  async startSession(
    chatId: number,
    workspace: Workspace,
    preset: ActiveSessionState['preset']
  ): Promise<void> {
    if (this.activeSession?.status === 'running') {
      throw new Error(`Session "${this.activeSession.sessionId}" is already running.`);
    }

    const cwd = path.resolve(workspace.path);
    if (!fs.existsSync(cwd)) {
      throw new Error(`Workspace path "${cwd}" does not exist.`);
    }

    const { command, args } = resolvePreset(preset);
    const sessionId = createSessionId(preset);
    this.resetOutputRuntime();

    const nextSession: ActiveSessionState = {
      sessionId,
      preset,
      cwd,
      status: 'running',
      listenerChatId: chatId,
      lastSentFinalText: '',
      inputMode: true,
      autoEnter: true
    };

    logger.info('Starting local session', {
      sessionId,
      preset,
      chatId,
      cwd,
      command,
      args
    });

    try {
      const cols = 80;
      const rows = Math.max(24, this.config.maxOutputLines);
      const driver = new NodePtyTerminalDriver(command, args, cwd, cols, rows);
      this.activeSession = nextSession;
      this.activeDriverRef.current = driver;
      this.writeHeartbeat();

      driver.onData((chunk) => {
        this.bufferOutput(chunk);
        this.broadcastToIpcClients({ type: 'output', data: chunk });
      });

      driver.onExit((code, signal) => {
        void this.handleDriverExit(sessionId, code, signal);
      });
    } catch (error) {
      this.activeSession = null;
      this.activeDriverRef.current = null;
      this.resetOutputRuntime();
      this.lastError = error instanceof Error ? error.message : String(error);
      this.writeHeartbeat();
      throw error;
    }
  }

  async stopSession(): Promise<void> {
    const session = this.activeSession;
    if (!session || session.status !== 'running') {
      return;
    }

    session.status = 'stopped';
    const driver = this.activeDriverRef.current;
    this.activeDriverRef.current = null;

    if (driver) {
      driver.kill();
    }

    await this.flushOutput(true);
    this.resetOutputRuntime();
    this.activeSession = null;
    this.writeHeartbeat();

    logger.info('Stopped local session', {
      sessionId: session.sessionId
    });
  }

  sendSessionInput(data: string): void {
    const driver = this.activeDriverRef.current;
    if (!driver || this.activeSession?.status !== 'running') {
      logger.warn('Dropping session input because no active session is running', {
        length: data.length
      });
      return;
    }

    driver.write(data);

    if (data.includes('\r') || data.includes('\n')) {
      this.triggerActionOutputTimeout();
    }
  }

  sendSessionKey(key: string): void {
    const driver = this.activeDriverRef.current;
    const session = this.activeSession;
    if (!driver || !session || session.status !== 'running') {
      logger.warn('Dropping session key because no active session is running', { key });
      return;
    }

    const input = resolveKeyInput(key, session.preset);
    if (!input) {
      logger.warn('Ignoring unsupported session key', {
        key,
        preset: session.preset
      });
      return;
    }

    driver.write(input);

    if (['send_escape', 'send_enter', 'send_up', 'send_down'].includes(key)) {
      this.triggerActionOutputTimeout();
    }
  }

  private resolveWorkspaceById(workspaceId: string): Workspace {
    const workspace = this.workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) {
      throw new Error(`Workspace "${workspaceId}" not found.`);
    }

    return workspace;
  }

  private setSessionOutputPushCallback(callback: SessionOutputPushCallback | null): void {
    this.onSessionOutputPush = callback;
  }

  private startHeartbeat(): void {
    this.writeHeartbeat();

    if (this.heartbeatTicker) {
      clearInterval(this.heartbeatTicker);
    }

    try {
      cleanOldLogs();
      this.lastLogCleanupAt = Date.now();
    } catch {
      // ignore
    }

    this.heartbeatTicker = setInterval(() => {
      this.writeHeartbeat();
      void this.checkIpcCommands();

      const now = Date.now();
      if (now - this.lastLogCleanupAt > 3600000) {
        this.lastLogCleanupAt = now;
        try {
          cleanOldLogs();
        } catch {
          // ignore
        }
      }
    }, 2000);
  }

  private async checkIpcCommands(): Promise<void> {
    const ipcPath = path.join(process.cwd(), 'data', 'ipc-command.json');
    if (!fs.existsSync(ipcPath)) {
      return;
    }

    try {
      const content = fs.readFileSync(ipcPath, 'utf8');
      const cmd = JSON.parse(content);
      if (cmd.action === 'stop-session') {
        logger.info('Received IPC command to stop session via file');
        await this.stopSession();
      }
    } catch (error) {
      logger.error('Error handling IPC command', {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      try {
        fs.unlinkSync(ipcPath);
      } catch {
        // ignore
      }
    }
  }

  private writeHeartbeat(): void {
    saveRuntimeState(this.getStatus());
  }

  private async handleDriverExit(
    sessionId: string,
    code: number,
    signal?: number
  ): Promise<void> {
    const session = this.activeSession;
    if (!session || session.sessionId !== sessionId || session.status !== 'running') {
      return;
    }

    session.status = 'stopped';
    this.activeDriverRef.current = null;
    this.broadcastToIpcClients({ type: 'exit', code });

    await this.flushOutput(true);
    this.resetOutputRuntime();
    this.activeSession = null;
    this.writeHeartbeat();

    logger.warn('Local PTY session exited', {
      sessionId,
      code,
      signal
    });

    if (this.onSessionOutputPush) {
      try {
        await this.onSessionOutputPush(
          session.listenerChatId,
          `Session \`${sessionId}\` exited with code \`${code}\`.`
        );
      } catch (err) {
        logger.error('Failed to push session exit notification to Telegram', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  private bufferOutput(chunk: string): void {
    if (!this.activeSession) {
      return;
    }

    this.outputBuffer.current += chunk;
    this.terminalState.write(chunk);
    this.ensureOutputTicker();
  }

  private async flushOutput(forceSnapshot = false, ignoreDuplicate = false): Promise<void> {
    // If nothing is currently flushing, we can run immediately
    if (!this.activeFlushPromise) {
      this.activeFlushPromise = this.flushOutputInternal(forceSnapshot, ignoreDuplicate)
        .catch((err) => {
          logger.error('Error during flushOutput execution', { err });
        })
        .finally(() => {
          this.activeFlushPromise = null;
          this.triggerNextFlush();
        });
      return this.activeFlushPromise;
    }

    // A flush is already running. We need to ensure a flush runs after it completes
    // to capture any new changes.
    if (ignoreDuplicate) {
      this.nextFlushIgnoreDuplicate = true;
    }
    if (forceSnapshot) {
      this.nextFlushForceSnapshot = true;
    }

    if (!this.nextFlushPromise) {
      this.nextFlushPromise = new Promise<void>((resolve) => {
        this.nextFlushResolve = resolve;
      });
    }

    return this.nextFlushPromise;
  }

  private triggerNextFlush(): void {
    if (!this.nextFlushPromise) {
      return;
    }

    const resolve = this.nextFlushResolve;
    const forceSnap = this.nextFlushForceSnapshot;
    const ignoreDup = this.nextFlushIgnoreDuplicate;

    // Reset pending state for the next cycle
    this.nextFlushPromise = null;
    this.nextFlushResolve = null;
    this.nextFlushForceSnapshot = false;
    this.nextFlushIgnoreDuplicate = false;

    // Start the scheduled flush
    this.activeFlushPromise = this.flushOutputInternal(forceSnap, ignoreDup)
      .catch((err) => {
        logger.error('Error during flushOutput execution', { err });
      })
      .finally(() => {
        this.activeFlushPromise = null;
        resolve?.();
        this.triggerNextFlush();
      });
  }

  private async flushOutputInternal(forceSnapshot = false, ignoreDuplicate = false): Promise<void> {
    const session = this.activeSession;
    if (!session) {
      this.outputBuffer.current = '';
      return;
    }

    const text = this.outputBuffer.current;
    this.outputBuffer.current = '';

    const promptDetectionText = stripAnsi(text);
    const snapshot = renderTerminalSnapshot(this.terminalState, this.config.maxOutputLines);
    const finalText = snapshot || limitLines(promptDetectionText, this.config.maxOutputLines);

    if (this.activeIpcSockets.size > 0) {
      // User is active locally. Clear buffer, sync lastSentFinalText, but skip Telegram messaging.
      session.lastSentFinalText = finalText;
      return;
    }

    if (!text && !forceSnapshot) {
      return;
    }

    if (!finalText.trim()) {
      return;
    }

    // Lọc loading spinner và window title residue
    if (isSpinnerOrNoiseOutput(finalText)) {
      return;
    }

    if (!ignoreDuplicate && shouldSkipSessionOutput(session.lastSentFinalText, finalText)) {
      return;
    }

    const messages = buildSessionOutputMessages({
      sessionId: session.sessionId,
      snapshot: finalText,
      inputMode: session.inputMode,
      autoEnter: session.autoEnter,
      language: this.config.language
    });

    if (!this.onSessionOutputPush) {
      session.lastSentFinalText = finalText;
      return;
    }

    for (const message of messages) {
      try {
        await this.onSessionOutputPush(session.listenerChatId, message.text, message.options);
      } catch (err) {
        logger.error('Failed to push session output to Telegram', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    session.lastSentFinalText = finalText;
  }

  private ensureOutputTicker(): void {
    if (this.outputTicker || this.actionOutputTimeout) {
      return;
    }

    this.outputTicker = setInterval(() => {
      void this.flushOutput(true);
    }, this.config.outputInterval);
  }

  private resetOutputRuntime(): void {
    if (this.outputTicker) {
      clearInterval(this.outputTicker);
      this.outputTicker = null;
    }
    if (this.actionOutputTimeout) {
      clearTimeout(this.actionOutputTimeout);
      this.actionOutputTimeout = null;
    }

    this.outputBuffer.current = '';
    const cols = 80;
    const rows = Math.max(24, this.config.maxOutputLines);
    this.terminalState = new VirtualTerminal(cols, rows);

    if (this.activeSession) {
      this.activeSession.lastSentFinalText = '';
    }
  }

  private startIpcServer(): void {
    if (this.ipcServer) return;

    const socketPath = getIpcSocketPath();

    if (process.platform !== 'win32') {
      try {
        const socketDir = path.dirname(socketPath);
        if (!fs.existsSync(socketDir)) {
          fs.mkdirSync(socketDir, { recursive: true });
        }
        if (fs.existsSync(socketPath)) {
          fs.unlinkSync(socketPath);
        }
      } catch (err) {
        logger.error('Failed to unlink existing IPC socket file', { err });
      }
    }

    this.ipcServer = net.createServer((socket) => {
      logger.info('IPC client connected to background session');
      this.activeIpcSockets.add(socket);

      // Immediately send the current screen snapshot to the newly connected client
      const snapshot = renderTerminalSnapshot(this.terminalState, this.config.maxRenderLines);
      const initOutput = '\u001b[2J\u001b[H' + snapshot;
      socket.write(JSON.stringify({ type: 'output', data: initOutput }) + '\n');

      let buffer = '';
      socket.on('data', (data) => {
        buffer += data.toString();
        let boundary = buffer.indexOf('\n');
        while (boundary !== -1) {
          const line = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 1);
          if (line) {
            try {
              const msg = JSON.parse(line);
              this.handleIpcClientMessage(msg);
            } catch (err) {
              logger.error('Error parsing IPC client message', { err, line });
            }
          }
          boundary = buffer.indexOf('\n');
        }
      });

      socket.on('error', (err) => {
        logger.error('IPC client socket error', { err });
      });

      socket.on('close', () => {
        logger.info('IPC client disconnected');
        this.activeIpcSockets.delete(socket);
        if (this.activeIpcSockets.size === 0) {
          // Immediately flush the final state of the session to Telegram
          void this.flushOutput(true, true);
        }
      });
    });

    this.ipcServer.listen(socketPath, () => {
      logger.info(`IPC Server listening on ${socketPath}`);
    });

    this.ipcServer.on('error', (err) => {
      logger.error('IPC Server error', { err });
    });
  }

  private handleIpcClientMessage(msg: any): void {
    if (!msg || typeof msg !== 'object') return;
    
    switch (msg.type) {
      case 'input':
        if (typeof msg.data === 'string') {
          this.sendSessionInput(msg.data);
        }
        break;
      case 'resize':
        if (typeof msg.cols === 'number' && typeof msg.rows === 'number') {
          const driver = this.activeDriverRef.current;
          if (driver && this.activeSession?.status === 'running') {
            driver.resize(msg.cols, msg.rows);
            this.terminalState.resize(msg.cols, msg.rows);
          }
        }
        break;
      default:
        logger.warn('Unknown IPC message type', { msg });
    }
  }

  private stopIpcServer(): void {
    if (this.ipcServer) {
      for (const socket of this.activeIpcSockets) {
        try {
          socket.destroy();
        } catch {
          // ignore
        }
      }
      this.activeIpcSockets.clear();

      this.ipcServer.close();
      this.ipcServer = null;

      const socketPath = getIpcSocketPath();
      if (process.platform !== 'win32') {
        try {
          if (fs.existsSync(socketPath)) {
            fs.unlinkSync(socketPath);
          }
        } catch {
          // ignore
        }
      }
    }
  }

  private broadcastToIpcClients(msg: any): void {
    if (this.activeIpcSockets.size === 0) return;
    const packet = JSON.stringify(msg) + '\n';
    for (const socket of this.activeIpcSockets) {
      try {
        socket.write(packet);
      } catch (err) {
        logger.error('Failed to write to IPC client socket', { err });
      }
    }
  }
}

function createSessionId(preset: SessionPreset): string {
  return `${preset}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveKeyInput(key: string, preset: SessionPreset): string | null {
  switch (key) {
    case 'send_up':
    case 'up':
      return '\u001b[A';
    case 'send_down':
    case 'down':
      return '\u001b[B';
    case 'send_enter':
    case 'enter':
      return '\r';
    case 'send_escape':
    case 'escape':
    case 'interrupt':
      if (preset === 'codex' || preset === 'antigravity' || preset === 'claude') {
        return '\u001b';
      }
      return null;
    default:
      return null;
  }
}

function limitLines(text: string, maxLines: number): string {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return text;
  }

  return lines.slice(-maxLines).join('\n');
}

function stripAnsi(text: string): string {
  const ansiRegex =
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  return text.replace(ansiRegex, '');
}

function renderTerminalSnapshot(state: VirtualTerminal, maxOutputLines: number): string {
  const rawText = state.getLines()
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!rawText) {
    return '';
  }

  const rawLines = rawText.split('\n');
  const nonEmptyLines = rawLines.filter((line) => line.trim().length > 0);
  const commonIndent =
    nonEmptyLines.length > 0
      ? Math.min(...nonEmptyLines.map((line) => line.match(/^ */)?.[0].length ?? 0))
      : 0;

  return limitLines(
    rawLines.map((line) => line.slice(commonIndent)).join('\n').trim(),
    maxOutputLines
  );
}

/**
 * Lọc bỏ output chỉ chứa loading spinner, window title, hoặc ký tự thừa trước khi gửi Telegram.
 */
function isSpinnerOrNoiseOutput(text: string): boolean {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return true;

  // Nếu tất cả các dòng đều là noise thì bỏ
  const noisePatterns = [
    /^[\u2800-\u28FF\s]+$/, // Braille spinner
    /^\]0;/,               // Window title sequence
    /^q{1,4}\d?\w{0,5}$/, // "q", "q8", "qrk" etc.
    /^[\s\u2800-\u28FF\]0;q\r\n]{1,20}$/ // Short mixed noise
  ];

  const allNoise = lines.every(line =>
    noisePatterns.some(pattern => pattern.test(line))
  );

  return allNoise;
}
