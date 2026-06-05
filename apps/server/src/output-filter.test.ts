import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOutputFilterConfig,
  decideOutputDelivery,
  normalizeOutput
} from './output-filter.js';

const config = buildOutputFilterConfig({
  OUTPUT_DUPLICATE_THRESHOLD: '0.7',
  OUTPUT_SPINNER_CHAR_RATIO: '0.6',
  OUTPUT_SPINNER_MIN_CHARS: '8'
});

test('skips snapshots when similarity is above configured threshold', () => {
  const decision = decideOutputDelivery(
    normalizeOutput('Select an option\n> Allow access\n  Deny'),
    normalizeOutput('Select an option\n> Allow access\n  Deny '),
    config
  );

  assert.equal(decision.shouldSend, false);
  assert.equal(decision.reason, 'duplicate');
  assert.ok(decision.similarity >= 0.7);
});

test('allows near-identical snapshots after bypass actions', () => {
  const decision = decideOutputDelivery(
    normalizeOutput('Select an option\n> Allow access\n  Deny'),
    normalizeOutput('Select an option\n> Allow access\n  Deny'),
    config,
    true
  );

  assert.equal(decision.shouldSend, true);
  assert.equal(decision.reason, 'send');
  assert.equal(decision.similarity, 1);
});

test('skips spinner-only output', () => {
  const decision = decideOutputDelivery('', '⠋⠙⠹⠸⠼⠴⠦ loading', config);

  assert.equal(decision.shouldSend, false);
  assert.equal(decision.reason, 'spinner');
});

test('sends materially different output', () => {
  const decision = decideOutputDelivery(
    normalizeOutput('Select an option\n> Allow access\n  Deny'),
    normalizeOutput('Select an option\n  Allow access\n> Deny'),
    config
  );

  assert.equal(decision.shouldSend, true);
  assert.equal(decision.reason, 'send');
  assert.ok(decision.similarity > 0);
});
