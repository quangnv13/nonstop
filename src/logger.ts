import * as fs from 'fs';
import * as path from 'path';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_FILE_PATH = path.join(process.cwd(), 'data', 'nonstop.log');

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
    fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true });
    fs.appendFileSync(LOG_FILE_PATH, `${line}\n`, 'utf8');
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
