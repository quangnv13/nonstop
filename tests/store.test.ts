import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  loadWorkspaces,
  saveWorkspaces,
  createWorkspaceId,
  DATA_DIR,
  workspacesFilePath
} from '../src/store.js';
import { Workspace } from '../src/types.js';

test('store - createWorkspaceId generates unique IDs with expected prefix', () => {
  const id1 = createWorkspaceId();
  const id2 = createWorkspaceId();

  assert.ok(id1.startsWith('ws_'));
  assert.ok(id2.startsWith('ws_'));
  assert.notEqual(id1, id2);
});

test('store - loadWorkspaces and saveWorkspaces works correctly with filesystem backup', () => {
  let backupExists = false;
  let backupContent = '';

  // 1. Backup existing workspaces.json if it exists
  if (fs.existsSync(workspacesFilePath)) {
    backupExists = true;
    try {
      backupContent = fs.readFileSync(workspacesFilePath, 'utf8');
    } catch {
      backupExists = false;
    }
  }

  try {
    // Ensure the data directory exists for testing
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // 2. Test initial load when file does not exist (or has been temporarily removed)
    if (fs.existsSync(workspacesFilePath)) {
      fs.unlinkSync(workspacesFilePath);
    }
    const initialWorkspaces = loadWorkspaces();
    assert.deepEqual(initialWorkspaces, []);

    // 3. Test saving workspaces
    const testWorkspaces: Workspace[] = [
      { id: 'ws_1', name: 'Project Alpha', path: '/path/to/alpha' },
      { id: 'ws_2', name: 'Project Beta', path: '/path/to/beta' }
    ];

    saveWorkspaces(testWorkspaces);

    // Verify it wrote file to workspacesFilePath
    assert.ok(fs.existsSync(workspacesFilePath));

    // 4. Test loading workspaces back
    const loaded = loadWorkspaces();
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].id, 'ws_1');
    assert.equal(loaded[0].name, 'Project Alpha');
    assert.equal(loaded[0].path, '/path/to/alpha');
    assert.equal(loaded[1].id, 'ws_2');

    // 5. Test validation of records (isWorkspaceRecord filters bad records)
    fs.writeFileSync(
      workspacesFilePath,
      JSON.stringify([
        { id: 'ws_good', name: 'Good', path: '/good' },
        { id: 'ws_bad', path: '/bad' }, // missing name
        { name: 'ws_bad_2', path: '/bad2' } // missing id
      ]),
      'utf8'
    );

    const validatedLoaded = loadWorkspaces();
    assert.equal(validatedLoaded.length, 1);
    assert.equal(validatedLoaded[0].id, 'ws_good');

    // 6. Test JSON parse error handling
    fs.writeFileSync(workspacesFilePath, 'invalid json content', 'utf8');
    const errorLoaded = loadWorkspaces();
    assert.deepEqual(errorLoaded, []);

  } finally {
    // 7. Restore backup
    if (backupExists) {
      fs.writeFileSync(workspacesFilePath, backupContent, 'utf8');
    } else {
      try {
        if (fs.existsSync(workspacesFilePath)) {
          fs.unlinkSync(workspacesFilePath);
        }
      } catch {
        // ignore
      }
    }
  }
});
