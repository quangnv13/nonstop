export type SessionPreset = 'powershell' | 'bash' | 'codex' | 'antigravity' | 'claude';

export interface Workspace {
  id: string;
  name: string;
  path: string;
}

export interface ActiveSessionState {
  sessionId: string;
  preset: SessionPreset;
  cwd: string;
  status: 'running' | 'stopped';
  listenerChatId: number;
  lastSentFinalText: string;
  inputMode: boolean;
  autoEnter: boolean;
}

export interface WorkspaceDraft {
  mode: 'add_name' | 'add_path' | 'edit_name' | 'edit_path';
  workspaceId?: string;
  name?: string;
}

export interface LocalAppState {
  workspaces: Workspace[];
  activeSession: ActiveSessionState | null;
  workspaceDraft: WorkspaceDraft | null;
}

export interface CliPreset {
  name: SessionPreset;
  command: string;
  args: string[];
}
