import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  getLogFilePath,
  cleanOldLogs,
  getRecentLogLines,
  logger
} from '../src/logger.js';

test('logger - getLogFilePath resolves correctly', () => {
  const filePath = getLogFilePath();
  assert.ok(filePath.endsWith('.log'));
  assert.ok(filePath.includes('nonstop'));
});

test('logger - writing logs and reading recent log lines works', () => {
  const logFile = getLogFilePath();
  let backupContent: string | null = null;
  const exists = fs.existsSync(logFile);

  if (exists) {
    backupContent = fs.readFileSync(logFile, 'utf8');
    fs.writeFileSync(logFile, '', 'utf8'); // clear it for the test
  }

  try {
    const testMsg1 = `Test Message Info ${Date.now()}`;
    const testMsg2 = `Test Message Error ${Date.now()}`;

    logger.info(testMsg1);
    logger.error(testMsg2, { details: 'debug-info' });

    const lines = getRecentLogLines(5);
    assert.ok(lines.length >= 2);

    const infoLine = lines.find((l) => l.includes(testMsg1));
    const errorLine = lines.find((l) => l.includes(testMsg2));

    assert.ok(infoLine !== undefined);
    assert.ok(infoLine?.includes('[INFO]'));

    assert.ok(errorLine !== undefined);
    assert.ok(errorLine?.includes('[ERROR]'));
    assert.ok(errorLine?.includes('{"details":"debug-info"}'));

  } finally {
    if (exists && backupContent !== null) {
      fs.writeFileSync(logFile, backupContent, 'utf8');
    } else {
      try {
        if (fs.existsSync(logFile)) {
          fs.unlinkSync(logFile);
        }
      } catch {
        // ignore
      }
    }
  }
});

test('logger - cleanOldLogs deletes expired logs', () => {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Create an extremely old log file name: nonstop-1990-01-01-00.log
  const oldLogPath = path.join(dataDir, 'nonstop-1990-01-01-00.log');
  fs.writeFileSync(oldLogPath, 'old log content', 'utf8');

  // Set modification time to 10 days ago
  const mtime = new Date();
  mtime.setDate(mtime.getDate() - 10);
  fs.utimesSync(oldLogPath, mtime, mtime);

  // Create a recent log file: nonstop-future.log
  const newLogPath = path.join(dataDir, `nonstop-${new Date().getFullYear()}-12-31-23.log`);
  fs.writeFileSync(newLogPath, 'new log content', 'utf8');

  try {
    cleanOldLogs();

    // The old one should have been deleted
    assert.ok(!fs.existsSync(oldLogPath), 'Old log file should be cleaned up');
    // The new one should remain
    assert.ok(fs.existsSync(newLogPath), 'Recent log file should not be cleaned up');

  } finally {
    try {
      if (fs.existsSync(oldLogPath)) {
        fs.unlinkSync(oldLogPath);
      }
      if (fs.existsSync(newLogPath)) {
        fs.unlinkSync(newLogPath);
      }
    } catch {
      // ignore
    }
  }
});
