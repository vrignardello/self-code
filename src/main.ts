import * as monaco from 'monaco-editor/editor.js';
import 'monaco-editor/features/register.all.js';
import * as tsDefaults from 'monaco-editor/languages/features/typescript/register.js';
import 'monaco-editor/languages/definitions/typescript/register.js';
import 'monaco-editor/languages/definitions/javascript/register.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import TypeScriptWorker from 'monaco-editor/languages/features/typescript/ts.worker.js?worker';
import type { Entry, Session, WorkspaceState } from './types';
import './style.css';

window.MonacoEnvironment = { getWorker: (_id, label) => label === 'typescript' || label === 'javascript' ? new TypeScriptWorker() : new EditorWorker() };
const api = window.selfCode;
const icons: Record<string, string> = {
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15h18M15 3v12"/>',
  sidebar: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m6-14-4 5 4 5"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  files: '<rect x="7" y="7" width="13" height="15" rx="2"/><path d="M16 7V2H3v15h4"/>',
  folder: '<path d="M3 5h6l2 2h10v12H3z"/>',
  folderOpen: '<path d="M3 9V5h6l2 2h10v3M3 10h20l-4 10H2z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  filePlus: '<path d="M13 2H4v20h16V9zM13 2v7h7M8 15h8m-4-4v8"/>',
  folderPlus: '<path d="M3 5h6l2 2h10v13H3zM12 10v7m-3-3h6"/>',
  play: '<path d="m8 5 12 7-12 7z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4c-1-1 0-3 2-3h2c5 0 3-11-6-11Z"/><circle cx="7" cy="11" r=".7"/><circle cx="10" cy="7" r=".7"/><circle cx="15" cy="7" r=".7"/>',
  settings: '<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h4l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3z"/><circle cx="11" cy="12" r="3"/>',
  terminal: '<path d="m4 6 6 6-6 6m9 0h7"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 2v6h-6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  move: '<path d="M3 5h6l2 2h10v13H3zM8 14h9m-3-3 3 3-3 3"/>',
  pencil: '<path d="m4 16 12-12 4 4L8 20H4zM13 7l4 4"/>',
};
const icon = (name: string, className = '') => `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.code}</svg>`;
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const parentOf = (file: string) => file.split('/').slice(0, -1).join('/');
const nameOf = (file: string) => file.split('/').at(-1) ?? file;
const language = (file: string) => file.endsWith('.ts') ? 'typescript' : 'javascript';
const badge = (file: string) => `<span class="file-badge ${file.endsWith('.ts') ? 'ts' : 'js'}">${file.endsWith('.ts') ? 'TS' : 'JS'}</span>`;

