import { _electron as electron } from 'playwright-core';
import executablePath from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const data = await fs.mkdtemp(path.join(os.tmpdir(), 'self-code-e2e-'));
let application;
const errors = [];
async function launch() {
  const env = { ...process.env, SELF_CODE_DATA_DIR: data };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ executablePath, args: ['.'], env, timeout: 30000 });
  const page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.locator('.tree-row[data-path="welcome.ts"]').waitFor({ timeout: 30000 });
  return page;
}
async function create(page, kind, name) {
  await page.locator(kind === 'folder' ? '#new-folder' : '#new-file').click();
  await page.locator('#dialog input[name="name"]').fill(name);
  await page.locator('#dialog-submit').click();
  await page.locator('#dialog').waitFor({ state: 'hidden' });
}
async function replaceCode(page, code) {
  await page.locator('#editor .view-lines').click({ position: { x: 180, y: 20 } });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.insertText(code);
}
try {
  let page = await launch();
  await page.locator('#layout-toggle').click();
  await page.locator('[data-layout="right"]').click();
  assert.equal(await page.locator('#resize-console').getAttribute('aria-orientation'), 'vertical');
  const editorBounds = await page.locator('.editor-area').boundingBox();
  const consoleBounds = await page.locator('.console-panel').boundingBox();
  assert.ok(consoleBounds.x >= editorBounds.x + editorBounds.width);
  assert.equal(Math.round(consoleBounds.y), Math.round(editorBounds.y));
  await page.locator('#resize-console').focus();
  await page.keyboard.press('ArrowLeft');
  assert.ok((await page.locator('.console-panel').boundingBox()).width > consoleBounds.width);
  await page.locator('#collapse-sidebar').click();
  assert.equal(await page.locator('#sidebar').isVisible(), false);
  await page.locator('#search-focus').click();
  assert.equal(await page.locator('#sidebar').isVisible(), true);
  await page.locator('#explorer-focus').click();
  assert.equal(await page.locator('#sidebar').isVisible(), false);
  await page.reload();
  await page.locator('.tree-row[data-path="welcome.ts"]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#sidebar').isVisible(), false);
  assert.equal(await page.locator('#resize-console').getAttribute('aria-orientation'), 'vertical');
  await page.locator('#explorer-focus').click();
  await page.locator('#layout-toggle').click();
  await page.locator('[data-layout="bottom"]').click();
  const bottomBounds = await page.locator('.console-panel').boundingBox();
  const topBounds = await page.locator('.editor-area').boundingBox();
  assert.ok(bottomBounds.y >= topBounds.y + topBounds.height);
  assert.equal(await page.locator('#resize-console').getAttribute('aria-orientation'), 'horizontal');
  assert.equal(await page.getByText('Un espacio para tus ideas', { exact: true }).count(), 0);
  assert.equal(await page.getByText('LOCAL WORKSPACE', { exact: true }).count(), 0);
  console.log('PASS: console layouts, resize, sidebar toggle and restored preferences');
  await page.locator('#search-focus').click();
  assert.equal(await page.locator('#search').evaluate(element => document.activeElement === element), true);
  await page.locator('#search').fill('welcome');
  assert.equal(await page.locator('.tree-row[data-kind="file"]').count(), 1);
  await page.locator('#search-focus').click();
  assert.equal(await page.locator('#search').evaluate(element => element.selectionEnd - element.selectionStart), 7);
  await page.locator('#search').fill('');

  await page.locator('#root-row').click({ button: 'right' });
  assert.equal(await page.locator('#context-menu [data-action="trash"]').count(), 0);
  await page.locator('#context-menu [data-action="folder"]').click();
  await page.locator('#dialog input[name="name"]').fill('context-folder');
  await page.locator('#dialog-submit').click();
  await page.locator('.tree-row[data-path="context-folder"]').waitFor();
  await page.locator('.tree-row[data-path="context-folder"]').click({ button: 'right' });
  await page.locator('#context-menu [data-action="new"]').click();
  await page.locator('#dialog input[name="name"]').fill('shared.js');
  await page.locator('#dialog-submit').click();
  await page.locator('.tab.active[data-file="context-folder/shared.js"]').waitFor();
  const sharedCode = '// Compartir completo\nconsole.log("Hola 👋");\n';
  await replaceCode(page, sharedCode);
  await page.locator('#copy-file').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Archivo copiado.');
  assert.equal(await application.evaluate(({ clipboard }) => clipboard.readText()), sharedCode);
  // Empty explorer space creates at root even when a nested file is active.
  const treeBounds = await page.locator('#tree').boundingBox();
  await page.locator('#tree').click({ button: 'right', position: { x: 190, y: treeBounds.height - 3 } });
  await page.locator('#context-menu [data-action="new"]').click();
  await page.locator('#dialog input[name="name"]').fill('root-context.js');
  await page.locator('#dialog-submit').click();
  await page.locator('.tab.active[data-file="root-context.js"]').waitFor();
  await fs.access(path.join(data, 'workspace/root-context.js'));
  await page.locator('.tree-row[data-path="projects/patagonia"]').click({ button: 'right' });
  assert.equal(await page.locator('#context-menu [data-action="folder"]').count(), 0);
  assert.equal(await page.locator('#context-menu [data-action="new"]').count(), 1);
  await page.keyboard.press('Escape');
  await page.locator('.tree-row[data-path="welcome.ts"]').click();
  console.log('PASS: search, contextual creation at root/folder and copying the full current file');
  const originalWelcome = await fs.readFile(path.join(data, 'workspace/welcome.ts'), 'utf8');
  await replaceCode(page, 'function sample() {\n\tconst a = 1;\n\u00a0\u00a0const b = 2;\n\u2003\u2003return a + b;\n}');
  await page.locator('#editor .view-lines').getByText('return a + b;', { exact: false }).waitFor();
  // Allow the Unicode decoration worker to finish, then inspect rendered marks.
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#editor .unicode-highlight').count(), 0);
  assert.equal(await page.locator('#editor .core-guide').count(), 0);
  await page.screenshot({ path: 'artifacts/self-code-clean-indentation.png' });
  await replaceCode(page, originalWelcome);
  console.log('PASS: tabs and Unicode indentation render without boxes or guides');

  await page.locator('#run').click();
  await page.waitForFunction(() => document.querySelector('#execution-status').textContent.includes('Completado'), { timeout: 20000 });
  assert.match(await page.locator('#output').innerText(), /Hola desde Self Code/);
  console.log('PASS: welcome TypeScript, await and console');

  await page.locator('.tree-row[data-path="projects/patagonia/main.ts"]').click();
  await page.locator('#run').click();
  await page.waitForFunction(() => document.querySelector('#execution-status').textContent.includes('Completado'));
  assert.match(await page.locator('#output').innerText(), /Patagonia 42/);
  console.log('PASS: relative TypeScript imports in a second-level folder');

  await fs.mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/self-code-carbon.png' });
  await page.locator('#root-row').click();
  await create(page, 'folder', 'trips');
  await create(page, 'folder', 'south');
  assert.equal(await page.locator('#new-folder').isDisabled(), true);
  await create(page, 'file', 'test.ts');
  await replaceCode(page, 'const answer: number = "wrong type";\nconsole.log(answer);');
  await page.locator('#editor .squiggly-error').first().waitFor({ timeout: 15000 });
  console.log('PASS: TypeScript semantic diagnostics in the editor');
  await replaceCode(page, 'const answer: number = 42;\nconsole.log("Saved", answer);');
  await page.waitForFunction(() => document.querySelector('#save-state').textContent.includes('Guardado'));
  assert.match(await fs.readFile(path.join(data, 'workspace/trips/south/test.ts'), 'utf8'), /Saved/);
  console.log('PASS: folders, depth limit and automatic persistence');

  await page.locator('#themes').click();
  await page.locator('.theme-card').filter({ hasText: 'Paper' }).click();
  await page.locator('#dialog-submit').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'paper');
  await page.screenshot({ path: 'artifacts/self-code-paper.png' });
  console.log('PASS: global theme');

  await replaceCode(page, 'console.log("Blocking started");\nwhile (true) {}');
  await page.locator('#run').click();
  await page.waitForFunction(() => document.querySelector('#output').textContent.includes('Blocking started'));
  await page.locator('#stop').click();
  await page.waitForFunction(() => document.querySelector('#execution-status').textContent.includes('Detenido'));
  assert.equal(await page.locator('#stop').isDisabled(), true);
  await replaceCode(page, 'console.log("After stop");');
  await page.locator('#run').click();
  await page.waitForFunction(() => document.querySelector('#execution-status').textContent.includes('Completado'));
  assert.match(await page.locator('#output').innerText(), /After stop/);
  console.log('PASS: interrupt an actively blocking process and run again');

  await application.evaluate(({ app }) => app.quit());
  await application.waitForEvent('close', { timeout: 15000 });
  application = undefined;
  page = await launch();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'paper');
  await page.locator('.tab.active[data-file="trips/south/test.ts"]').waitFor();
  await page.locator('#run').click();
  await page.waitForFunction(() => document.querySelector('#execution-status').textContent.includes('Completado'));
  assert.match(await page.locator('#output').innerText(), /After stop/);
  console.log('PASS: close flush, session and theme restoration');
  assert.deepEqual(errors, [], 'Renderer/worker errors');
  console.log('All Electron smoke checks passed.');
} finally {
  if (application) await application.close();
  await fs.rm(data, { recursive: true, force: true });
}
