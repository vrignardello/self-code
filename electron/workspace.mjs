import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class Workspace {
  constructor(root) { this.root = path.resolve(root); }

  async resolve(relative = '') {
    if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').includes('..') || relative.includes('\0')) {
      throw new Error('Ruta fuera del workspace.');
    }
    const parts = relative.split('/').filter(Boolean);
    const absolute = path.join(this.root, ...parts);
    // Refuse symlinks at every existing component, including the root.
    const rootStat = await fs.lstat(this.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('El workspace debe ser una carpeta real.');
    let cursor = this.root;
    for (const part of parts) {
      cursor = path.join(cursor, part);
      try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error('No se admiten enlaces simbólicos.'); }
      catch (error) { if (error.code === 'ENOENT') break; throw error; }
    }
    return absolute;
  }

  validateName(name, kind) {
    if (typeof name !== 'string' || !name.trim() || name !== name.trim() || /[\\/\0<>:"|?*]/.test(name) || name === '.' || name === '..' || name.startsWith('.')) throw new Error('Usa un nombre válido, sin rutas ni puntos iniciales.');
    if (name.length > 100) throw new Error('El nombre es demasiado largo.');
    if (kind === 'file' && !/\.(js|ts)$/.test(name)) throw new Error('El archivo debe terminar en .js o .ts.');
  }

  async list() {
    const visit = async (relative, depth) => {
      const rows = await fs.readdir(await this.resolve(relative), { withFileTypes: true });
      const result = [];
      for (const row of rows) {
        if (row.name.startsWith('.') || row.name === 'node_modules' || row.isSymbolicLink()) continue;
        const rel = relative ? `${relative}/${row.name}` : row.name;
        if (row.isDirectory() && depth < 2) result.push({ path: rel, name: row.name, kind: 'folder', children: await visit(rel, depth + 1) });
        else if (row.isFile() && /\.(js|ts)$/.test(row.name)) result.push({ path: rel, name: row.name, kind: 'file' });
      }
      return result.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1));
    };
    return visit('', 0);
  }

  async read(relative) {
    const absolute = await this.resolve(relative);
    if (!/\.(js|ts)$/.test(relative)) throw new Error('Formato de archivo no permitido.');
    const stat = await fs.stat(absolute);
    if (!stat.isFile() || stat.size > 2_000_000) throw new Error('El archivo debe ser menor a 2 MB.');
    return fs.readFile(absolute, 'utf8');
  }

  async create(parent, name, kind) {
    if (!['file', 'folder'].includes(kind)) throw new Error('Tipo inválido.');
    this.validateName(name, kind);
    const parentAbsolute = await this.resolve(parent);
    if (!(await fs.stat(parentAbsolute)).isDirectory()) throw new Error('El destino debe ser una carpeta.');
    const depth = parent.split('/').filter(Boolean).length;
    if (depth > 2 || (kind === 'folder' && depth >= 2)) throw new Error('Máximo dos niveles de carpetas.');
    const relative = parent ? `${parent}/${name}` : name;
    const absolute = await this.resolve(relative);
    if (kind === 'folder') await fs.mkdir(absolute);
    else await fs.writeFile(absolute, '', { flag: 'wx' });
    return relative;
  }

  async write(relative, content) {
    if (typeof content !== 'string' || Buffer.byteLength(content) > 2_000_000) throw new Error('El código supera el límite de 2 MB.');
    if (!/\.(js|ts)$/.test(relative)) throw new Error('Formato de archivo no permitido.');
    if (relative.split('/').length > 3) throw new Error('Máximo dos niveles de carpetas.');
    const absolute = await this.resolve(relative);
    if (!(await fs.stat(absolute)).isFile()) throw new Error('El archivo no existe.');
    const temporary = path.join(path.dirname(absolute), `.self-code-${randomUUID()}.tmp`);
    try { await fs.writeFile(temporary, content, { flag: 'wx' }); await fs.rename(temporary, absolute); }
    finally { await fs.rm(temporary, { force: true }); }
  }

  async move(relative, parent, name) {
    if (!relative) throw new Error('No se puede mover la raíz.');
    const source = await this.resolve(relative);
    const stat = await fs.stat(source);
    const kind = stat.isDirectory() ? 'folder' : 'file';
    this.validateName(name, kind);
    const destination = parent ? `${parent}/${name}` : name;
    if (destination === relative) return destination;
    if (parent === relative || parent.startsWith(`${relative}/`)) throw new Error('Una carpeta no puede contenerse a sí misma.');
    const parentAbsolute = await this.resolve(parent);
    if (!(await fs.stat(parentAbsolute)).isDirectory()) throw new Error('El destino debe ser una carpeta.');
    const nestedDepth = async dir => {
      let maximum = 0;
      for (const item of await fs.readdir(dir, { withFileTypes: true })) {
        if (item.isSymbolicLink()) throw new Error('No se admiten enlaces simbólicos.');
        if (item.isDirectory()) maximum = Math.max(maximum, 1 + await nestedDepth(path.join(dir, item.name)));
      }
      return maximum;
    };
    const depth = parent.split('/').filter(Boolean).length;
    if (depth > 2 || (kind === 'folder' && depth + 1 + await nestedDepth(source) > 2)) throw new Error('El movimiento supera los dos niveles de carpetas.');
    const target = await this.resolve(destination);
    try { await fs.lstat(target); throw new Error('Ya existe un elemento con ese nombre.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rename(source, target);
    return destination;
  }
}
