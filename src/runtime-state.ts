import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ActiveSessionState } from './types.js';

export interface RuntimeStateSnapshot {
  pid: number;
  startedAt: string;
  lastHeartbeatAt: string;
  mode: 'background' | 'foreground';
  clientName: string;
  botRunning: boolean;
  telegramConnected?: boolean;
  workspaceCount: number;
  activeSession: ActiveSessionState | null;
  lastError: string | null;
}

const RUNTIME_STATE_PATH = path.join(process.cwd(), 'data', 'runtime-state.json');
const SHOULD_RUN_PATH = path.join(process.cwd(), 'data', 'runtime-should-run.json');

export function saveRuntimeState(snapshot: RuntimeStateSnapshot): void {
  fs.mkdirSync(path.dirname(RUNTIME_STATE_PATH), { recursive: true });
  fs.writeFileSync(RUNTIME_STATE_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
}

export function saveShouldRunState(shouldRun: boolean): void {
  fs.mkdirSync(path.dirname(SHOULD_RUN_PATH), { recursive: true });
  fs.writeFileSync(SHOULD_RUN_PATH, JSON.stringify({ shouldRun }, null, 2), 'utf8');
}

export function loadShouldRunState(): boolean {
  if (!fs.existsSync(SHOULD_RUN_PATH)) {
    return false;
  }

  try {
    const data = JSON.parse(fs.readFileSync(SHOULD_RUN_PATH, 'utf8'));
    return !!data.shouldRun;
  } catch {
    return false;
  }
}

export function loadRuntimeState(): RuntimeStateSnapshot | null {
  if (!fs.existsSync(RUNTIME_STATE_PATH)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(RUNTIME_STATE_PATH, 'utf8')) as RuntimeStateSnapshot;
  } catch {
    return null;
  }
}

export function clearRuntimeState(): void {
  if (fs.existsSync(RUNTIME_STATE_PATH)) {
    fs.unlinkSync(RUNTIME_STATE_PATH);
  }
}

export function isPidRunning(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getRuntimeStatePath(): string {
  return RUNTIME_STATE_PATH;
}

export function getIpcSocketPath(): string {
  const username = os.userInfo().username || 'user';
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\nonstop-ipc-${username}`;
  } else {
    return path.join(process.cwd(), 'data', `nonstop-ipc-${username}.sock`);
  }
}