document.querySelector('#app')!.innerHTML = `
  <header class="titlebar"><div class="traffic-space"></div><div class="brand">${icon('code')}<span>self<span class="brand-dot">.</span>code</span></div><button id="workspace-title" class="workspace-title" title="Cambiar workspace">${icon('folder')}<span>Mi workspace</span>${icon('chevron')}</button></header>
  <main class="shell">
    <nav class="activity-bar" aria-label="Herramientas"><button class="activity active" title="Ocultar explorador" aria-label="Ocultar explorador" aria-expanded="true" aria-controls="sidebar" id="explorer-focus">${icon('files')}</button><button class="activity" title="Buscar archivo · ⌘P" id="search-focus">${icon('search')}</button><div class="activity-spacer"></div><button class="activity" title="Temas" id="themes">${icon('palette')}</button><button class="activity" title="Preferencias" id="settings">${icon('settings')}</button><span class="avatar">S</span></nav>
    <aside class="sidebar" id="sidebar"><div class="sidebar-heading"><span>EXPLORADOR</span><div class="heading-actions"><button class="icon-button" id="collapse-sidebar" title="Ocultar explorador" aria-label="Ocultar explorador">${icon('sidebar')}</button><button class="icon-button" id="new-file" title="Nuevo archivo · ⌘N">${icon('filePlus')}</button><button class="icon-button" id="new-folder" title="Nueva carpeta · ⌘⇧N">${icon('folderPlus')}</button></div></div><label class="search-box">${icon('search')}<input id="search" placeholder="Buscar archivo…" aria-label="Buscar archivo"><kbd>⌘ P</kbd></label><div class="workspace-root selected" id="root-row" tabindex="0" role="button">${icon('chevron', 'down')}${icon('folderOpen')}<span id="root-name">WORKSPACE</span><span id="file-count"></span></div><div id="tree" class="file-tree" role="tree" aria-label="Archivos y carpetas"></div><div class="sidebar-footer"><button id="choose-workspace">Cambiar workspace ${icon('arrow')}</button></div></aside>
    <section class="workbench"><div class="tabs-bar"><div id="tabs" class="tabs" role="tablist" aria-label="Archivos abiertos"></div><button class="icon-button tab-add" id="tab-add" title="Nuevo archivo">${icon('plus')}</button></div><div class="editor-toolbar"><div id="breadcrumbs" class="breadcrumbs"></div><div class="run-actions"><div class="layout-control"><button id="layout-toggle" class="layout-button" aria-expanded="false" aria-controls="layout-menu">${icon('layout')} Layout</button><div id="layout-menu" class="layout-menu" hidden><button data-layout="bottom" aria-pressed="true">Consola abajo</button><button data-layout="right" aria-pressed="false">Consola a la derecha</button></div></div><button id="copy-file" class="icon-button" title="Copiar todo el archivo" aria-label="Copiar todo el archivo" disabled>${icon('copy')}</button><span id="save-state" class="save-state"></span><button id="stop" class="stop-button" title="Detener · ⌘." disabled>${icon('stop')}<span>Detener</span></button><button id="run" class="run-button" title="Ejecutar · ⌘Enter">${icon('play')}<span>Ejecutar</span><kbd>⌘ ↵</kbd></button></div></div><div class="editor-area"><div id="editor"></div><div id="empty" hidden><div class="empty-symbol">${icon('code')}</div><button id="empty-new" class="run-button">${icon('plus')} Crear archivo</button></div></div><div id="resize-console" class="resize-console" role="separator" aria-label="Cambiar altura de consola" aria-orientation="horizontal" tabindex="0"></div><section class="console-panel"><div class="console-toolbar"><div class="console-title">${icon('terminal')}<span>CONSOLA</span><span id="output-count" class="count-pill">0</span></div><div class="console-actions"><span id="execution-status"><span class="status-dot"></span>Listo</span><button class="icon-button" id="clear-console" title="Limpiar consola">${icon('trash')}</button></div></div><div id="output" class="output" role="log" aria-live="polite"></div><div id="console-empty" class="console-empty">${icon('terminal')}</div></section></section>
  </main><footer class="statusbar"><span class="connection">${icon('check')} Local</span><span id="status-message"></span><div class="status-right"><span id="cursor-position">Ln 1, Col 1</span><span>UTF-8</span><span id="language-label">TypeScript</span><button id="theme-status">● &nbsp; Carbon</button></div></footer>
  <dialog id="dialog"><form id="dialog-form"><div class="dialog-heading"><h2 id="dialog-title"></h2><button class="icon-button" type="button" id="dialog-close" aria-label="Cerrar">${icon('close')}</button></div><p id="dialog-description"></p><div id="dialog-fields"></div><p id="dialog-error" role="alert"></p><div class="dialog-actions"><button type="button" id="dialog-cancel" class="secondary-button">Cancelar</button><button type="submit" id="dialog-submit" class="run-button">Crear</button></div></form></dialog><div id="toast" role="status"></div><div id="context-menu" class="context-menu" hidden></div>`;

interface Document { path: string; model: monaco.editor.ITextModel; dirty: boolean; timer?: ReturnType<typeof setTimeout>; saving?: Promise<void> }
const documents = new Map<string, Document>();
let tree: Entry[] = [], root = '', opened: string[] = [], active = '', selectedFolder = '';
let expanded = new Set<string>(['projects', 'projects/patagonia']);
let theme = 'carbon', fontSize = 14, loading = false, running = false, runId = '', startedAt = 0, messages = 0;
let sessionTimer: ReturnType<typeof setTimeout>;
const themes = {
  carbon: { label: 'Carbon', description: 'Grafito, detalles en mandarina', background: '#151719', foreground: '#d5d8dc', accent: '#ecab75', selection: '#393d45', comment: '#717b87', keyword: '#c699e3', string: '#a3be8c', number: '#e5b580', base: 'vs-dark' },
  nord: { label: 'Nord', description: 'Un poco de calma del norte', background: '#242b38', foreground: '#d8dee9', accent: '#88c0d0', selection: '#3b4559', comment: '#78879d', keyword: '#81a1c1', string: '#a3be8c', number: '#b48ead', base: 'vs-dark' },
  paper: { label: 'Paper', description: 'Luz cálida, ideas claras', background: '#faf8f3', foreground: '#383b42', accent: '#ab693e', selection: '#e8e2d5', comment: '#929489', keyword: '#8561a8', string: '#5e7c49', number: '#ac6b39', base: 'vs' },
};
for (const [key, palette] of Object.entries(themes)) monaco.editor.defineTheme(key, { base: palette.base as 'vs' | 'vs-dark', inherit: true, rules: [{ token: 'comment', foreground: palette.comment.slice(1) }, { token: 'keyword', foreground: palette.keyword.slice(1) }, { token: 'string', foreground: palette.string.slice(1) }, { token: 'number', foreground: palette.number.slice(1) }], colors: { 'editor.background': palette.background, 'editor.foreground': palette.foreground, 'editorLineNumber.foreground': palette.comment, 'editorLineNumber.activeForeground': palette.accent, 'editor.selectionBackground': palette.selection, 'editor.lineHighlightBackground': palette.selection + '40', 'editorCursor.foreground': palette.accent, 'editorIndentGuide.background1': palette.selection + '70', 'editorWidget.background': palette.background, 'editorSuggestWidget.background': palette.background } });

