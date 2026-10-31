import type { FileHandle } from './fileAccess.ts';

// Recently opened project files (Chrome/Edge only: file handles can be stored in
// IndexedDB and reopened later after asking permission again).

export interface RecentFile {
  name: string;
  handle: FileHandle;
  openedAt: string;
}

const DB = 'cablewire-files';
const STORE = 'recent';
const STATE = 'state';
export const MAX_RECENT = 8;

/** The file the open project belongs to, kept across reloads. */
export interface CurrentFile {
  name: string;
  handle?: FileHandle;
  /** Text written to (or read from) disk last, to tell whether the project changed since. */
  savedText: string;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function open(name = DB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'name' });
      if (!db.objectStoreNames.contains(STATE)) db.createObjectStore(STATE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Most recent first. */
export async function listRecent(dbName?: string): Promise<RecentFile[]> {
  const db = await open(dbName);
  try {
    const all = (await request(db.transaction(STORE).objectStore(STORE).getAll())) as RecentFile[];
    return all.sort((a, b) => b.openedAt.localeCompare(a.openedAt)).slice(0, MAX_RECENT);
  } finally {
    db.close();
  }
}

/** Remembers a file (by name), dropping the oldest beyond MAX_RECENT. */
export async function addRecent(
  file: Omit<RecentFile, 'openedAt'>,
  dbName?: string,
  now = new Date().toISOString(),
): Promise<void> {
  const db = await open(dbName);
  try {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    await request(store.put({ ...file, openedAt: now }));
    const all = (await request(store.getAll())) as RecentFile[];
    const old = all.sort((a, b) => b.openedAt.localeCompare(a.openedAt)).slice(MAX_RECENT);
    for (const r of old) await request(store.delete(r.name));
  } finally {
    db.close();
  }
}

export async function removeRecent(name: string, dbName?: string): Promise<void> {
  const db = await open(dbName);
  try {
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(name));
  } finally {
    db.close();
  }
}

export async function getCurrentFile(dbName?: string): Promise<CurrentFile | undefined> {
  const db = await open(dbName);
  try {
    return (await request(db.transaction(STATE).objectStore(STATE).get('current'))) as
      CurrentFile | undefined;
  } finally {
    db.close();
  }
}

/** Remembers the current file; undefined forgets it (new project). */
export async function setCurrentFile(
  file: CurrentFile | undefined,
  dbName?: string,
): Promise<void> {
  const db = await open(dbName);
  try {
    const store = db.transaction(STATE, 'readwrite').objectStore(STATE);
    if (file) await request(store.put(file, 'current'));
    else await request(store.delete('current'));
  } finally {
    db.close();
  }
}
