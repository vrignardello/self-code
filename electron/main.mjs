import { app, BrowserWindow, ipcMain, dialog, shell, Menu, utilityProcess } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Workspace } from './workspace.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
if (process.env.SELF_CODE_DATA_DIR) app.setPath('userData', path.resolve(process.env.SELF_CODE_DATA_DIR));
let window, workspace, preferences = {}, child = null, timer = null, execution = null, allowClose = false, quitting = false;
let preferenceQueue = Promise.resolve();
let mutationQueue = Promise.resolve();
const preferencePath = () => path.join(app.getPath('userData'), 'preferences.json');
async function persist() {
  const data = JSON.stringify(preferences, null, 2);
  preferenceQueue = preferenceQueue.catch(() => {}).then(async () => {
    const temporary = `${preferencePath()}.tmp`;
    await fs.writeFile(temporary, data);
    await fs.rename(temporary, preferencePath());
  });
  await preferenceQueue;
}
const send = value => { if (window && !window.isDestroyed()) window.webContents.send('execution:event', value); };
function finish(reason = 'stopped') {
  if (!execution) return;
  const current = execution;
  execution = null;
  clearTimeout(timer);
  timer = null;
  const process = child; child = null;
  process?.kill();
  send({ ...current, type: 'finished', reason });
}
function handle(channel, fn, mutation = false) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Origen inválido.');
    const action = async () => {
      try { return { ok: true, value: await fn(...args) }; }
      catch (error) { return { ok: false, error: error.code === 'EEXIST' ? 'Ya existe un elemento con ese nombre.' : error.message }; }
    };
    if (!mutation) return action();
    const pending = mutationQueue.then(action, action);
    mutationQueue = pending.then(() => {});
    return pending;
  });
}
function registerIPC() {
  handle('window:close-ready', async () => {
    await preferenceQueue;
    allowClose = true;
    window?.close();
    if (quitting) app.quit();
  }, true);
  handle('workspace:init', async () => ({ root: workspace.root, tree: await workspace.list(), session: preferences.sessions?.[workspace.root] ?? {} }));
  handle('workspace:tree', () => workspace.list());
  handle('workspace:read', relative => workspace.read(relative));
  handle('workspace:write', (relative, content) => workspace.write(relative, content), true);
  handle('workspace:create', (parent, name, kind) => workspace.create(parent, name, kind), true);
  handle('workspace:move', (relative, parent, name) => { if (execution) throw new Error('Detén la ejecución antes de mover archivos.'); return workspace.move(relative, parent, name); }, true);
  handle('workspace:trash', async relative => {
    if (execution) throw new Error('Detén la ejecución antes de eliminar archivos.');
    if (!relative) throw new Error('No se puede eliminar la raíz.');
    await shell.trashItem(await workspace.resolve(relative));
  }, true);
  handle('workspace:choose', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'], title: 'Elegir workspace' });
    if (result.canceled) return null;
    finish();
    const next = new Workspace(await fs.realpath(result.filePaths[0]));
    const tree = await next.list();
    workspace = next; preferences.workspace = workspace.root; await persist();
    return { root: workspace.root, tree, session: preferences.sessions?.[workspace.root] ?? {} };
  }, true);
  handle('session:save', async session => {
    if (!session || !Array.isArray(session.open) || session.open.some(p => typeof p !== 'string')) throw new Error('Sesión inválida.');
    preferences.sessions ??= {};
    preferences.sessions[workspace.root] = { open: session.open.slice(0, 100), active: session.active, expanded: session.expanded, theme: session.theme, fontSize: session.fontSize };
    await persist();
  }, true);
  handle('execution:stop', () => finish(), true);
  handle('execution:run', async (file, runId) => {
    await workspace.read(file);
    if (typeof runId !== 'string' || runId.length > 100) throw new Error('Ejecución inválida.');
    finish();
    execution = { runId, file };
    const current = execution;
    child = utilityProcess.fork(path.join(here, 'runner.mjs'), [], { stdio: 'pipe', serviceName: 'Self Code Runner', cwd: workspace.root });
    const runningChild = child;
    let outputCount = 0;
    child.on('message', message => {
      if (execution !== current || !message || typeof message.type !== 'string') return;
      if (message.type === 'done') { finish(message.error ? 'error' : 'completed'); return; }
      if (++outputCount > 1000) { send({ ...current, type: 'error', text: 'Límite de 1.000 mensajes alcanzado.' }); finish('limit'); return; }
      send({ ...current, ...message });
    });
    for (const [stream, type] of [[child.stdout, 'log'], [child.stderr, 'error']]) stream?.on('data', buffer => {
      if (execution !== current) return;
      if (++outputCount > 1000) { finish('limit'); return; }
      send({ ...current, type, text: buffer.toString().slice(0, 20000) });
    });
    child.on('exit', code => { if (execution === current) { child = null; finish(code === 0 ? 'completed' : 'error'); } });
    child.on('spawn', () => { if (execution === current) runningChild.postMessage({ root: workspace.root, file }); });
    timer = setTimeout(() => { if (execution === current) { send({ ...current, type: 'error', text: 'Se alcanzó el límite de 10 segundos.' }); finish('timeout'); } }, 10_000);
    return runId;
  }, true);
}

