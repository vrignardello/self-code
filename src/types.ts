export interface Entry { path: string; name: string; kind: 'file' | 'folder'; children?: Entry[] }
export interface Session { open?: string[]; active?: string; expanded?: string[]; theme?: string; fontSize?: number }
export interface WorkspaceState { root: string; tree: Entry[]; session: Session }
export interface ExecutionEvent { runId: string; file: string; type: string; text?: string; reason?: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface Bridge {
  init(): Promise<Result<WorkspaceState>>;
  tree(): Promise<Result<Entry[]>>;
  read(file: string): Promise<Result<string>>;
  write(file: string, content: string): Promise<Result<void>>;
  create(parent: string, name: string, kind: string): Promise<Result<string>>;
  move(file: string, parent: string, name: string): Promise<Result<string>>;
  trash(file: string): Promise<Result<void>>;
  chooseWorkspace(): Promise<Result<WorkspaceState | null>>;
  saveSession(session: Session): Promise<Result<void>>;
  run(file: string, runId: string): Promise<Result<string>>;
  stop(): Promise<Result<void>>;
  closeReady(): Promise<Result<void>>;
  onExecution(callback: (event: ExecutionEvent) => void): () => void;
  onCommand(callback: (command: string) => void): () => void;
}
declare global { interface Window { selfCode: Bridge; MonacoEnvironment: { getWorker(moduleId: string, label: string): Worker } } }
