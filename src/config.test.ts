import test from 'node:test';
import assert from 'node:assert/strict';
import { getMissingConfigFields, parseConfigFromEnv, serializeConfigToEnv } from './config.js';

test('parseConfigFromEnv applies defaults and preserves configured values', () => {
  const config = parseConfigFromEnv({
    TELEGRAM_BOT_TOKEN: 'token',
    ADMIN_USERNAME: '@admin',
    CLIENT_NAME: 'Desk',
    TELEGRAM_USERNAME: '@owner',
    APP_LANGUAGE: 'vi',
    STARTUP_MODE: 'background',
    OUTPUT_INTERVAL: '15000',
    MAX_OUTPUT_LINES: '80',
    MAX_RENDER_LINES: '250'
  });

  assert.equal(config.telegramBotToken, 'token');
  assert.equal(config.adminUsername, '@admin');
  assert.equal(config.clientName, 'Desk');
  assert.equal(config.telegramUsername, '@owner');
  assert.equal(config.language, 'vi');
  assert.equal(config.startupMode, 'background');
  assert.equal(config.outputInterval, 15000);
  assert.equal(config.maxOutputLines, 80);
  assert.equal(config.maxRenderLines, 250);
});

test('getMissingConfigFields reports required onboarding gaps', () => {
  const config = parseConfigFromEnv({
    CLIENT_NAME: 'Desk'
  });

  assert.deepEqual(getMissingConfigFields(config), ['telegramBotToken', 'adminUsername']);
});

test('serializeConfigToEnv writes stable env keys for editable config', () => {
  const envText = serializeConfigToEnv(
    parseConfigFromEnv({
      TELEGRAM_BOT_TOKEN: 'token',
      ADMIN_USERNAME: '@admin',
      CLIENT_NAME: 'Desk',
      TELEGRAM_USERNAME: '@owner',
      APP_LANGUAGE: 'en',
      STARTUP_MODE: 'open-ui'
    })
  );

  assert.match(envText, /^TELEGRAM_BOT_TOKEN=token/m);
  assert.match(envText, /^ADMIN_USERNAME=@admin/m);
  assert.match(envText, /^CLIENT_NAME=Desk/m);
  assert.match(envText, /^TELEGRAM_USERNAME=@owner/m);
  assert.match(envText, /^APP_LANGUAGE=en/m);
  assert.match(envText, /^STARTUP_MODE=open-ui/m);
});
