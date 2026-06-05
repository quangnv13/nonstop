import 'dotenv/config';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { ClientInfo, SessionInfo, UserWorkspaceState, Workspace } from './types.js';
import { logger } from './logger.js';
import { buildOutputFilterConfig, decideOutputDelivery } from './output-filter.js';
import {
  ensureUserWorkspaceState,
  loadClients,
  loadSessions,
  loadUserWorkspaceRegistry,
  normalizeUsername,
  saveClients,
  saveSessions,
  saveUserWorkspaceRegistry,
  setClientWorkspaces
} from './store.js';

export let io: SocketIOServer;

export const activeClients: Record<string, ClientInfo> = loadClients();
export const userWorkspaceRegistry: Record<string, UserWorkspaceState> = loadUserWorkspaceRegistry();
export const activeSessions: Record<string, SessionInfo> = loadSessions();

const sessionListeners: Record<string, Set<number>> = {};
const outputBuffers: Record<string, string> = {};
const outputTimers: Record<string, NodeJS.Timeout | null> = {};
const outputTickers: Record<string, NodeJS.Timeout | null> = {};
const lastSentSnapshots: Record<string, string> = {};
const outputBypassUntil: Record<string, number> = {};

interface TerminalRenderState {
  lines: string[];
  row: number;
  col: number;
  savedRow: number;
  savedCol: number;
}

const terminalStates: Record<string, TerminalRenderState> = {};

let onTelegramPush: ((chatId: number, text: string, options?: any) => Promise<void>) | null = null;
let onConfirmationPrompt: ((sessionId: string, text: string) => void) | null = null;

export function setTelegramPushCallback(cb: typeof onTelegramPush) {
  onTelegramPush = cb;
}

export function setConfirmationPromptCallback(cb: typeof onConfirmationPrompt) {
  onConfirmationPrompt = cb;
}

export function addSessionListener(sessionId: string, chatId: number) {
  if (!sessionListeners[sessionId]) {
    sessionListeners[sessionId] = new Set();
  }
  sessionListeners[sessionId].add(chatId);
}

export function getSessionListeners(sessionId: string): number[] {
  return sessionListeners[sessionId] ? Array.from(sessionListeners[sessionId]) : [];
}

export function markSessionOutputBypass(sessionId: string, reason: string) {
  outputBypassUntil[sessionId] = Date.now() + OUTPUT_BYPASS_WINDOW_MS;
  logger.debug('Marked session output bypass window', {
    sessionId,
    reason,
    bypassUntil: outputBypassUntil[sessionId],
    bypassWindowMs: OUTPUT_BYPASS_WINDOW_MS
  });
}

export function getWorkspaceStateForUser(telegramUsername: string): UserWorkspaceState {
  return ensureUserWorkspaceState(userWorkspaceRegistry, telegramUsername);
}

export function getOnlineClientsForUser(telegramUsername: string): ClientInfo[] {
  return Object.values(activeClients)
    .filter(client => client.telegramUsername === telegramUsername && client.online)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function findOnlineClientForUser(telegramUsername: string, clientName: string): ClientInfo | undefined {
  return getOnlineClientsForUser(telegramUsername).find(client => client.name === clientName);
}

export function saveWorkspaceRegistry() {
  saveUserWorkspaceRegistry(userWorkspaceRegistry);
}

const STRIP_ANSI = process.env.STRIP_ANSI !== 'false';
const OUTPUT_INTERVAL = parseInt(process.env.OUTPUT_INTERVAL || '15000', 10);
const MAX_OUTPUT_LINES = parseInt(process.env.MAX_OUTPUT_LINES || '40', 10);
const MAX_RENDER_LINES = parseInt(process.env.MAX_RENDER_LINES || '200', 10);
const OUTPUT_FILTER_ENABLED = process.env.OUTPUT_FILTER_ENABLED !== 'false';
const OUTPUT_BYPASS_WINDOW_MS = parseInt(process.env.OUTPUT_BYPASS_WINDOW_MS || '4000', 10);
const OUTPUT_FILTER_CONFIG = buildOutputFilterConfig(process.env);

function limitLines(text: string, maxLines: number): string {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) return text;
  return lines.slice(-maxLines).join('\n');
}

