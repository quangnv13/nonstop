import { io, Socket } from 'socket.io-client';
import * as dotenv from 'dotenv';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { ClientHelloPayload, Workspace } from './types.js';
import { NodePtyTerminalDriver, resolvePreset, TerminalDriver } from './terminal.js';
import { logger } from './logger.js';

// Load env
dotenv.config();

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.SERVER_CLIENT_AUTH_TOKEN || 'default_secret_token';
const CLIENT_NAME = process.env.CLIENT_NAME || os.hostname() || 'RemoteClient';
const TELEGRAM_USERNAME = process.env.TELEGRAM_USERNAME || '';

// Locate root data directory
const findDataDir = () => {
  let currentDir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const rootPkg = path.join(currentDir, 'package.json');
    if (fs.existsSync(rootPkg)) {
      if (fs.existsSync(path.join(currentDir, 'apps'))) {
        return path.join(currentDir, 'data');
      }
      const parent = path.dirname(currentDir);
      if (fs.existsSync(path.join(parent, 'apps'))) {
        return path.join(parent, 'data');
      }
    }
    const nextDir = path.dirname(currentDir);
    if (nextDir === currentDir) break;
    currentDir = nextDir;
  }
  return path.join(process.cwd(), 'data');
};

const DATA_DIR = findDataDir();
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const workspacesFilePath = path.join(DATA_DIR, 'workspaces.json');

