import type { ProjectDoc } from '@cablewire/core';
import { parseProject, serializeProject } from '@cablewire/formats';
import type { ParseResult } from '@cablewire/formats';

const DB = 'cablewire-projects';
const STORE = 'projects';
const CURRENT = 'current';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Keeps the open project in IndexedDB as `.cwp` text, so it goes through the same
 * safe reading (format, version, schema, integrity) as a file opened from disk.
 */
export class ProjectAutosave {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: ProjectDoc | undefined;

  private constructor(private readonly db: IDBDatabase) {}

  static open(name = DB): Promise<ProjectAutosave> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(new ProjectAutosave(req.result));
      req.onerror = () => reject(req.error);
    });
  }

  /** The saved project, if any. */
  async load(): Promise<ParseResult<ProjectDoc> | undefined> {
    const tx = this.db.transaction(STORE, 'readonly');
    const text = (await request(tx.objectStore(STORE).get(CURRENT))) as string | undefined;
    return text === undefined ? undefined : parseProject(text);
  }

  async save(doc: ProjectDoc): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    await request(tx.objectStore(STORE).put(serializeProject(doc), CURRENT));
  }

  /** Saves `delay` ms after the last change (changes in between are merged). */
  schedule(doc: ProjectDoc, delay = 1000): void {
    this.pending = doc;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  /** Writes a scheduled save right away (e.g. before the page closes). */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    const doc = this.pending;
    this.pending = undefined;
    if (doc) await this.save(doc);
  }

  close(): void {
    this.db.close();
  }
}
