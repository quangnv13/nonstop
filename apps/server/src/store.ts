import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { ClientInfo, SessionInfo, UserWorkspaceState, Workspace } from './types.js';
import { logger } from './logger.js';

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

export const DATA_DIR = findDataDir();
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const adminFilePath = path.join(DATA_DIR, 'admin.json');
const allowedUsersFilePath = path.join(DATA_DIR, 'allowed_users.txt');
const clientsFilePath = path.join(DATA_DIR, 'clients.json');
const userWorkspacesFilePath = path.join(DATA_DIR, 'user_workspaces.json');
const sessionsFilePath = path.join(DATA_DIR, 'sessions.json');
const userLanguagesFilePath = path.join(DATA_DIR, 'user_languages.json');

export interface AdminData {
  adminUserId: number;
  adminUsername?: string;
  createdAt: string;
}

export function normalizeUsername(username: string | undefined | null): string | null {
  if (!username) return null;
  const trimmed = username.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('@') ? trimmed.toLowerCase() : `@${trimmed.toLowerCase()}`;
}

export function getConfiguredAdminUsername(): string | null {
  const envAdminUsername = normalizeUsername(process.env.ADMIN_USERNAME);
  if (envAdminUsername) return envAdminUsername;

  if (fs.existsSync(adminFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(adminFilePath, 'utf-8')) as AdminData;
      return normalizeUsername(data.adminUsername);
    } catch (err) {
      logger.error('Error reading admin username from admin.json', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return null;
}

export function getAdminUserId(): number | null {
  if (process.env.ADMIN_USER_ID) {
    const envAdminId = parseInt(process.env.ADMIN_USER_ID, 10);
    if (!isNaN(envAdminId)) return envAdminId;
  }

  if (fs.existsSync(adminFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(adminFilePath, 'utf-8')) as AdminData;
      return data.adminUserId;
    } catch (err) {
      logger.error('Error reading admin.json', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return null;
}

export function setAdminUserId(userId: number, username?: string | null): void {
  const normalizedUsername = normalizeUsername(username);
  const adminData: AdminData = {
    adminUserId: userId,
    ...(normalizedUsername ? { adminUsername: normalizedUsername } : {}),
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(adminFilePath, JSON.stringify(adminData, null, 2), 'utf-8');
}

export function isUserAllowed(userId: number, username?: string | null): boolean {
  const adminId = getAdminUserId();
  const adminUsername = getConfiguredAdminUsername();
  const normalizedUsername = normalizeUsername(username);
  if (adminUsername && normalizedUsername === adminUsername) return true;
  if (adminId !== null && userId === adminId) return true;

  if (fs.existsSync(allowedUsersFilePath)) {
    try {
      const content = fs.readFileSync(allowedUsersFilePath, 'utf-8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const id = parseInt(line.trim(), 10);
        if (!isNaN(id) && id === userId) return true;
      }
    } catch (err) {
      logger.error('Error reading allowed_users.txt', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return false;
}

export function addAllowedUser(userId: number): void {
  try {
    let existing: number[] = [];
    if (fs.existsSync(allowedUsersFilePath)) {
      const content = fs.readFileSync(allowedUsersFilePath, 'utf-8');
      existing = content
        .split(/\r?\n/)
        .map(line => parseInt(line.trim(), 10))
        .filter(id => !isNaN(id));
    }

    if (!existing.includes(userId)) {
      existing.push(userId);
      fs.writeFileSync(allowedUsersFilePath, `${existing.join('\n')}\n`, 'utf-8');
    }
  } catch (err) {
    logger.error('Error writing allowed_users.txt', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

export function saveClients(clients: Record<string, ClientInfo>): void {
  try {
    fs.writeFileSync(clientsFilePath, JSON.stringify(clients, null, 2), 'utf-8');
  } catch (err) {
    logger.error('Error saving clients.json', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

export function loadClients(): Record<string, ClientInfo> {
  if (fs.existsSync(clientsFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(clientsFilePath, 'utf-8')) as Record<string, ClientInfo>;
      for (const key of Object.keys(data)) {
        data[key].online = false;
      }
      return data;
    } catch (err) {
      logger.error('Error loading clients.json', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return {};
}

export function saveUserWorkspaceRegistry(registry: Record<string, UserWorkspaceState>): void {
  try {
    fs.writeFileSync(userWorkspacesFilePath, JSON.stringify(registry, null, 2), 'utf-8');
  } catch (err) {
    logger.error('Error saving user_workspaces.json', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

export function loadUserWorkspaceRegistry(): Record<string, UserWorkspaceState> {
  if (fs.existsSync(userWorkspacesFilePath)) {
    try {
      return JSON.parse(fs.readFileSync(userWorkspacesFilePath, 'utf-8')) as Record<string, UserWorkspaceState>;
    } catch (err) {
      logger.error('Error loading user_workspaces.json', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return {};
}

export function ensureUserWorkspaceState(
  registry: Record<string, UserWorkspaceState>,
  telegramUsername: string
): UserWorkspaceState {
  if (!registry[telegramUsername]) {
    registry[telegramUsername] = { clients: {} };
  }
  if (!registry[telegramUsername].clients) {
    registry[telegramUsername].clients = {};
  }
  return registry[telegramUsername];
}

export function setActiveClient(
  registry: Record<string, UserWorkspaceState>,
  telegramUsername: string,
  clientName: string
): UserWorkspaceState {
  const state = ensureUserWorkspaceState(registry, telegramUsername);
  if (!state.clients[clientName]) {
    state.clients[clientName] = [];
  }
  state.activeClientName = clientName;
  if (!state.activeWorkspaceId || !state.clients[clientName].some(workspace => workspace.id === state.activeWorkspaceId)) {
    state.activeWorkspaceId = state.clients[clientName][0]?.id;
  }
  return state;
}

export function setClientWorkspaces(
  registry: Record<string, UserWorkspaceState>,
  telegramUsername: string,
  clientName: string,
  workspaces: Workspace[]
): UserWorkspaceState {
  const state = ensureUserWorkspaceState(registry, telegramUsername);
  state.clients[clientName] = workspaces;
  if (!state.activeClientName) {
    state.activeClientName = clientName;
  }
  if (state.activeClientName === clientName) {
    if (!state.activeWorkspaceId || !workspaces.some(workspace => workspace.id === state.activeWorkspaceId)) {
      state.activeWorkspaceId = workspaces[0]?.id;
    }
  }
  return state;
}

export function saveSessions(sessions: Record<string, SessionInfo>): void {
  try {
    fs.writeFileSync(sessionsFilePath, JSON.stringify(sessions, null, 2), 'utf-8');
  } catch (err) {
    logger.error('Error saving sessions.json', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

export function loadSessions(): Record<string, SessionInfo> {
  if (fs.existsSync(sessionsFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(sessionsFilePath, 'utf-8')) as Record<string, SessionInfo>;
      for (const key of Object.keys(data)) {
        data[key].status = 'stopped';
      }
      return data;
    } catch (err) {
      logger.error('Error loading sessions.json', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return {};
}

export function getUserLanguage(userId: number): string {
  if (fs.existsSync(userLanguagesFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(userLanguagesFilePath, 'utf-8')) as Record<string, string>;
      if (data[userId]) return data[userId];
    } catch (err) {
      logger.error('Error reading user_languages.json', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return 'vi';
}

export function setUserLanguage(userId: number, lang: string): void {
  try {
    let data: Record<string, string> = {};
    if (fs.existsSync(userLanguagesFilePath)) {
      data = JSON.parse(fs.readFileSync(userLanguagesFilePath, 'utf-8')) as Record<string, string>;
    }
    data[userId] = lang;
    fs.writeFileSync(userLanguagesFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    logger.error('Error writing user_languages.json', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
