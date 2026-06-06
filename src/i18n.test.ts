import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from './i18n.js';

test('createTranslator returns vietnamese copy when requested', () => {
  const t = createTranslator('vi');
  assert.equal(t('wizard.title'), 'Thiet lap nonstop');
});

test('createTranslator falls back to english for unknown key language mismatch', () => {
  const t = createTranslator('en');
  assert.equal(t('dashboard.title'), 'nonstop client');
});