app.whenReady().then(async () => {
  try { preferences = JSON.parse(await fs.readFile(preferencePath(), 'utf8')); } catch {}
  let root = preferences.workspace ?? path.join(app.getPath('userData'), 'workspace');
  try { await fs.mkdir(root, { recursive: true }); await fs.access(root); } catch { root = path.join(app.getPath('userData'), 'workspace'); await fs.mkdir(root, { recursive: true }); }
  workspace = new Workspace(await fs.realpath(root));
  if ((await fs.readdir(root)).length === 0) {
    await fs.mkdir(path.join(root, 'projects', 'patagonia'), { recursive: true });
    await fs.writeFile(path.join(root, 'welcome.ts'), '// Tu próximo experimento empieza aquí.\n\ninterface Destination {\n  name: string;\n  altitude: number;\n}\n\nconst destination: Destination = {\n  name: "Patagonia",\n  altitude: 3405,\n};\n\nconsole.log("Hola desde Self Code ✦");\nconsole.table(destination);\n\nconst peaks = [2850, 3405, 3128];\nconsole.log("Cumbre más alta:", Math.max(...peaks), "m");\n\nawait new Promise(resolve => setTimeout(resolve, 250));\nconsole.log("Listo para explorar.");\n');
    await fs.writeFile(path.join(root, 'projects', 'patagonia', 'main.ts'), 'import { sum } from "../helpers";\n\nconsole.log("Patagonia", sum(20, 22));\n');
    await fs.writeFile(path.join(root, 'projects', 'helpers.ts'), 'export function sum(a: number, b: number): number {\n  return a + b;\n}\n');
  }
  registerIPC();
  const makeWindow = () => {
    allowClose = false;
    window = new BrowserWindow({ width: 1440, height: 940, minWidth: 960, minHeight: 640, title: 'Self Code', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 19 }, backgroundColor: '#121416', webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    if (process.env.SELF_CODE_DEV_URL === 'http://127.0.0.1:5173') window.loadURL(process.env.SELF_CODE_DEV_URL);
    else window.loadFile(path.join(here, '..', 'dist', 'index.html'));
    window.on('close', event => { if (!allowClose) { event.preventDefault(); window.webContents.send('menu:command', 'close'); } });
    window.on('closed', () => { finish(); window = null; });
  };
  const command = id => window?.webContents.send('menu:command', id);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Archivo', submenu: [{ label: 'Nuevo archivo', accelerator: 'CmdOrCtrl+N', click: () => command('new') }, { label: 'Nueva carpeta', accelerator: 'CmdOrCtrl+Shift+N', click: () => command('folder') }, { label: 'Guardar', accelerator: 'CmdOrCtrl+S', click: () => command('save') }, { type: 'separator' }, { label: 'Cambiar workspace…', click: () => command('workspace') }, { role: 'close' }] },
    { role: 'editMenu' },
    { label: 'Ejecutar', submenu: [{ label: 'Play', accelerator: 'CmdOrCtrl+Enter', click: () => command('run') }, { label: 'Detener', accelerator: 'CmdOrCtrl+.', click: () => command('stop') }] },
    { role: 'viewMenu' },
  ]));
  makeWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) makeWindow(); });
}).catch(error => { dialog.showErrorBox('Self Code', error.message); app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { quitting = true; finish(); });
