import * as fs from 'fs';
import * as path from 'path';

export type AppLanguage = 'en' | 'vi';
export type StartupMode = 'disabled' | 'background' | 'open-ui';

export interface AppConfig {
  telegramBotToken: string;
  adminUsername: string;
  clientName: string;
  telegramUsername: string;
  language: AppLanguage;
  startupMode: StartupMode;
  outputInterval: number;
  maxOutputLines: number;
  maxRenderLines: number;
  codexCmd: string;
  codexArgs: string;
  antigravityCmd: string;
  antigravityArgs: string;
}

export type ConfigFieldKey =
  | 'telegramBotToken'
  | 'adminUsername'
  | 'clientName'
  | 'telegramUsername'
  | 'language'
  | 'startupMode';

const DEFAULTS: AppConfig = {
  telegramBotToken: '',
  adminUsername: '',
  clientName: 'LocalClient',
  telegramUsername: '',
  language: 'en',
  startupMode: 'disabled',
  outputInterval: 20000,
  maxOutputLines: 50,
  maxRenderLines: 200,
  codexCmd: 'codex',
  codexArgs: '[]',
  antigravityCmd: 'agy',
  antigravityArgs: '[]'
};

export const ENV_FILE_PATH = path.join(process.cwd(), '.env');
export const ENV_EXAMPLE_FILE_PATH = path.join(process.cwd(), '.env.example');

export function parseConfigFromEnv(env: Record<string, string | undefined>): AppConfig {
  return {
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim() || DEFAULTS.telegramBotToken,
    adminUsername: normalizeUsername(env.ADMIN_USERNAME || ''),
    clientName: env.CLIENT_NAME?.trim() || DEFAULTS.clientName,
    telegramUsername: normalizeUsername(env.TELEGRAM_USERNAME || ''),
    language: parseLanguage(env.APP_LANGUAGE),
    startupMode: parseStartupMode(env.STARTUP_MODE),
    outputInterval: parseInteger(env.OUTPUT_INTERVAL, DEFAULTS.outputInterval),
    maxOutputLines: parseInteger(env.MAX_OUTPUT_LINES, DEFAULTS.maxOutputLines),
    maxRenderLines: parseInteger(env.MAX_RENDER_LINES, DEFAULTS.maxRenderLines),
    codexCmd: env.CODEX_CMD?.trim() || DEFAULTS.codexCmd,
    codexArgs: env.CODEX_ARGS?.trim() || DEFAULTS.codexArgs,
    antigravityCmd: env.ANTIGRAVITY_CMD?.trim() || DEFAULTS.antigravityCmd,
    antigravityArgs: env.ANTIGRAVITY_ARGS?.trim() || DEFAULTS.antigravityArgs
  };
}

export function getMissingConfigFields(config: AppConfig): ConfigFieldKey[] {
  const missing: ConfigFieldKey[] = [];

  if (!config.telegramBotToken) {
    missing.push('telegramBotToken');
  }

  if (!config.adminUsername) {
    missing.push('adminUsername');
  }

  return missing;
}

export function serializeConfigToEnv(config: AppConfig): string {
  return [
    `TELEGRAM_BOT_TOKEN=${config.telegramBotToken}`,
    `ADMIN_USERNAME=${config.adminUsername}`,
    `CLIENT_NAME=${config.clientName}`,
    `TELEGRAM_USERNAME=${config.telegramUsername}`,
    `APP_LANGUAGE=${config.language}`,
    `STARTUP_MODE=${config.startupMode}`,
    `OUTPUT_INTERVAL=${config.outputInterval}`,
    `MAX_OUTPUT_LINES=${config.maxOutputLines}`,
    `MAX_RENDER_LINES=${config.maxRenderLines}`,
    '',
    '# CLI OVERRIDES (Optional)',
    `CODEX_CMD=${config.codexCmd}`,
    `CODEX_ARGS=${config.codexArgs}`,
    `ANTIGRAVITY_CMD=${config.antigravityCmd}`,
    `ANTIGRAVITY_ARGS=${config.antigravityArgs}`,
    ''
  ].join('\n');
}

export function loadConfigFromDisk(): AppConfig {
  if (!fs.existsSync(ENV_FILE_PATH)) {
    return DEFAULTS;
  }

  const raw = fs.readFileSync(ENV_FILE_PATH, 'utf8');
  const env: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1);
    env[key] = value;
  }

  return parseConfigFromEnv(env);
}

export function saveConfigToDisk(config: AppConfig): void {
  fs.writeFileSync(ENV_FILE_PATH, serializeConfigToEnv(config), 'utf8');
}

export function ensureEnvExampleFile(): void {
  if (fs.existsSync(ENV_EXAMPLE_FILE_PATH)) {
    return;
  }

  fs.writeFileSync(ENV_EXAMPLE_FILE_PATH, serializeConfigToEnv(DEFAULTS), 'utf8');
}

export function applyConfigToProcessEnv(config: AppConfig): void {
  process.env.TELEGRAM_BOT_TOKEN = config.telegramBotToken;
  process.env.ADMIN_USERNAME = config.adminUsername;
  process.env.CLIENT_NAME = config.clientName;
  process.env.TELEGRAM_USERNAME = config.telegramUsername;
  process.env.APP_LANGUAGE = config.language;
  process.env.STARTUP_MODE = config.startupMode;
  process.env.OUTPUT_INTERVAL = String(config.outputInterval);
  process.env.MAX_OUTPUT_LINES = String(config.maxOutputLines);
  process.env.MAX_RENDER_LINES = String(config.maxRenderLines);
  process.env.CODEX_CMD = config.codexCmd;
  process.env.CODEX_ARGS = config.codexArgs;
  process.env.ANTIGRAVITY_CMD = config.antigravityCmd;
  process.env.ANTIGRAVITY_ARGS = config.antigravityArgs;
}

function normalizeUsername(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseLanguage(value: string | undefined): AppLanguage {
  return value === 'vi' ? 'vi' : 'en';
}

function parseStartupMode(value: string | undefined): StartupMode {
  if (value === 'background' || value === 'open-ui') {
    return value;
  }

  return 'disabled';
}