for (const defaults of [tsDefaults.typescriptDefaults, tsDefaults.javascriptDefaults]) {
  defaults.setEagerModelSync(true);
  defaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
  defaults.setCompilerOptions({ target: tsDefaults.ScriptTarget.ESNext, module: tsDefaults.ModuleKind.ESNext, moduleResolution: tsDefaults.ModuleResolutionKind.NodeJs, moduleDetection: 3, allowJs: true, checkJs: false, strict: true, allowNonTsExtensions: true, allowImportingTsExtensions: true, noEmit: true, esModuleInterop: true });
  defaults.addExtraLib('declare module "node:*" { const value: any; export = value; }', 'file:///node-builtins.d.ts');
}

const editor = monaco.editor.create($('#editor'), { theme, fontSize, fontFamily: '"SFMono-Regular", Menlo, Monaco, Consolas, monospace', lineHeight: 25, padding: { top: 22, bottom: 30 }, automaticLayout: true, minimap: { enabled: false }, scrollBeyondLastLine: false, smoothScrolling: true, cursorBlinking: 'smooth', cursorSmoothCaretAnimation: 'on', renderLineHighlight: 'gutter', overviewRulerBorder: false, hideCursorInOverviewRuler: true, tabSize: 2, renderWhitespace: 'none', renderControlCharacters: false, unicodeHighlight: { nonBasicASCII: false, invisibleCharacters: false, ambiguousCharacters: false }, guides: { indentation: false, highlightActiveIndentation: false, bracketPairs: false }, wordWrap: 'on', bracketPairColorization: { enabled: true }, model: null });
editor.onDidChangeCursorPosition(event => { $('#cursor-position').textContent = `Ln ${event.position.lineNumber}, Col ${event.position.column}`; });
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void task(run));
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void task(flushAll));

