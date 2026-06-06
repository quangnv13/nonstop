import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createBotRuntime, BotRuntime, loadLastChatId } from './bot.js';
import { AppConfig, saveConfigToDisk, applyConfigToProcessEnv } from './config.js';
import { logger } from './logger.js';
import { RuntimeStateSnapshot, saveRuntimeState, clearRuntimeState, getIpcSocketPath } from './runtime-state.js';
import * as net from 'net';
import { shouldSkipSessionOutput } from './session-delivery.js';
import { buildSessionOutputMessages, SessionOutputMessage } from './session-output.js';
import { loadWorkspaces, saveWorkspaces as persistWorkspaces } from './store.js';
import {
  NodePtyTerminalDriver,
  resolvePreset,
  SUPPORTED_PRESETS,
  TerminalDriver
} from './terminal.js';
import { ActiveSessionState, SessionPreset, Workspace } from './types.js';

interface TerminalRenderState {
  lines: string[];
  row: number;
  col: number;
  savedRow: number;
  savedCol: number;
}

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
  private terminalState = createTerminalState();
  private outputTicker: NodeJS.Timeout | null = null;
  private actionOutputTimeout: NodeJS.Timeout | null = null;
  private heartbeatTicker: NodeJS.Timeout | null = null;
  private onSessionOutputPush: SessionOutputPushCallback | null = null;
  private bot: BotRuntime | null = null;
  private ipcServer: net.Server | null = null;
  private activeIpcSockets = new Set<net.Socket>();

  constructor(config: AppConfig, mode: 'background' | 'foreground') {
    this.config = config;
    this.mode = mode;
  }

  getStatus(): RuntimeStateSnapshot {
    return {
      pid: process.pid,
      startedAt: this.startedAt,
      lastHeartbeatAt: new Date().toISOString(),
      mode: this.mode,
      clientName: this.config.clientName || os.hostname() || 'LocalClient',
      botRunning: this.bot !== null,
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
        logger.info('Telegram bot đã khởi động', {
          username: botInfo.username,
          mode: this.mode
        });

        // Gửi thông báo hello tới Telegram
        const lastChatId = loadLastChatId();
        if (lastChatId && this.bot) {
          try {
            await this.bot.pushSessionOutput(
              lastChatId,
              `✅ nonstop client đã khởi động thành công và đang chạy!\n🖥 Client: ${this.config.clientName}`
            );
          } catch {
            // ignore
          }
        }
      }
    });
  }

  async stopBot(): Promise<void> {
    await this.stopSession();

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
      const driver = new NodePtyTerminalDriver(command, args, cwd);
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

    this.heartbeatTicker = setInterval(() => {
      this.writeHeartbeat();
      void this.checkIpcCommands();
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
      await this.onSessionOutputPush(
        session.listenerChatId,
        `Session \`${sessionId}\` exited with code \`${code}\`.`
      );
    }
  }

  private bufferOutput(chunk: string): void {
    if (!this.activeSession) {
      return;
    }

    this.outputBuffer.current += chunk;
    applyTerminalOutput(this.terminalState, chunk, this.config.maxRenderLines);
    this.ensureOutputTicker();
  }

  private async flushOutput(forceSnapshot = false, ignoreDuplicate = false): Promise<void> {
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
    this.terminalState = createTerminalState();

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
      if (preset === 'codex' || preset === 'antigravity') {
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

function createTerminalState(): TerminalRenderState {
  return { lines: [''], row: 0, col: 0, savedRow: 0, savedCol: 0 };
}

function ensureLine(state: TerminalRenderState, row: number): void {
  while (state.lines.length <= row) {
    state.lines.push('');
  }
}

function writeAt(state: TerminalRenderState, char: string): void {
  ensureLine(state, state.row);
  const current = state.lines[state.row];
  const padded = current.padEnd(state.col, ' ');
  state.lines[state.row] = padded.slice(0, state.col) + char + padded.slice(state.col + 1);
  state.col += 1;
}

function clearLineFromCursor(state: TerminalRenderState): void {
  ensureLine(state, state.row);
  state.lines[state.row] = state.lines[state.row].slice(0, state.col);
}

function trimTerminalHistory(state: TerminalRenderState, maxRenderLines: number): void {
  if (state.lines.length <= maxRenderLines) {
    return;
  }

  const removeCount = state.lines.length - maxRenderLines;
  state.lines = state.lines.slice(removeCount);
  state.row = Math.max(0, state.row - removeCount);
  state.savedRow = Math.max(0, state.savedRow - removeCount);
}

function handleCsiSequence(state: TerminalRenderState, paramsRaw: string, command: string): void {
  const privateMode = paramsRaw.startsWith('?');
  const normalized = privateMode ? paramsRaw.slice(1) : paramsRaw;
  const params =
    normalized.length > 0
      ? normalized.split(';').map((value) => {
          const parsed = parseInt(value, 10);
          return Number.isFinite(parsed) ? parsed : 0;
        })
      : [];

  switch (command) {
    case 'A':
      state.row = Math.max(0, state.row - (params[0] || 1));
      return;
    case 'B':
      state.row += params[0] || 1;
      ensureLine(state, state.row);
      return;
    case 'C':
      state.col += params[0] || 1;
      return;
    case 'D':
      state.col = Math.max(0, state.col - (params[0] || 1));
      return;
    case 'G':
      state.col = Math.max(0, (params[0] || 1) - 1);
      return;
    case 'H':
    case 'f':
      state.row = Math.max(0, (params[0] || 1) - 1);
      state.col = Math.max(0, (params[1] || 1) - 1);
      ensureLine(state, state.row);
      return;
    case 'J':
      if ((params[0] || 0) === 2) {
        state.lines = [''];
        state.row = 0;
        state.col = 0;
        state.savedRow = 0;
        state.savedCol = 0;
      }
      return;
    case 'K':
      clearLineFromCursor(state);
      return;
    case 's':
      state.savedRow = state.row;
      state.savedCol = state.col;
      return;
    case 'u':
      state.row = state.savedRow;
      state.col = state.savedCol;
      ensureLine(state, state.row);
      return;
    default:
      return;
  }
}

function applyTerminalOutput(
  state: TerminalRenderState,
  chunk: string,
  maxRenderLines: number
): void {
  let index = 0;

  while (index < chunk.length) {
    const char = chunk[index];

    if (char === '\u001b') {
      const next = chunk[index + 1];

      if (next === '[') {
        const match = chunk.slice(index).match(/^\u001b\[([0-9;?]*)([@-~])/);
        if (match) {
          handleCsiSequence(state, match[1], match[2]);
          index += match[0].length;
          continue;
        }
      }

      if (next === ']') {
        const belIndex = chunk.indexOf('\u0007', index + 2);
        if (belIndex !== -1) {
          index = belIndex + 1;
          continue;
        }
      }

      index += 1;
      continue;
    }

    if (char === '\r') {
      state.col = 0;
      index += 1;
      continue;
    }

    if (char === '\n') {
      state.row += 1;
      state.col = 0;
      ensureLine(state, state.row);
      trimTerminalHistory(state, maxRenderLines);
      index += 1;
      continue;
    }

    if (char === '\b') {
      state.col = Math.max(0, state.col - 1);
      index += 1;
      continue;
    }

    if (char === '\t') {
      const spaces = 4 - (state.col % 4);
      for (let i = 0; i < spaces; i += 1) {
        writeAt(state, ' ');
      }
      index += 1;
      continue;
    }

    if (char >= ' ') {
      writeAt(state, char);
    }

    index += 1;
  }

  trimTerminalHistory(state, maxRenderLines);
}

function renderTerminalSnapshot(state: TerminalRenderState, maxOutputLines: number): string {
  const rawText = state.lines
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
