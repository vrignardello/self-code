import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execute } from '../electron/runner.mjs';

async function run(t, files, entry = 'main.ts') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'self-code-runner-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  const output = [];
  await execute({ root, file: entry }, message => output.push(message));
  return output;
}
test('executes typed code, relative modules and awaited asynchronous code', async t => {
  const output = await run(t, {
    'main.ts': 'import { sum } from "./projects/helpers"; const value: number = sum(20, 22); await new Promise(r => setTimeout(r, 5)); console.log(value);',
    'projects/helpers.ts': 'export const sum = (a: number, b: number) => a + b;',
  });
  assert.deepEqual(output, [{ type: 'log', text: '42' }, { type: 'done', error: false }]);
});
test('captures delayed console output and JavaScript without TypeScript heuristics', async t => {
  const output = await run(t, { 'main.js': 'console.log("interface is only text"); setTimeout(() => console.log("later"), 5);' }, 'main.js');
  assert.equal(output[0].text, 'interface is only text');
  assert.equal(output[1].text, 'later');
  assert.equal(output.at(-1).error, false);
});
test('reports compiler syntax failures and original TypeScript error locations', async t => {
  const syntax = await run(t, { 'main.ts': 'const x: = ;' });
  assert.equal(syntax.at(-1).error, true);
  const runtime = await run(t, { 'main.ts': 'const x: number = 42;\nthrow new Error("a useful error");\n' });
  assert.match(runtime[0].text, /a useful error/);
  assert.match(runtime[0].text, /main.ts:2:/);
});
test('reports missing imports and rejects relative imports outside the workspace', async t => {
  const missing = await run(t, { 'main.ts': 'import { value } from "./missing"; console.log(value);' });
  assert.match(missing[0].text, /No se encontró/);
  const outside = await run(t, { 'main.ts': 'import x from "../outside"; console.log(x);' });
  assert.match(outside[0].text, /dentro del workspace/);
});