// Initialize default workspaces if they don't exist
function loadLocalWorkspaces(): Workspace[] {
  if (fs.existsSync(workspacesFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(workspacesFilePath, 'utf-8'));
      if (Array.isArray(data) && data.length > 0) return data;
      logger.warn('workspaces.json is empty or invalid for runtime use; regenerating defaults', {
        isArray: Array.isArray(data),
        length: Array.isArray(data) ? data.length : undefined
      });
      // If it's stored under client-socket-id on the server, we just load raw arrays here
    } catch (err) {
      logger.error('Error reading workspaces.json', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  // Fallback / Auto-generate default workspaces based on project layout
  const rootDir = path.resolve(DATA_DIR, '..');
  const defaultWorkspaces: Workspace[] = [
    {
      id: 'ws_root',
      name: 'Project Root',
      path: rootDir.replace(/\\/g, '/')
    },
    {
      id: 'ws_server',
      name: 'Server Backend',
      path: path.join(rootDir, 'apps/server').replace(/\\/g, '/')
    },
    {
      id: 'ws_client',
      name: 'Client App',
      path: path.join(rootDir, 'apps/client').replace(/\\/g, '/')
    }
  ];

  try {
    fs.writeFileSync(workspacesFilePath, JSON.stringify(defaultWorkspaces, null, 2), 'utf-8');
    logger.info('Created default workspaces.json', { workspacesFilePath });
  } catch (err) {
    logger.error('Error writing default workspaces.json', {
      error: err instanceof Error ? err.message : String(err)
    });
  }

  return defaultWorkspaces;
}

const workspaces = loadLocalWorkspaces();
const activeDrivers: Record<string, TerminalDriver> = {};

logger.info('Client bootstrap complete', {
  serverUrl: SERVER_URL,
  clientName: CLIENT_NAME,
  telegramUsername: TELEGRAM_USERNAME,
  dataDir: DATA_DIR,
  workspacesFilePath,
  workspaceCount: workspaces.length
});

process.on('uncaughtException', (error) => {
  logger.error('Unhandled exception', {
    error: error.message,
    stack: error.stack
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason)
  });
});

logger.info('Connecting to Remote CLI server', { serverUrl: SERVER_URL });

const socket = io(SERVER_URL, {
  auth: {
    token: AUTH_TOKEN
  },
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000
});

socket.on('connect', () => {
  logger.info('Connected to server', { socketId: socket.id });

  // Register client info
  const payload: ClientHelloPayload = {
    name: CLIENT_NAME,
    version: `${process.platform} ${os.release()}`,
    hostname: os.hostname(),
    telegramUsername: TELEGRAM_USERNAME,
    workspaces
  };
  socket.emit('client:hello', payload);
});

socket.on('disconnect', (reason) => {
  logger.warn('Disconnected from server', {
    reason,
    activeSessionCount: Object.keys(activeDrivers).length
  });
  // Clean up all active sessions
  for (const sessionId of Object.keys(activeDrivers)) {
    logger.warn('Stopping active session after disconnect', { sessionId });
    activeDrivers[sessionId].kill();
    delete activeDrivers[sessionId];
  }
});

socket.on('connect_error', (error) => {
  const socketError = error as Error & {
    description?: unknown;
    type?: string;
  };
  logger.error('Socket connection error', {
    message: socketError.message,
    description: socketError.description,
    type: socketError.type
  });
});

// PTY Control Events
socket.on('session:start', (data: { sessionId: string; workspaceId: string; workspacePath: string; cliPreset: string }) => {
  const { sessionId, workspaceId, workspacePath, cliPreset } = data;
  logger.info('Received session:start', { sessionId, workspaceId, workspacePath, cliPreset });

  const cwd = path.resolve(workspacePath);
  if (!fs.existsSync(cwd)) {
    logger.error('Workspace path does not exist', { sessionId, cwd, workspaceId });
    socket.emit('session:error', { sessionId, data: `Workspace path "${cwd}" does not exist on client.` });
    socket.emit('session:exit', { sessionId, code: -1 });
    return;
  }

  const { command, args } = resolvePreset(cliPreset);
  logger.info('Resolved preset for session', {
    sessionId,
    command,
    args,
    cwd
  });

  try {
    const driver = new NodePtyTerminalDriver(command, args, cwd);
    activeDrivers[sessionId] = driver;
    let outputChunkCount = 0;
    let outputByteCount = 0;

    driver.onData((output) => {
      outputChunkCount += 1;
      outputByteCount += Buffer.byteLength(output, 'utf8');
      if (outputChunkCount === 1 || outputChunkCount % 25 === 0) {
        logger.debug('Forwarding PTY output chunk', {
          sessionId,
          outputChunkCount,
          outputByteCount
        });
      }
      socket.emit('session:output', { sessionId, data: output });
    });

    driver.onExit((code, signal) => {
      logger.warn('PTY session exited', {
        sessionId,
        code,
        signal,
        outputChunkCount,
        outputByteCount
      });
      delete activeDrivers[sessionId];
      socket.emit('session:exit', { sessionId, code });
    });
  } catch (err: any) {
    logger.error('Failed to spawn PTY', {
      sessionId,
      command,
      cwd,
      error: err?.message ?? String(err)
    });
    socket.emit('session:error', { sessionId, data: `Failed to spawn process "${command}": ${err.message}` });
    socket.emit('session:exit', { sessionId, code: -1 });
  }
});

socket.on('session:input', (data: { sessionId: string; data: string }) => {
  const { sessionId, data: inputData } = data;
  const driver = activeDrivers[sessionId];
  if (driver) {
    logger.debug('Received session input from server', {
      sessionId,
      length: inputData.length
    });
    driver.write(inputData);
  } else {
    logger.warn('Dropping session input for inactive session', { sessionId });
  }
});

socket.on('session:key', (data: { sessionId: string; key: string }) => {
  const { sessionId, key } = data;
  const driver = activeDrivers[sessionId];
  if (driver) {
    logger.debug('Received session key from server', {
      sessionId,
      key: JSON.stringify(key)
    });
    driver.write(key);
  } else {
    logger.warn('Dropping session key for inactive session', { sessionId });
  }
});

socket.on('session:stop', (data: { sessionId: string }) => {
  const { sessionId } = data;
  logger.warn('Received session:stop', { sessionId });
  const driver = activeDrivers[sessionId];
  if (driver) {
    driver.kill();
    delete activeDrivers[sessionId];
  } else {
    logger.warn('Session stop requested for inactive session', { sessionId });
  }
});