async function unwrap<T>(promise: Promise<{ ok: true; value: T } | { ok: false; error: string }>): Promise<T> { const result = await promise; if (!result.ok) throw new Error(result.error); return result.value; }
function notify(message: string, error = false) { const toast = $('#toast'); toast.textContent = message; toast.className = `visible ${error ? 'error' : ''}`; setTimeout(() => toast.classList.remove('visible'), 4500); }
async function task(action: () => unknown | Promise<unknown>) { try { await action(); } catch (error) { notify(error instanceof Error ? error.message : String(error), true); } }
function flat(entries = tree): Entry[] { return entries.flatMap(entry => [entry, ...flat(entry.children ?? [])]); }
function session(): Session { return { open: opened, active, expanded: [...expanded], theme, fontSize }; }
function remember() { if (loading) return; clearTimeout(sessionTimer); sessionTimer = setTimeout(() => void task(() => unwrap(api.saveSession(session()))), 350); }
function applyTheme(value: string) { theme = value in themes ? value : 'carbon'; document.documentElement.dataset.theme = theme; monaco.editor.setTheme(theme); $('#theme-status').textContent = `●  ${themes[theme as keyof typeof themes].label}`; remember(); }
function updateSaveState() { const doc = documents.get(active); $('#save-state').innerHTML = doc?.dirty ? '<span class="dirty-dot"></span> Sin guardar' : `${icon('check')} Guardado`; $('#save-state').classList.toggle('unsaved', !!doc?.dirty); }
async function flush(doc: Document) {
  clearTimeout(doc.timer);
  const save = async () => {
    if (!doc.dirty || doc.model.isDisposed()) return;
    const version = doc.model.getVersionId(), value = doc.model.getValue();
    await unwrap(api.write(doc.path, value));
    if (doc.model.getVersionId() === version) doc.dirty = false;
    updateSaveState(); renderTabs();
  };
  doc.saving = (doc.saving ?? Promise.resolve()).catch(() => {}).then(save);
  await doc.saving;
}
async function flushAll() { await Promise.all([...documents.values()].map(flush)); }
async function loadDocuments() {
  await Promise.all(flat().filter(entry => entry.kind === 'file').map(async entry => {
    if (documents.has(entry.path)) return;
    const value = await unwrap(api.read(entry.path));
    const uri = monaco.Uri.from({ scheme: 'file', path: `/workspace/${entry.path}` });
    const model = monaco.editor.createModel(value, language(entry.path), uri);
    const doc: Document = { path: entry.path, model, dirty: false };
    model.onDidChangeContent(() => { doc.dirty = true; updateSaveState(); renderTabs(); clearTimeout(doc.timer); doc.timer = setTimeout(() => void task(() => flush(doc)), 650); });
    documents.set(entry.path, doc);
  }));
}
async function initialize(state: WorkspaceState) {
  loading = true;
  editor.setModel(null);
  for (const doc of documents.values()) { clearTimeout(doc.timer); doc.model.dispose(); }
  documents.clear(); tree = state.tree; root = state.root; selectedFolder = '';
  expanded = new Set(state.session.expanded ?? ['projects', 'projects/patagonia']);
  fontSize = Math.min(24, Math.max(11, Number(state.session.fontSize) || 14));
  applyTheme(state.session.theme ?? 'carbon'); editor.updateOptions({ fontSize });
  await loadDocuments();
  opened = (state.session.open ?? ['welcome.ts']).filter(file => documents.has(file));
  if (!opened.length && documents.size) opened = [documents.keys().next().value!];
  active = state.session.active && opened.includes(state.session.active) ? state.session.active : opened[0] ?? '';
  $('#root-name').textContent = nameOf(root).toUpperCase();
  $('#workspace-title span').textContent = nameOf(root);
  $('#workspace-title').title = root;
  loading = false; openFile(active); renderTree(); clearConsole(); remember();
}
function openFile(file: string) {
  active = file;
  if (file && !opened.includes(file)) opened.push(file);
  const doc = documents.get(file);
  editor.setModel(doc?.model ?? null);
  $('#empty').hidden = !!doc; $('#editor').hidden = !doc;
  $('#run').toggleAttribute('disabled', !doc);
  $('#copy-file').toggleAttribute('disabled', !doc);
  $('#language-label').textContent = doc ? language(file) === 'typescript' ? 'TypeScript' : 'JavaScript' : 'Sin archivo';
  $('#breadcrumbs').innerHTML = `${icon('folder')}<button data-parent="">workspace</button>${file ? file.split('/').map((part, index, parts) => `${icon('chevron')}${index === parts.length - 1 ? badge(file) + '<strong>' + escape(part) + '</strong>' : `<button data-parent="${escape(parts.slice(0, index + 1).join('/'))}">${escape(part)}</button>`}`).join('') : ''}`;
  if (doc) { selectedFolder = parentOf(file); editor.focus(); }
  renderTabs(); renderTree(); updateSaveState(); remember();
}
function renderTabs() {
  $('#tabs').innerHTML = opened.map(file => `<div class="tab ${file === active ? 'active' : ''}" role="tab" tabindex="0" aria-selected="${file === active}" data-file="${escape(file)}" title="${escape(file)}">${badge(file)}<span>${escape(nameOf(file))}</span>${documents.get(file)?.dirty ? '<i class="dirty-dot"></i>' : ''}<button data-close="${escape(file)}" aria-label="Cerrar ${escape(nameOf(file))}">${icon('close')}</button></div>`).join('');
}
async function closeTab(file: string) { const doc = documents.get(file); if (doc) await flush(doc); const index = opened.indexOf(file); opened = opened.filter(p => p !== file); if (active === file) openFile(opened[Math.max(0, index - 1)] ?? ''); else renderTabs(); remember(); }
function renderTree() {
  const query = $('#search') instanceof HTMLInputElement ? ($('#search') as HTMLInputElement).value.toLowerCase() : '';
  const matches = (entry: Entry): boolean => entry.path.toLowerCase().includes(query) || !!entry.children?.some(matches);
  const render = (entries: Entry[], depth = 0): string => entries.filter(matches).map(entry => {
    const folder = entry.kind === 'folder', isExpanded = expanded.has(entry.path) || !!query;
    return `<div class="tree-row ${folder ? 'folder-row' : 'file-row'} ${entry.path === active && !folder ? 'active' : ''} ${folder && entry.path === selectedFolder ? 'selected-folder' : ''}" role="treeitem" tabindex="0" draggable="true" ${folder ? `aria-expanded="${isExpanded}"` : ''} data-path="${escape(entry.path)}" data-kind="${entry.kind}" style="--depth:${depth}">${folder ? icon('chevron', isExpanded ? 'down' : '') + icon(isExpanded ? 'folderOpen' : 'folder') : badge(entry.path)}<span>${escape(entry.name)}</span><button class="tree-more" title="Acciones" aria-label="Acciones de ${escape(entry.name)}">···</button></div>${folder && isExpanded ? render(entry.children ?? [], depth + 1) : ''}`;
  }).join('');
  $('#tree').innerHTML = render(tree) || `<p class="tree-empty">${query ? 'No hay coincidencias.' : 'Sin archivos.'}</p>`;
  $('#root-row').classList.toggle('selected', selectedFolder === '');
  $('#file-count').textContent = String(flat().filter(entry => entry.kind === 'file').length);
  $('#new-folder').toggleAttribute('disabled', selectedFolder.split('/').filter(Boolean).length >= 2);
  $('#new-folder').title = selectedFolder.split('/').filter(Boolean).length >= 2 ? 'Máximo dos niveles de carpetas' : 'Nueva carpeta · ⌘⇧N';
}
async function refresh() { tree = await unwrap(api.tree()); await loadDocuments(); renderTree(); }

