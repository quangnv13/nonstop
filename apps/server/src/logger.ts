type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

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
  const line = `[${new Date().toISOString()}] [server] [${level}] ${message}${formatMeta(meta)}`;
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
