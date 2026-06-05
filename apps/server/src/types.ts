export interface Workspace {
  id: string;
  name: string;
  path: string;
}

export interface ClientInfo {
  socketId: string;
  name: string;
  version: string;
  hostname: string;
  telegramUsername: string;
  online: boolean;
  lastSeen: number;
}

export interface UserWorkspaceState {
  activeClientName?: string;
  activeWorkspaceId?: string;
  clients: Record<string, Workspace[]>;
}

export interface SessionInfo {
  sessionId: string;
  clientId: string; // socketId of client
  workspaceId: string;
  cliPreset: string;
  cwd: string;
  createdAt: number;
  status: 'running' | 'stopped';
}

export interface CliPreset {
  name: string;
  command: string;
  args: string[];
}
