import { test } from 'node:test';
import assert from 'node:assert';
import { detectConfirmationPrompt } from '../src/prompt-detection.js';

test('prompt-detection - matches standard confirmation patterns', () => {
  // Bracket patterns
  assert.ok(detectConfirmationPrompt('Do you want to continue? [y/n]'));
  assert.ok(detectConfirmationPrompt('Apply changes? [Y/N]'));
  assert.ok(detectConfirmationPrompt('Proceed? [yes/no]'));
  assert.ok(detectConfirmationPrompt('Proceed? [Yes/No]'));

  // Word boundary patterns
  assert.ok(detectConfirmationPrompt('Type y/n to proceed'));
  assert.ok(detectConfirmationPrompt('Should we continue (yes/no)?'));

  // Phrase patterns
  assert.ok(detectConfirmationPrompt('Do you wish to continue?'));
  assert.ok(detectConfirmationPrompt('Are you sure you want to delete this file?'));
  assert.ok(detectConfirmationPrompt('Press Enter to confirm.'));

  // Confirm combinations
  assert.ok(detectConfirmationPrompt('Confirm?'));
  assert.ok(detectConfirmationPrompt('confirm this?'));
  assert.ok(detectConfirmationPrompt('confirm action?'));
  assert.ok(detectConfirmationPrompt('confirm action [y/n]'));
});

test('prompt-detection - does not match unrelated text', () => {
  assert.ok(!detectConfirmationPrompt('Hello world'));
  assert.ok(!detectConfirmationPrompt('This is a simple status message with no prompts.'));
  assert.ok(!detectConfirmationPrompt('confirming that everything is okay'));
  assert.ok(!detectConfirmationPrompt('just yes or no without boundaries like yesno'));
});

test('prompt-detection - handles ANSI escape sequences and extra whitespace', () => {
  // OSC sequences and carriage returns should be normalized and detected properly
  const ansiText = '\u001b]0;Title\u0007Do you want to continue? \r\n [y/n] \r\n';
  assert.ok(detectConfirmationPrompt(ansiText));

  const multipleSpaces = 'are   you   sure?';
  assert.ok(detectConfirmationPrompt(multipleSpaces));
});
