import { test } from 'node:test';
import assert from 'node:assert';
import { NonstopRuntime } from './runtime.js';
import { AppConfig } from './config.js';

// Helper to create a dummy config
const dummyConfig: AppConfig = {
  telegramBotToken: '',
  adminUsername: '',
  clientName: 'TestClient',
  telegramUsername: '',
  language: 'en',
  startupMode: 'disabled',
  outputInterval: 1000,
  maxOutputLines: 24,
  maxRenderLines: 200,
  codexCmd: 'codex',
  codexArgs: '[]',
  antigravityCmd: 'agy',
  antigravityArgs: '[]',
  claudeCmd: 'claude',
  claudeArgs: '[]',
  actionInterval: 500,
  dangerousCommandConfirm: ''
};

test('NonstopRuntime - flushOutput serializes concurrent calls and coalesces trailing runs', async () => {
  const runtime = new NonstopRuntime(dummyConfig, 'foreground');
  
  // Mock activeSession so flushOutputInternal does not exit early
  (runtime as any).activeSession = {
    sessionId: 'test-session',
    preset: 'node',
    cwd: '.',
    status: 'running',
    listenerChatId: 12345,
    lastSentFinalText: '',
    inputMode: true,
    autoEnter: true
  };

  const calls: { forceSnapshot: boolean; ignoreDuplicate: boolean; start: number; end: number }[] = [];
  let callCount = 0;

  // Mock flushOutputInternal
  (runtime as any).flushOutputInternal = async (forceSnapshot: boolean, ignoreDuplicate: boolean) => {
    const start = Date.now();
    // Simulate async work (e.g. sending message to Telegram)
    await new Promise((resolve) => setTimeout(resolve, 50));
    calls.push({
      forceSnapshot,
      ignoreDuplicate,
      start,
      end: Date.now()
    });
    callCount++;
  };

  // Trigger Call 1
  const p1 = runtime['flushOutput'](true, false);
  
  // Trigger Call 2 and Call 3 concurrently while Call 1 is running
  const p2 = runtime['flushOutput'](true, true);
  const p3 = runtime['flushOutput'](true, false);

  // Wait for all to complete
  await Promise.all([p1, p2, p3]);

  // Assertions for coalescing behavior:
  // Call 1 runs immediately.
  // Call 2 and Call 3 are coalesced into a single trailing flush.
  // So flushOutputInternal should be called exactly twice:
  // First time with (true, false) - Call 1.
  // Second time with (true, true) - Coalesced Call 2 & 3 (since Call 2 has ignoreDuplicate = true).
  assert.equal(callCount, 2, 'Should coalesce Call 2 and Call 3 into a single trailing call');
  
  // Verify Call 1 ran first, and Call 2/3 (coalesced) ran second.
  assert.equal(calls[0].ignoreDuplicate, false);
  assert.equal(calls[1].ignoreDuplicate, true);
  
  // Verify sequential execution: start of the second run should be after the end of the first run.
  assert.ok(calls[1].start >= calls[0].end, 'Calls should be executed sequentially');
});

test('NonstopRuntime - flushOutput blocks caller until their flush completes', async () => {
  const runtime = new NonstopRuntime(dummyConfig, 'foreground');
  (runtime as any).activeSession = {
    sessionId: 'test-session',
    preset: 'node',
    cwd: '.',
    status: 'running',
    listenerChatId: 12345,
    lastSentFinalText: '',
    inputMode: true,
    autoEnter: true
  };

  let activeFlushes = 0;
  let maxConcurrentFlushes = 0;
  const completions: string[] = [];

  (runtime as any).flushOutputInternal = async (forceSnapshot: boolean, ignoreDuplicate: boolean) => {
    activeFlushes++;
    maxConcurrentFlushes = Math.max(maxConcurrentFlushes, activeFlushes);
    await new Promise((resolve) => setTimeout(resolve, 50));
    activeFlushes--;
  };

  // Start Call 1
  const p1 = runtime['flushOutput'](true, false).then(() => {
    completions.push('p1');
  });

  // Start Call 2 (which should queue and not run concurrently) after a small delay
  await new Promise((r) => setTimeout(r, 10));

  const p2 = runtime['flushOutput'](true, false).then(() => {
    completions.push('p2');
  });

  await Promise.all([p1, p2]);

  assert.equal(maxConcurrentFlushes, 1, 'Flushes must not run concurrently');
  assert.deepEqual(completions, ['p1', 'p2'], 'Call 2 must not complete before Call 1 and must wait for its own turn');
});