function stripAnsi(text: string): string {
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  return text.replace(ansiRegex, '');
}

function createTerminalState(): TerminalRenderState {
  return { lines: [''], row: 0, col: 0, savedRow: 0, savedCol: 0 };
}

function getTerminalState(sessionId: string): TerminalRenderState {
  if (!terminalStates[sessionId]) {
    terminalStates[sessionId] = createTerminalState();
  }
  return terminalStates[sessionId];
}

function ensureLine(state: TerminalRenderState, row: number) {
  while (state.lines.length <= row) state.lines.push('');
}

function writeAt(state: TerminalRenderState, char: string) {
  ensureLine(state, state.row);
  const current = state.lines[state.row];
  const padded = current.padEnd(state.col, ' ');
  state.lines[state.row] = padded.slice(0, state.col) + char + padded.slice(state.col + 1);
  state.col += 1;
}

function clearLineFromCursor(state: TerminalRenderState) {
  ensureLine(state, state.row);
  state.lines[state.row] = state.lines[state.row].slice(0, state.col);
}

function trimTerminalHistory(state: TerminalRenderState) {
  if (state.lines.length <= MAX_RENDER_LINES) return;
  const removeCount = state.lines.length - MAX_RENDER_LINES;
  state.lines = state.lines.slice(removeCount);
  state.row = Math.max(0, state.row - removeCount);
  state.savedRow = Math.max(0, state.savedRow - removeCount);
}

