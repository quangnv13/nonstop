import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseConfigFromEnv,
  getMissingConfigFields,
  serializeConfigToEnv,
  loadConfigFromDisk,
  saveConfigToDisk,
  applyConfigToProcessEnv
} from '../src/config.js';

test('config - parseConfigFromEnv parses variables and sets defaults', () => {
  const parsed = parseConfigFromEnv({
    TELEGRAM_BOT_TOKEN: ' 123456:ABC-DEF ',
    ADMIN_USERNAME: 'john_doe',
    CLIENT_NAME: 'MyClient',
    APP_LANGUAGE: 'vi',
    STARTUP_MODE: 'open-ui',
    OUTPUT_INTERVAL: '15000',
    MAX_OUTPUT_LINES: '100',
    LOG_RETENTION_DAYS: '5',
    LOG_ROTATION_HOURLY: 'true'
  });

  assert.equal(parsed.telegramBotToken, '123456:ABC-DEF');
  assert.equal(parsed.adminUsername, '@john_doe'); // should auto-prefix with @
  assert.equal(parsed.clientName, 'MyClient');
  assert.equal(parsed.language, 'vi');
  assert.equal(parsed.startupMode, 'open-ui');
  assert.equal(parsed.outputInterval, 15000);
  assert.equal(parsed.maxOutputLines, 100);
  assert.equal(parsed.logRetentionDays, 5);
  assert.equal(parsed.logRotationHourly, true);
});

test('config - parseConfigFromEnv handles missing optional values and uses defaults', () => {
  const parsed = parseConfigFromEnv({});

  assert.equal(parsed.telegramBotToken, '');
  assert.equal(parsed.adminUsername, '');
  assert.equal(parsed.clientName, 'LocalClient');
  assert.equal(parsed.language, 'en');
  assert.equal(parsed.startupMode, 'disabled');
  assert.equal(parsed.outputInterval, 20000);
  assert.equal(parsed.logRetentionDays, 7);
  assert.equal(parsed.logRotationHourly, false);
});

test('config - getMissingConfigFields detects missing mandatory fields', () => {
  const config1 = parseConfigFromEnv({
    TELEGRAM_BOT_TOKEN: '',
    ADMIN_USERNAME: ''
  });
  assert.deepEqual(getMissingConfigFields(config1), ['telegramBotToken', 'adminUsername']);

  const config2 = parseConfigFromEnv({
    TELEGRAM_BOT_TOKEN: 'some-token',
    ADMIN_USERNAME: ''
  });
  assert.deepEqual(getMissingConfigFields(config2), ['adminUsername']);

  const config3 = parseConfigFromEnv({
    TELEGRAM_BOT_TOKEN: 'some-token',
    ADMIN_USERNAME: 'some-admin'
  });
  assert.deepEqual(getMissingConfigFields(config3), []);
});

test('config - serializeConfigToEnv generates correct env string format', () => {
  const config = parseConfigFromEnv({
    TELEGRAM_BOT_TOKEN: 'my-token',
    ADMIN_USERNAME: 'my-admin',
    APP_LANGUAGE: 'zh',
    STARTUP_MODE: 'background'
  });

  const serialized = serializeConfigToEnv(config);
  assert.ok(serialized.includes('TELEGRAM_BOT_TOKEN=my-token'));
  assert.ok(serialized.includes('ADMIN_USERNAME=@my-admin'));
  assert.ok(serialized.includes('APP_LANGUAGE=zh'));
  assert.ok(serialized.includes('STARTUP_MODE=background'));
});

test('config - loadConfigFromDisk / saveConfigToDisk handles filesystem operations', () => {
  const envPath = path.join(process.cwd(), '.env');
  let envBackup: string | null = null;
  let backupExists = false;

  // 1. Backup existing .env file
  if (fs.existsSync(envPath)) {
    backupExists = true;
    envBackup = fs.readFileSync(envPath, 'utf8');
  }

  try {
    // 2. Write a temporary .env file for testing loadConfigFromDisk
    const testEnvContent = 'TELEGRAM_BOT_TOKEN=test-token-file\nADMIN_USERNAME=test-admin-file\nAPP_LANGUAGE=zh\nSTARTUP_MODE=background';
    fs.writeFileSync(envPath, testEnvContent, 'utf8');

    const config = loadConfigFromDisk();
    assert.equal(config.telegramBotToken, 'test-token-file');
    assert.equal(config.adminUsername, '@test-admin-file');
    assert.equal(config.language, 'zh');
    assert.equal(config.startupMode, 'background');

    // 3. Test saveConfigToDisk
    config.telegramBotToken = 'updated-token-file';
    config.language = 'vi';
    saveConfigToDisk(config);

    const reloadedConfig = loadConfigFromDisk();
    assert.equal(reloadedConfig.telegramBotToken, 'updated-token-file');
    assert.equal(reloadedConfig.language, 'vi');

  } finally {
    // 4. Restore backup or clean up
    if (backupExists && envBackup !== null) {
      fs.writeFileSync(envPath, envBackup, 'utf8');
    } else if (fs.existsSync(envPath)) {
      fs.unlinkSync(envPath);
    }
  }
});

test('config - applyConfigToProcessEnv sets process.env values', () => {
  const config = parseConfigFromEnv({
    TELEGRAM_BOT_TOKEN: 'test-env-token',
    ADMIN_USERNAME: 'test-env-admin',
    CLIENT_NAME: 'test-client'
  });

  applyConfigToProcessEnv(config);
  assert.equal(process.env.TELEGRAM_BOT_TOKEN, 'test-env-token');
  assert.equal(process.env.ADMIN_USERNAME, '@test-env-admin');
  assert.equal(process.env.CLIENT_NAME, 'test-client');
});
