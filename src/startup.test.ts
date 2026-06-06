import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLinuxAutostartDesktopEntry,
  buildLinuxSystemdService,
  buildWindowsStartupCommand
} from './startup.js';

test('buildWindowsStartupCommand uses background flag when requested', () => {
  const command = buildWindowsStartupCommand('C:\\nonstop\\dist\\index.js', 'background');
  assert.match(command, /--background/);
  assert.match(command, /node/);
});

test('buildLinuxAutostartDesktopEntry launches ui mode', () => {
  const entry = buildLinuxAutostartDesktopEntry('/opt/nonstop/dist/index.js');
  assert.match(entry, /Exec=node \/opt\/nonstop\/dist\/index\.js --open-ui/);
  assert.match(entry, /\[Desktop Entry\]/);
});

test('buildLinuxSystemdService launches background mode', () => {
  const service = buildLinuxSystemdService('/opt/nonstop', '/opt/nonstop/dist/index.js');
  assert.match(service, /WorkingDirectory=\/opt\/nonstop/);
  assert.match(service, /--background/);
});
