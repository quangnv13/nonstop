import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  saveRuntimeState,
  saveShouldRunState,
  loadShouldRunState,
  loadRuntimeState,
  clearRuntimeState,
  isPidRunning,
  getRuntimeStatePath,
  getIpcSocketPath,
  RuntimeStateSnapshot
} from '../src/runtime-state.js';

test('runtime-state - paths and formats are correct', () => {
  const statePath = getRuntimeStatePath();
  assert.ok(statePath.endsWith('runtime-state.json'));

  const ipcPath = getIpcSocketPath();
  if (process.platform === 'win32') {
    assert.ok(ipcPath.startsWith('\\\\.\\pipe\\nonstop-ipc-'));
  } else {
    assert.ok(ipcPath.includes('nonstop-ipc-'));
  }
});

test('runtime-state - load and save state functions operate correctly with backups', () => {
  const statePath = getRuntimeStatePath();
  const shouldRunPath = path.join(process.cwd(), 'data', 'runtime-should-run.json');

  let stateBackup: string | null = null;
  let shouldRunBackup: string | null = null;

  if (fs.existsSync(statePath)) {
    stateBackup = fs.readFileSync(statePath, 'utf8');
  }
  if (fs.existsSync(shouldRunPath)) {
    shouldRunBackup = fs.readFileSync(shouldRunPath, 'utf8');
  }

  try {
    // 1. Initial State test (if cleared)
    clearRuntimeState();
    assert.equal(loadRuntimeState(), null);

    // 2. Test saving and loading runtime state
    const snapshot: RuntimeStateSnapshot = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      mode: 'background',
      clientName: 'TestClientState',
      botRunning: true,
      workspaceCount: 5,
      activeSession: null,
      lastError: null
    };

    saveRuntimeState(snapshot);
    const loaded = loadRuntimeState();
    assert.ok(loaded !== null);
    assert.equal(loaded.pid, process.pid);
    assert.equal(loaded.clientName, 'TestClientState');
    assert.equal(loaded.workspaceCount, 5);
    assert.equal(loaded.lastError, null);

    // 3. Test saving and loading shouldRun state
    saveShouldRunState(true);
    assert.equal(loadShouldRunState(), true);

    saveShouldRunState(false);
    assert.equal(loadShouldRunState(), false);

    // 4. Test clearing state
    clearRuntimeState();
    assert.equal(loadRuntimeState(), null);

  } finally {
    // Restore backups
    if (stateBackup !== null) {
      fs.writeFileSync(statePath, stateBackup, 'utf8');
    } else {
      if (fs.existsSync(statePath)) {
        fs.unlinkSync(statePath);
      }
    }

    if (shouldRunBackup !== null) {
      fs.writeFileSync(shouldRunPath, shouldRunBackup, 'utf8');
    } else {
      if (fs.existsSync(shouldRunPath)) {
        fs.unlinkSync(shouldRunPath);
      }
    }
  }
});

test('runtime-state - isPidRunning identifies active/inactive pids', () => {
  // Current process should be running
  assert.ok(isPidRunning(process.pid));

  // Invalid PIDs
  assert.ok(!isPidRunning(0));
  assert.ok(!isPidRunning(-5));
  assert.ok(!isPidRunning(9999999)); // highly unlikely to be running
});