function handleCsiSequence(state: TerminalRenderState, paramsRaw: string, command: string) {
  const privateMode = paramsRaw.startsWith('?');
  const normalized = privateMode ? paramsRaw.slice(1) : paramsRaw;
  const params = normalized.length > 0
    ? normalized.split(';').map(value => {
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

function applyTerminalOutput(sessionId: string, chunk: string) {
  const state = getTerminalState(sessionId);
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
      trimTerminalHistory(state);
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
      for (let i = 0; i < spaces; i += 1) writeAt(state, ' ');
      index += 1;
      continue;
    }

    if (char >= ' ') writeAt(state, char);
    index += 1;
  }

  trimTerminalHistory(state);
}

function renderTerminalSnapshot(sessionId: string): string {
  const state = terminalStates[sessionId];
  if (!state) return '';

  const rawLines = state.lines
    .map(line => line.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .split('\n');

  const nonEmptyLines = rawLines.filter(line => line.trim().length > 0);
  const commonIndent = nonEmptyLines.length > 0
    ? Math.min(...nonEmptyLines.map(line => (line.match(/^ */)?.[0].length ?? 0)))
    : 0;

  return limitLines(
    rawLines.map(line => line.slice(commonIndent)).join('\n').trim(),
    MAX_OUTPUT_LINES
  );
}

function ensureOutputTicker(sessionId: string) {
  if (outputTickers[sessionId]) return;

  outputTickers[sessionId] = setInterval(() => {
    void flushOutput(sessionId, true);
  }, OUTPUT_INTERVAL);
}

function detectConfirmationPrompt(text: string): boolean {
  const patterns = [/y\/n/i, /yes\/no/i, /continue\?/i, /confirm/i, /allow\?/i, /permission/i, /approve/i, /deny/i, /press enter/i];
  return patterns.some(pattern => pattern.test(text.toLowerCase()));
}

function bufferOutput(sessionId: string, data: string) {
  outputBuffers[sessionId] = `${outputBuffers[sessionId] || ''}${data}`;
  applyTerminalOutput(sessionId, data);
  ensureOutputTicker(sessionId);

  if (!outputTimers[sessionId]) {
    outputTimers[sessionId] = setTimeout(() => {
      void flushOutput(sessionId);
    }, OUTPUT_INTERVAL);
  }
}

async function flushOutput(sessionId: string, forceSnapshot = false) {
  outputTimers[sessionId] = null;
  const text = outputBuffers[sessionId] || '';
  outputBuffers[sessionId] = '';

  const promptDetectionText = STRIP_ANSI ? stripAnsi(text) : text;
  const snapshot = renderTerminalSnapshot(sessionId);
  const finalText = snapshot || limitLines(promptDetectionText, MAX_OUTPUT_LINES);

  if (!text && !forceSnapshot) return;
  if (!finalText.trim()) return;

  const bypassDuplicateCheck = (outputBypassUntil[sessionId] || 0) > Date.now();
  const deliveryDecision = OUTPUT_FILTER_ENABLED
    ? decideOutputDelivery(lastSentSnapshots[sessionId] || '', finalText, OUTPUT_FILTER_CONFIG, bypassDuplicateCheck)
    : { shouldSend: true, reason: 'send' as const, similarity: 0 };

  logger.info('Evaluated session output flush', {
    sessionId,
    length: finalText.length,
    listenerCount: getSessionListeners(sessionId).length,
    forceSnapshot,
    filterEnabled: OUTPUT_FILTER_ENABLED,
    bypassDuplicateCheck,
    decision: deliveryDecision.reason,
    similarity: Number(deliveryDecision.similarity.toFixed(3))
  });

  if (!deliveryDecision.shouldSend) return;

  if (onConfirmationPrompt && detectConfirmationPrompt(promptDetectionText)) {
    onConfirmationPrompt(sessionId, limitLines(promptDetectionText, MAX_OUTPUT_LINES));
  }

  const listeners = getSessionListeners(sessionId);
  if (listeners.length === 0) {
    logger.warn('Session output dropped because no listeners are attached', {
      sessionId,
      preview: finalText.slice(0, 200)
    });
    return;
  }

  lastSentSnapshots[sessionId] = finalText;
  const chunks = chunkText(finalText, 4000);
  for (const listener of listeners) {
    for (const chunk of chunks) {
      if (!onTelegramPush) continue;
      try {
        await onTelegramPush(listener, `\`\`\`\n${chunk}\n\`\`\``, { parse_mode: 'MarkdownV2' });
      } catch (err) {
        logger.error('Failed to push output to Telegram', {
          sessionId,
          chatId: listener,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }
}

function chunkText(text: string, limit: number): string[] {
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    let chunk = text.substring(index, index + limit);
    chunk = chunk.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    chunks.push(chunk);
    index += limit;
  }
  return chunks;
}

function cleanupSessionOutputState(sessionId: string) {
  if (outputTickers[sessionId]) clearInterval(outputTickers[sessionId]!);
  delete outputBuffers[sessionId];
  delete outputTimers[sessionId];
  delete outputTickers[sessionId];
  delete terminalStates[sessionId];
  delete lastSentSnapshots[sessionId];
  delete outputBypassUntil[sessionId];
  delete sessionListeners[sessionId];
}

function pruneDuplicateClientEntries(currentSocketId: string, hostname: string, name: string, telegramUsername: string) {
  for (const socketId of Object.keys(activeClients)) {
    if (socketId === currentSocketId) continue;

    const client = activeClients[socketId];
    if (client.hostname === hostname && client.name === name && client.telegramUsername === telegramUsername) {
      logger.warn('Pruning stale client registry entry', {
        staleSocketId: socketId,
        currentSocketId,
        hostname,
        name,
        telegramUsername
      });
      delete activeClients[socketId];

      for (const sessionId of Object.keys(activeSessions)) {
        if (activeSessions[sessionId].clientId === socketId) {
          activeSessions[sessionId].status = 'stopped';
        }
      }
    }
  }
}

export function initSocketServer(server: HttpServer) {
  io = new SocketIOServer(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  const AUTH_TOKEN = process.env.SERVER_CLIENT_AUTH_TOKEN || 'default_secret_token';

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers['x-auth-token'];
    if (token !== AUTH_TOKEN) {
      logger.warn('Socket authentication failed', {
        socketId: socket.id,
        hasToken: Boolean(token)
      });
      return next(new Error('Unauthorized'));
    }
    logger.info('Socket authenticated', {
      socketId: socket.id,
      transport: socket.conn.transport.name
    });
    return next();
  });

  io.on('connection', (socket: Socket) => {
    logger.info('Client connected', { socketId: socket.id });

    socket.on('client:hello', (data: { name: string; version: string; hostname: string; telegramUsername: string; workspaces: Workspace[] }) => {
      const telegramUsername = normalizeUsername(data.telegramUsername) || '@unknown';
      pruneDuplicateClientEntries(socket.id, data.hostname, data.name, telegramUsername);

      logger.info('Received client:hello', {
        socketId: socket.id,
        name: data.name,
        hostname: data.hostname,
        telegramUsername,
        workspaceCount: data.workspaces.length
      });

      activeClients[socket.id] = {
        socketId: socket.id,
        name: data.name,
        version: data.version,
        hostname: data.hostname,
        telegramUsername,
        online: true,
        lastSeen: Date.now()
      };

      const state = ensureUserWorkspaceState(userWorkspaceRegistry, telegramUsername);
      if (!state.clients[data.name] || state.clients[data.name].length === 0) {
        setClientWorkspaces(userWorkspaceRegistry, telegramUsername, data.name, data.workspaces);
      } else if (!state.activeClientName) {
        state.activeClientName = data.name;
      }

      saveClients(activeClients);
      saveUserWorkspaceRegistry(userWorkspaceRegistry);
      saveSessions(activeSessions);
    });

    socket.on('session:output', (data: { sessionId: string; data: string }) => {
      bufferOutput(data.sessionId, data.data);
    });

    socket.on('session:error', (data: { sessionId: string; data: string }) => {
      bufferOutput(data.sessionId, `[Error] ${data.data}`);
    });

    socket.on('session:exit', (data: { sessionId: string; code: number }) => {
      logger.warn('Session exited', {
        socketId: socket.id,
        sessionId: data.sessionId,
        code: data.code
      });

      const session = activeSessions[data.sessionId];
      if (session) {
        session.status = 'stopped';
        saveSessions(activeSessions);
      }

      if (outputTimers[data.sessionId]) clearTimeout(outputTimers[data.sessionId]!);
      void flushOutput(data.sessionId);

      const listeners = getSessionListeners(data.sessionId);
      for (const listener of listeners) {
        if (onTelegramPush) {
          void onTelegramPush(listener, `⚠️ Session \`${data.sessionId}\` exited with code \`${data.code}\`.`);
        }
      }
      cleanupSessionOutputState(data.sessionId);
    });

    socket.on('disconnect', () => {
      logger.warn('Client disconnected', { socketId: socket.id });
      if (activeClients[socket.id]) {
        activeClients[socket.id].online = false;
        activeClients[socket.id].lastSeen = Date.now();
        saveClients(activeClients);
      }

      for (const sessionId of Object.keys(activeSessions)) {
        const session = activeSessions[sessionId];
        if (session.clientId === socket.id && session.status === 'running') {
          session.status = 'stopped';
          saveSessions(activeSessions);

          const listeners = getSessionListeners(sessionId);
          for (const listener of listeners) {
            if (onTelegramPush) {
              void onTelegramPush(listener, `🔌 Client disconnected. Session \`${sessionId}\` is marked stopped.`);
            }
          }
          cleanupSessionOutputState(sessionId);
        }
      }
    });
  });
}
