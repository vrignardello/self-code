import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Workspace } from '../electron/workspace.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'self-code-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return new Workspace(root);
}
test('files persist at root and both folder levels; third-level folders are rejected', async t => {
  const ws = await fixture(t);
  await ws.create('', 'scratch.js', 'file');
  await ws.create('', 'projects', 'folder');
  await ws.create('projects', 'patagonia', 'folder');
  await ws.create('projects/patagonia', 'main.ts', 'file');
  await ws.write('projects/patagonia/main.ts', 'const altitude: number = 3405;');
  const reopened = new Workspace(ws.root);
  assert.equal(await reopened.read('projects/patagonia/main.ts'), 'const altitude: number = 3405;');
  assert.deepEqual((await reopened.list()).map(item => item.name), ['projects', 'scratch.js']);
  await assert.rejects(ws.create('projects/patagonia', 'too-deep', 'folder'), /dos niveles/);
});
test('moves enforce depth for every descendant and preserve existing files', async t => {
  const ws = await fixture(t);
  await ws.create('', 'projects', 'folder');
  await ws.create('projects', 'patagonia', 'folder');
  await ws.create('', 'other', 'folder');
  await assert.rejects(ws.move('projects', 'other', 'projects'), /dos niveles/);
  await assert.rejects(ws.move('projects', 'projects/patagonia', 'nested'), /sí misma/);
  await ws.create('', 'one.ts', 'file'); await ws.write('one.ts', '42');
  await ws.create('', 'two.ts', 'file'); await ws.write('two.ts', '7');
  await assert.rejects(ws.move('one.ts', '', 'two.ts'), /Ya existe/);
  assert.equal(await ws.read('two.ts'), '7');
  assert.equal(await ws.move('one.ts', 'projects/patagonia', 'renamed.ts'), 'projects/patagonia/renamed.ts');
  assert.equal(await ws.read('projects/patagonia/renamed.ts'), '42');
});
test('rejects traversal, symlinks, invalid extensions and duplicate creation', async t => {
  const ws = await fixture(t);
  await assert.rejects(ws.read('../secret.ts'), /fuera/);
  await assert.rejects(ws.create('', '../bad.ts', 'file'), /nombre válido/);
  await assert.rejects(ws.create('', 'index.html', 'file'), /terminar/);
  await ws.create('', 'main.ts', 'file');
  await assert.rejects(ws.create('', 'main.ts', 'file'), { code: 'EEXIST' });
  await fs.symlink(path.join(ws.root, 'main.ts'), path.join(ws.root, 'link.ts'));
  await assert.rejects(ws.read('link.ts'), /simbólicos/);
  assert.equal((await ws.list()).length, 1);
});
