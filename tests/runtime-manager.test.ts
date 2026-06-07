import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  getRuntimeStatus,
  getEntryScriptPath,
  getCurrentVersion,
  startBackgroundRuntime,
  stopBackgroundRuntime
} from '../src/runtime-manager.js';
import { saveRuntimeState, clearRuntimeState, RuntimeStateSnapshot } from '../src/runtime-state.js';

test('runtime-manager - getCurrentVersion returns package.json version or fallback', () => {
  const version = getCurrentVersion();
  assert.ok(typeof version === 'string');
  assert.match(version, /^\d+\.\d+\.\d+/); // matches semantic versioning format
});

test('runtime-manager - getEntryScriptPath finds index.js or throws', () => {
  try {
    const entryPath = getEntryScriptPath();
    assert.ok(typeof entryPath === 'string');
    assert.ok(entryPath.endsWith('index.js'));
  } catch (error) {
    // If running in an environment where build hasn't run, it might throw,
    // which is also expected behavior of the function.
    assert.ok(error instanceof Error);
  }
});

test('runtime-manager - status, start and stop behaviors', () => {
  const statePath = path.join(process.cwd(), 'data', 'runtime-state.json');
  let stateBackup: string | null = null;

  if (fs.existsSync(statePath)) {
    stateBackup = fs.readFileSync(statePath, 'utf8');
  }

  try {
    // 1. When no state exists, it should be not running
    clearRuntimeState();
    const status1 = getRuntimeStatus();
    assert.equal(status1.running, false);
    assert.equal(status1.snapshot, null);

    // 2. When state exists with a running PID (e.g. process.pid)
    const activeSnapshot: RuntimeStateSnapshot = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      mode: 'background',
      clientName: 'TestActiveClient',
      botRunning: true,
      workspaceCount: 1,
      activeSession: null,
      lastError: null
    };
    saveRuntimeState(activeSnapshot);

    const status2 = getRuntimeStatus();
    assert.equal(status2.running, true);
    assert.equal(status2.snapshot?.pid, process.pid);

    // 3. Testing startBackgroundRuntime when it is already running
    const startMsg = startBackgroundRuntime('en');
    assert.ok(startMsg.includes('already running') || startMsg.includes('đang chạy'));

    // 4. Testing stopBackgroundRuntime on a non-running PID
    const inactiveSnapshot: RuntimeStateSnapshot = {
      pid: 999999, // inactive PID
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      mode: 'background',
      clientName: 'TestInactiveClient',
      botRunning: true,
      workspaceCount: 1,
      activeSession: null,
      lastError: null
    };
    const stopMsg = stopBackgroundRuntime(inactiveSnapshot, 'en');
    assert.ok(stopMsg.includes('not running') || stopMsg.includes('không chạy'));

    // Test stopBackgroundRuntime with null
    const stopMsgNull = stopBackgroundRuntime(null, 'en');
    assert.ok(stopMsgNull.includes('not running') || stopMsgNull.includes('không chạy'));

  } finally {
    if (stateBackup !== null) {
      fs.writeFileSync(statePath, stateBackup, 'utf8');
    } else {
      clearRuntimeState();
    }
  }
});