type ModalOptions = { title: string; description: string; fields?: string; submit: string; action: (data: FormData) => Promise<void> | void };
function modal(options: ModalOptions) {
  const dialog = $<HTMLDialogElement>('#dialog');
  if (dialog.open) dialog.close();
  $('#dialog-title').textContent = options.title; $('#dialog-description').textContent = options.description;
  $('#dialog-fields').innerHTML = options.fields ?? ''; $('#dialog-submit').textContent = options.submit; $('#dialog-error').textContent = '';
  const form = $<HTMLFormElement>('#dialog-form');
  form.onsubmit = async event => { event.preventDefault(); const button = $<HTMLButtonElement>('#dialog-submit'); button.disabled = true; try { await options.action(new FormData(form)); dialog.close(); } catch (error) { $('#dialog-error').textContent = error instanceof Error ? error.message : String(error); } finally { button.disabled = false; } };
  dialog.showModal(); setTimeout(() => { const input = dialog.querySelector<HTMLInputElement>('input'); input?.focus(); input?.select(); }, 20);
}
const folderOptions = (selected = '') => [{ path: '', name: '/ · Raíz' }, ...flat().filter(entry => entry.kind === 'folder').map(entry => ({ path: entry.path, name: `/${entry.path}` }))].map(folder => `<option value="${escape(folder.path)}" ${folder.path === selected ? 'selected' : ''}>${escape(folder.name)}</option>`).join('');
function create(kind: 'file' | 'folder') {
  const parent = selectedFolder;
  if (kind === 'folder' && parent.split('/').filter(Boolean).length >= 2) { notify('Esta carpeta ya está en el segundo nivel.', true); return; }
  modal({ title: kind === 'file' ? 'Nuevo archivo' : 'Nueva carpeta', description: `Se creará en /${parent}`, submit: 'Crear', fields: `<label>Nombre<input name="name" required maxlength="100" value="${kind === 'file' ? 'untitled.ts' : ''}" placeholder="${kind === 'file' ? 'experimento.ts' : 'mi-proyecto'}" autocomplete="off"></label>${kind === 'file' ? '<small>JavaScript (.js) o TypeScript (.ts)</small>' : '<small>Máximo dos niveles de carpetas.</small>'}`, action: async data => { const result = await unwrap(api.create(parent, String(data.get('name')), kind)); if (parent) expanded.add(parent); await refresh(); if (kind === 'file') openFile(result); else { expanded.add(result); selectedFolder = result; renderTree(); remember(); } } });
}
async function relocate(file: string, parent: string, name: string) {
  if (running) throw new Error('Detén la ejecución antes de mover archivos.');
  await flushAll();
  const target = await unwrap(api.move(file, parent, name));
  const remap = (value: string) => value === file ? target : value.startsWith(file + '/') ? target + value.slice(file.length) : value;
  const next: Session = { ...session(), open: opened.map(remap), active: remap(active), expanded: [...expanded].map(remap) };
  await initialize({ root, tree: await unwrap(api.tree()), session: next });
  notify('Ubicación actualizada.');
}
function rename(file: string) { modal({ title: 'Cambiar nombre', description: `/${file}`, submit: 'Guardar', fields: `<label>Nombre<input name="name" required value="${escape(nameOf(file))}" maxlength="100" autocomplete="off"></label>`, action: data => relocate(file, parentOf(file), String(data.get('name'))) }); }
function move(file: string) { modal({ title: 'Mover a una carpeta', description: `/${file}`, submit: 'Mover', fields: `<label>Destino<select name="parent">${folderOptions(parentOf(file))}</select></label><small>El límite de profundidad se verifica para todo el contenido.</small>`, action: data => relocate(file, String(data.get('parent')), nameOf(file)) }); }
function trash(file: string) {
  modal({ title: 'Mover a la papelera', description: `Se enviará /${file} y su contenido a la papelera del sistema.`, submit: 'Mover a la papelera', action: async () => {
    await flushAll(); await unwrap(api.trash(file));
    const affected = (value: string) => value === file || value.startsWith(file + '/');
    await initialize({ root, tree: await unwrap(api.tree()), session: { ...session(), open: opened.filter(p => !affected(p)), active: affected(active) ? '' : active, expanded: [...expanded].filter(p => !affected(p)) } });
    notify('Movido a la papelera.');
  } });
}
async function chooseWorkspace() { await flushAll(); clearTimeout(sessionTimer); await unwrap(api.saveSession(session())); const state = await unwrap(api.chooseWorkspace()); if (state) await initialize(state); }
function preferences() { modal({ title: 'Preferencias', description: '', submit: 'Aplicar', fields: `<label>Tema<div class="theme-cards">${Object.entries(themes).map(([id, item]) => `<label class="theme-card" style="--swatch:${item.background};--swatch-accent:${item.accent}"><input type="radio" name="theme" value="${id}" ${theme === id ? 'checked' : ''}><div class="theme-preview"><i></i><i></i><i></i></div><strong>${item.label}</strong></label>`).join('')}</div></label><label>Tamaño de fuente<select name="fontSize">${[12, 13, 14, 15, 16, 18, 20, 22, 24].map(size => `<option ${fontSize === size ? 'selected' : ''}>${size}</option>`).join('')}</select></label>`, action: data => { fontSize = Number(data.get('fontSize')); editor.updateOptions({ fontSize }); applyTheme(String(data.get('theme'))); } }); }
function contextMenu(file: string, x: number, y: number) {
  const menu = $('#context-menu');
  const folder = flat().find(entry => entry.path === file)?.kind === 'folder';
  const destination = folder ? file : parentOf(file);
  const depth = destination.split('/').filter(Boolean).length;
  menu.innerHTML = `<button data-action="new">${icon('filePlus')} Nuevo archivo</button>${depth < 2 ? `<button data-action="folder">${icon('folderPlus')} Nueva carpeta</button>` : ''}${file ? `<hr><button data-action="rename">${icon('pencil')} Cambiar nombre</button><button data-action="move">${icon('move')} Mover a…</button><hr><button data-action="trash" class="danger">${icon('trash')} Mover a la papelera</button>` : ''}`;
  selectedFolder = destination; renderTree();
  menu.hidden = false;
  menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - menu.offsetWidth))}px`;
  menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - menu.offsetHeight))}px`;
  menu.onclick = event => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]'); if (!button) return; menu.hidden = true; const action = button.dataset.action; if (action === 'new' || action === 'folder') { selectedFolder = destination; create(action === 'new' ? 'file' : 'folder'); } else if (action === 'rename') rename(file); else if (action === 'move') move(file); else if (action === 'trash') trash(file); };
}
async function copyFile() {
  const doc = documents.get(active);
  if (!doc) return;
  await navigator.clipboard.writeText(doc.model.getValue());
  notify('Archivo copiado.');
}

