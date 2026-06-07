import * as fs from 'fs';
import * as path from 'path';
import { loadConfigFromDisk } from './config.js';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export function getLogFilePath(): string {
  try {
    const config = loadConfigFromDisk();
    if (config.logRotationHourly) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      return path.join(process.cwd(), 'data', `nonstop-${year}-${month}-${day}-${hour}.log`);
    }
  } catch {
    // fallback
  }
  return path.join(process.cwd(), 'data', 'nonstop.log');
}

export function cleanOldLogs(): void {
  try {
    const config = loadConfigFromDisk();
    const retentionDays = config.logRetentionDays;
    if (retentionDays <= 0) return;

    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) return;

    const files = fs.readdirSync(dataDir);
    const now = Date.now();
    const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (file === 'nonstop.log' || (file.startsWith('nonstop-') && file.endsWith('.log'))) {
        const filePath = path.join(dataDir, file);
        const stats = fs.statSync(filePath);
        const ageMs = now - stats.mtime.getTime();
        if (ageMs > maxAgeMs) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch {
    // ignore
  }
}

export function getRecentLogLines(count: number = 25): string[] {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) return [];

    const files = fs.readdirSync(dataDir)
      .filter(file => file === 'nonstop.log' || (file.startsWith('nonstop-') && file.endsWith('.log')))
      .map(file => ({
        name: file,
        path: path.join(dataDir, file),
        mtime: fs.statSync(path.join(dataDir, file)).mtime.getTime()
      }));

    if (files.length === 0) return [];

    // Sort files by modification time descending (latest first)
    files.sort((a, b) => b.mtime - a.mtime);

    let lines: string[] = [];
    for (const file of files) {
      if (fs.existsSync(file.path)) {
        const fileContent = fs.readFileSync(file.path, 'utf8');
        const fileLines = fileContent.split(/\r?\n/).filter(Boolean);
        lines = [...fileLines, ...lines];
        if (lines.length >= count) {
          break;
        }
      }
    }
    return lines.slice(-count);
  } catch {
    return [];
  }
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) {
    return '';
  }

  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ' {"meta":"[unserializable]"}';
  }
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const line = `[${new Date().toISOString()}] [nonstop] [${level}] ${message}${formatMeta(meta)}`;
  writeLogFile(line);
  if (level === 'ERROR') {
    console.error(line);
    return;
  }
  if (level === 'WARN') {
    console.warn(line);
    return;
  }
  console.log(line);
}

function writeLogFile(line: string): void {
  try {
    const logFilePath = getLogFilePath();
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    fs.appendFileSync(logFilePath, `${line}\n`, 'utf8');
  } catch {
    return;
  }
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    log('DEBUG', message, meta);
  },
  info(message: string, meta?: Record<string, unknown>) {
    log('INFO', message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    log('WARN', message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    log('ERROR', message, meta);
  }
};
