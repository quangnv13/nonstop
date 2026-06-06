import * as fs from 'fs';
import * as path from 'path';
import { Workspace } from './types.js';

function findDataDir(): string {
  return path.join(process.cwd(), 'data');
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export const DATA_DIR = findDataDir();
export const workspacesFilePath = path.join(DATA_DIR, 'workspaces.json');

export function loadWorkspaces(): Workspace[] {
  ensureDataDir();

  if (!fs.existsSync(workspacesFilePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(workspacesFilePath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isWorkspaceRecord).map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      path: workspace.path
    }));
  } catch {
    return [];
  }
}

export function saveWorkspaces(workspaces: Workspace[]): void {
  ensureDataDir();
  fs.writeFileSync(workspacesFilePath, JSON.stringify(workspaces, null, 2), 'utf8');
}

export function createWorkspaceId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isWorkspaceRecord(value: unknown): value is Workspace {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.path === 'string'
  );
}
