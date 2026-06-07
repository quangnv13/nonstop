import { test } from 'node:test';
import assert from 'node:assert';
import { VirtualTerminal } from './terminal.js';

test('VirtualTerminal - write characters and carriage return', () => {
  const vt = new VirtualTerminal(10, 5);
  vt.write('hello');
  assert.deepEqual(vt.getLines(), [
    'hello     ',
    '          ',
    '          ',
    '          ',
    '          '
  ]);
  
  // Carriage return moves cursor back, next write overwrites
  vt.write('\rworld');
  assert.deepEqual(vt.getLines(), [
    'world     ',
    '          ',
    '          ',
    '          ',
    '          '
  ]);
});

test('VirtualTerminal - backspace and tabs', () => {
  const vt = new VirtualTerminal(10, 2);
  vt.write('abc\bde');
  // abc -> backspace cursor to 'c' -> write d (overwrites c) -> write e
  assert.deepEqual(vt.getLines(), [
    'abde      ',
    '          '
  ]);

  const vt2 = new VirtualTerminal(16, 2);
  vt2.write('a\tb');
  // 'a' is at col 0, next tab stop is col 8, so 'b' is at col 8
  assert.deepEqual(vt2.getLines(), [
    'a       b       ',
    '                '
  ]);
});

test('VirtualTerminal - scrolling', () => {
  const vt = new VirtualTerminal(5, 3);
  vt.write('line1\nline2\nline3');
  assert.deepEqual(vt.getLines(), [
    'line1',
    'line2',
    'line3'
  ]);

  vt.write('\nline4');
  assert.deepEqual(vt.getLines(), [
    'line2',
    'line3',
    'line4'
  ]);
});

test('VirtualTerminal - cursor positioning and clear line', () => {
  const vt = new VirtualTerminal(10, 3);
  vt.write('1234567890\nabcdefghij');
  
  // Move cursor to row 1 (second row, 0-based), col 4 (5th col)
  // ANSI code: ESC [ 2;5 H
  vt.write('\x1b[2;5H');
  vt.write('XYZ');
  
  assert.deepEqual(vt.getLines(), [
    '1234567890',
    'abcdXYZhij',
    '          '
  ]);

  // Erase from cursor to end of line: ESC [ K (or ESC [ 0 K)
  // Cursor is at col 7 (since 'XYZ' moved it forward by 3)
  vt.write('\x1b[K');
  assert.deepEqual(vt.getLines(), [
    '1234567890',
    'abcdXYZ   ',
    '          '
  ]);
});

test('VirtualTerminal - skip OSC title and charset codes', () => {
  const vt = new VirtualTerminal(10, 2);
  // Charset sequence: ESC ( B
  // OSC sequence: ESC ] 0;Hello World\u0007
  vt.write('\x1b(Babc\x1b]0;Hello World\x07def');
  assert.deepEqual(vt.getLines(), [
    'abcdef    ',
    '          '
  ]);
});