function clearConsole() { $('#output').innerHTML = ''; messages = 0; $('#output-count').textContent = '0'; $('#console-empty').hidden = false; }
function appendOutput(type: string, text: string) {
  if (type === 'clear') { clearConsole(); return; }
  $('#console-empty').hidden = true;
  const row = document.createElement('div'); row.className = `output-row ${['error', 'warn', 'info'].includes(type) ? type : 'log'}`;
  const mark = document.createElement('span'); mark.className = 'output-marker'; mark.textContent = type === 'error' ? '×' : type === 'warn' ? '!' : '›';
  const pre = document.createElement('pre'); pre.textContent = text;
  const time = document.createElement('span'); time.className = 'output-time'; time.textContent = `${((performance.now() - startedAt) / 1000).toFixed(2)}s`;
  row.append(mark, pre, time); $('#output').append(row); $('#output').scrollTop = $('#output').scrollHeight;
  $('#output-count').textContent = String(++messages);
}
function runState() { $('#stop').toggleAttribute('disabled', !running); $('#run span').textContent = running ? 'Reiniciar' : 'Ejecutar'; $('#run').classList.toggle('running', running); }
async function run() {
  if (!active) return;
  await flushAll();
  if (running) await unwrap(api.stop());
  clearConsole(); runId = crypto.randomUUID(); running = true; startedAt = performance.now(); runState();
  $('#execution-status').innerHTML = '<span class="status-dot pulse"></span>Ejecutando…';
  try { await unwrap(api.run(active, runId)); } catch (error) { running = false; runState(); $('#execution-status').textContent = 'No se pudo ejecutar'; throw error; }
}
if (api) {
  api.onExecution(event => {
    if (event.runId !== runId) return;
    if (event.type === 'finished') { running = false; runState(); const reasons: Record<string, string> = { completed: 'Completado', stopped: 'Detenido', timeout: 'Tiempo agotado', limit: 'Límite alcanzado', error: 'Con errores' }; $('#execution-status').innerHTML = `<span class="status-dot ${event.reason === 'error' ? 'failed' : ''}"></span>${reasons[event.reason ?? ''] ?? 'Finalizado'}<span class="execution-duration">${((performance.now() - startedAt) / 1000).toFixed(2)} s</span>`; return; }
    appendOutput(event.type, event.text ?? '');
  });
  api.onCommand(command => void task(async () => {
    if (command === 'new') create('file'); else if (command === 'folder') create('folder'); else if (command === 'run') await run(); else if (command === 'stop') await unwrap(api.stop()); else if (command === 'save') await flushAll(); else if (command === 'workspace') await chooseWorkspace(); else if (command === 'close') { await flushAll(); clearTimeout(sessionTimer); await unwrap(api.saveSession(session())); await unwrap(api.closeReady()); }
  }));
}

