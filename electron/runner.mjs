import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { inspect } from 'node:util';
import ts from 'typescript';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

const hostRequire = createRequire(import.meta.url);
const post = message => process.parentPort.postMessage(message);
const nativeDelay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function execute({ root, file }, emit = post) {
  const maps = new Map();
  const modules = new Map();
  const timers = new Set();
  const times = new Map();
  const output = (type, args) => emit({ type, text: args.map(value => typeof value === 'string' ? value : inspect(value, { colors: false, depth: 5, maxArrayLength: 100, maxStringLength: 10000 })).join(' ').slice(0, 20000) });
  const consoleAPI = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug', 'table', 'dir'].map(type => [type, (...args) => output(type === 'table' || type === 'dir' ? 'log' : type, args)]));
  consoleAPI.assert = (condition, ...args) => { if (!condition) output('error', ['Assertion failed:', ...args]); };
  consoleAPI.time = (label = 'default') => times.set(label, performance.now());
  consoleAPI.timeEnd = (label = 'default') => { output('info', [`${label}: ${(performance.now() - (times.get(label) ?? performance.now())).toFixed(2)} ms`]); times.delete(label); };
  consoleAPI.clear = () => emit({ type: 'clear' });
  const context = vm.createContext({
    console: consoleAPI, Buffer, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, AbortSignal, structuredClone, performance, fetch,
    setTimeout(callback, delay, ...args) { const handle = setTimeout(() => { try { callback(...args); } catch (error) { output('error', [formatError(error)]); } finally { timers.delete(handle); } }, delay); timers.add(handle); return handle; },
    clearTimeout(handle) { clearTimeout(handle); timers.delete(handle); },
    setInterval(callback, delay, ...args) { const handle = setInterval(() => { try { callback(...args); } catch (error) { output('error', [formatError(error)]); } }, delay); timers.add(handle); return handle; },
    clearInterval(handle) { clearInterval(handle); timers.delete(handle); },
  });
  function formatError(error) {
    return String(error.stack ?? error).replace(/([^\s()]+\.(?:ts|js)):(\d+):(\d+)/g, (match, filename, line, column) => {
      const map = maps.get(filename);
      if (!map) return match;
      const position = originalPositionFor(map, { line: Number(line), column: Number(column) - 1 });
      return position.line == null ? match : `${path.relative(root, filename)}:${position.line}:${(position.column ?? 0) + 1}`;
    });
  }
  function localPath(candidate) {
    const normalized = path.resolve(candidate);
    const relative = path.relative(root, normalized);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('El import debe estar dentro del workspace.');
    let cursor = root;
    for (const part of relative.split(path.sep)) { cursor = path.join(cursor, part); if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error('No se admiten imports mediante enlaces simbólicos.'); }
    return normalized;
  }
  function resolveImport(specifier, importer) {
    if (!specifier.startsWith('.')) {
      if (specifier.startsWith('node:')) return { builtin: specifier };
      throw new Error(`Usa imports relativos o módulos node:. No se admiten paquetes npm: ${specifier}`);
    }
    const base = localPath(path.resolve(path.dirname(importer), specifier));
    for (const candidate of [base, `${base}.ts`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.js'), ...(base.endsWith('.js') ? [base.slice(0, -3) + '.ts'] : [])]) {
      localPath(candidate);
      if (/\.(js|ts)$/.test(candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return { filename: candidate };
    }
    throw new Error(`No se encontró ${specifier} desde ${path.relative(root, importer)}.`);
  }
  function compile(filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const result = ts.transpileModule(source, { fileName: filename, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, sourceMap: true, inlineSources: true, esModuleInterop: true } });
    const errors = result.diagnostics?.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error) ?? [];
    if (errors.length) throw new Error(errors.map(diagnostic => {
      const location = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      return `${path.relative(root, filename)}:${(location?.line ?? 0) + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
    }).join('\n'));
    if (result.sourceMapText) maps.set(filename, new TraceMap(result.sourceMapText));
    return result.outputText;
  }
  function load(filename, entry = false) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const require = specifier => { const resolved = resolveImport(specifier, filename); return resolved.builtin ? hostRequire(resolved.builtin) : load(resolved.filename); };
    const code = compile(filename);
    const wrapped = `(${entry ? 'async ' : ''}function(exports, require, module, __filename, __dirname){\n${code}\n})`;
    const fn = new vm.Script(wrapped, { filename, lineOffset: -1 }).runInContext(context);
    const result = fn(module.exports, require, module, filename, path.dirname(filename));
    return entry ? result : module.exports;
  }
  try {
    await load(localPath(path.join(root, file)), true);
    while (timers.size) await nativeDelay(10);
    emit({ type: 'done', error: false });
  } catch (error) {
    emit({ type: 'error', text: formatError(error) });
    emit({ type: 'done', error: true });
  } finally { for (const timer of timers) { clearTimeout(timer); clearInterval(timer); } }
}

if (process.parentPort) process.parentPort.once('message', async event => { await execute(event.data); process.exit(0); });
