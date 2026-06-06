import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadRuntimeState, isPidRunning, RuntimeStateSnapshot } from './runtime-state.js';

export interface RuntimeStatus {
  running: boolean;
  snapshot: RuntimeStateSnapshot | null;
}

export function getRuntimeStatus(): RuntimeStatus {
  const snapshot = loadRuntimeState();
  if (!snapshot) {
    return { running: false, snapshot: null };
  }

  if (!isPidRunning(snapshot.pid)) {
    return { running: false, snapshot: null };
  }

  return { running: true, snapshot };
}

export function startBackgroundRuntime(): string {
  const entryScriptPath = path.join(process.cwd(), 'dist', 'index.js');
  if (!fs.existsSync(entryScriptPath)) {
    throw new Error('dist/index.js not found. Run "npm run build" first.');
  }

  const child = spawn(process.execPath, [entryScriptPath, '--background'], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore'
  });

  child.unref();
  return `Started nonstop background runtime (pid ${child.pid ?? 'unknown'}).`;
}

export function stopBackgroundRuntime(snapshot: RuntimeStateSnapshot | null): string {
  if (!snapshot || !isPidRunning(snapshot.pid)) {
    return 'Background runtime is not running.';
  }

  try {
    process.kill(snapshot.pid);
    return `Stopped nonstop background runtime (${snapshot.pid}).`;
  } catch (error) {
    throw new Error(`Failed to stop background runtime (${snapshot.pid}): ${error instanceof Error ? error.message : String(error)}`);
  }
}