$('#new-file').onclick = $('#tab-add').onclick = $('#empty-new').onclick = () => create('file');
$('#new-folder').onclick = () => create('folder');
$('#run').onclick = () => void task(run); $('#stop').onclick = () => void task(() => unwrap(api.stop()));
$('#clear-console').onclick = clearConsole;
$('#copy-file').onclick = () => void task(copyFile);
$('#themes').onclick = $('#settings').onclick = $('#theme-status').onclick = preferences;
$('#choose-workspace').onclick = $('#workspace-title').onclick = () => void task(chooseWorkspace);
$('#search-focus').onclick = focusSearch;
$('#explorer-focus').onclick = () => setSidebar(!$('#sidebar').hidden);
$('#collapse-sidebar').onclick = () => setSidebar(true);
$('#root-row').onclick = () => { selectedFolder = ''; renderTree(); };
$('#root-row').onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectedFolder = ''; renderTree(); } };
$('#search').oninput = renderTree;
$('#search').onkeydown = event => { if (event.key === 'Enter') { const first = $('#tree').querySelector<HTMLElement>('[data-kind="file"]'); if (first) openFile(first.dataset.path!); } else if (event.key === 'Escape') { ($('#search') as HTMLInputElement).value = ''; renderTree(); editor.focus(); } };
$('#tree').onclick = event => {
  const target = event.target as HTMLElement, row = target.closest<HTMLElement>('[data-path]'); if (!row) return;
  const file = row.dataset.path!;
  if (target.closest('.tree-more')) { contextMenu(file, event.clientX, event.clientY); return; }
  if (row.dataset.kind === 'folder') { selectedFolder = file; if (expanded.has(file)) expanded.delete(file); else expanded.add(file); renderTree(); remember(); } else openFile(file);
};
$('#tree').onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); (event.target as HTMLElement).closest<HTMLElement>('[data-path]')?.click(); } };
$('#sidebar').oncontextmenu = event => {
  const target = event.target as HTMLElement;
  if (target.closest('input, button')) return;
  event.preventDefault();
  const row = target.closest<HTMLElement>('[data-path]');
  contextMenu(row?.dataset.path ?? '', event.clientX, event.clientY);
};
$('#tree').ondragstart = event => { const row = (event.target as HTMLElement).closest<HTMLElement>('[data-path]'); if (row) event.dataTransfer?.setData('text/plain', row.dataset.path!); };
for (const element of [$('#tree'), $('#root-row')]) {
  element.ondragover = event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; };
  element.ondrop = event => { event.preventDefault(); const source = event.dataTransfer?.getData('text/plain'); if (!source) return; const row = (event.target as HTMLElement).closest<HTMLElement>('[data-path]'); const parent = row ? row.dataset.kind === 'folder' ? row.dataset.path! : parentOf(row.dataset.path!) : ''; void task(() => relocate(source, parent, nameOf(source))); };
}
$('#tabs').onclick = event => { const target = event.target as HTMLElement; const close = target.closest<HTMLElement>('[data-close]'); if (close) void task(() => closeTab(close.dataset.close!)); else { const tab = target.closest<HTMLElement>('[data-file]'); if (tab) openFile(tab.dataset.file!); } };
$('#tabs').onkeydown = event => { const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-file]'); if (tab && event.key === 'Enter') openFile(tab.dataset.file!); };
$('#breadcrumbs').onclick = event => { const button = (event.target as HTMLElement).closest<HTMLElement>('[data-parent]'); if (button) { selectedFolder = button.dataset.parent!; expanded.add(selectedFolder); renderTree(); } };
$('#dialog-cancel').onclick = $('#dialog-close').onclick = () => $<HTMLDialogElement>('#dialog').close();
document.addEventListener('pointerdown', event => { if (!(event.target as HTMLElement).closest('#context-menu, .tree-more')) $('#context-menu').hidden = true; });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') $('#context-menu').hidden = true;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); focusSearch(); }
});
let consoleHeight = 240, consoleWidth = 360;
let consoleLayout: 'bottom' | 'right' = localStorage.getItem('console-layout') === 'right' ? 'right' : 'bottom';
function setSidebar(hidden: boolean) {
  $('#sidebar').hidden = hidden;
  const toggle = $('#explorer-focus');
  toggle.classList.toggle('active', !hidden);
  toggle.setAttribute('aria-expanded', String(!hidden));
  toggle.setAttribute('aria-label', hidden ? 'Mostrar explorador' : 'Ocultar explorador');
  toggle.title = hidden ? 'Mostrar explorador' : 'Ocultar explorador';
  localStorage.setItem('sidebar-hidden', String(hidden));
  if (hidden) toggle.focus();
}
function focusSearch() { setSidebar(false); const input = $<HTMLInputElement>('#search'); input.focus(); input.select(); }
function closeLayoutMenu() { $('#layout-menu').hidden = true; $('#layout-toggle').setAttribute('aria-expanded', 'false'); }
function applyLayout() {
  const right = consoleLayout === 'right';
  $('.workbench').classList.toggle('console-right', right);
  $('.workbench').style.setProperty('--console-height', `${consoleHeight}px`);
  $('.workbench').style.setProperty('--console-width', `${consoleWidth}px`);
  $('#resize-console').setAttribute('aria-orientation', right ? 'vertical' : 'horizontal');
  $('#resize-console').setAttribute('aria-label', right ? 'Cambiar ancho de consola' : 'Cambiar altura de consola');
  document.querySelectorAll<HTMLElement>('[data-layout]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.layout === consoleLayout)));
  localStorage.setItem('console-layout', consoleLayout);
}
$('#layout-toggle').onclick = () => {
  const menu = $('#layout-menu');
  menu.hidden = !menu.hidden;
  $('#layout-toggle').setAttribute('aria-expanded', String(!menu.hidden));
};
$('#layout-menu').onclick = event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-layout]');
  if (!button) return;
  consoleLayout = button.dataset.layout === 'right' ? 'right' : 'bottom';
  applyLayout(); closeLayoutMenu(); $('#layout-toggle').focus();
};
document.addEventListener('pointerdown', event => { if (!(event.target as HTMLElement).closest('.layout-control')) closeLayoutMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#layout-menu').hidden) { closeLayoutMenu(); $('#layout-toggle').focus(); } });
function resizeConsole(value: number) {
  if (consoleLayout === 'right') consoleWidth = Math.max(260, Math.min($('.workbench').clientWidth - 324, value));
  else consoleHeight = Math.max(120, Math.min($('.workbench').clientHeight - 217, value));
  applyLayout();
}
$('#resize-console').onpointerdown = event => {
  const right = consoleLayout === 'right', start = right ? event.clientX : event.clientY, initial = right ? consoleWidth : consoleHeight;
  const handle = $('#resize-console'); handle.setPointerCapture(event.pointerId);
  handle.onpointermove = move => resizeConsole(initial + start - (right ? move.clientX : move.clientY));
  const end = () => { handle.onpointermove = null; if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId); };
  handle.onpointerup = end; handle.onpointercancel = end;
};
$('#resize-console').onkeydown = event => {
  const right = consoleLayout === 'right', increase = right ? 'ArrowLeft' : 'ArrowUp', decrease = right ? 'ArrowRight' : 'ArrowDown';
  if (event.key === increase || event.key === decrease) { event.preventDefault(); resizeConsole((right ? consoleWidth : consoleHeight) + (event.key === increase ? 20 : -20)); }
};
window.addEventListener('resize', () => resizeConsole(consoleLayout === 'right' ? consoleWidth : consoleHeight));
setSidebar(localStorage.getItem('sidebar-hidden') === 'true');
applyLayout();
if (api) void task(async () => initialize(await unwrap(api.init())));
else { $('#empty').hidden = false; $('#editor').hidden = true; $('#status-message').textContent = 'Abre la aplicación con npm run dev para acceder al workspace.'; notify('El workspace está disponible en la aplicación Electron.', true); }
