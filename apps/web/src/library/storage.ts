import type { SymbolDef, SymbolId } from '@cablewire/core';

/** A personal symbol as stored in the browser. */
export interface StoredSymbol {
  id: SymbolId;
  symbol: SymbolDef;
  updatedAt: string;
}

const DB_VERSION = 1;
const SYMBOLS = 'symbols';
const FAVORITES = 'favorites';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Personal symbol library in IndexedDB: symbols and favourites (favourites may
 * also point to base symbols, which are not stored here).
 */
export class SymbolStorage {
  private constructor(private readonly db: IDBDatabase) {}

  static open(name = 'cablewire'): Promise<SymbolStorage> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SYMBOLS))
          db.createObjectStore(SYMBOLS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(FAVORITES)) db.createObjectStore(FAVORITES);
      };
      req.onsuccess = () => resolve(new SymbolStorage(req.result));
      req.onerror = () => reject(req.error);
    });
  }

  private store(name: string, mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(name, mode).objectStore(name);
  }

  list(): Promise<StoredSymbol[]> {
    return request(this.store(SYMBOLS, 'readonly').getAll() as IDBRequest<StoredSymbol[]>);
  }

  get(id: SymbolId): Promise<StoredSymbol | undefined> {
    return request(this.store(SYMBOLS, 'readonly').get(id) as IDBRequest<StoredSymbol | undefined>);
  }

  async put(symbol: SymbolDef, now = new Date().toISOString()): Promise<StoredSymbol> {
    const entry: StoredSymbol = { id: symbol.id, symbol, updatedAt: now };
    await request(this.store(SYMBOLS, 'readwrite').put(entry));
    return entry;
  }

  async remove(id: SymbolId): Promise<void> {
    await request(this.store(SYMBOLS, 'readwrite').delete(id));
    await this.setFavorite(id, false);
  }

  async favorites(): Promise<Set<SymbolId>> {
    const keys = await request(this.store(FAVORITES, 'readonly').getAllKeys());
    return new Set(keys as SymbolId[]);
  }

  async setFavorite(id: SymbolId, favorite: boolean): Promise<void> {
    const store = this.store(FAVORITES, 'readwrite');
    if (favorite) await request(store.put(true, id));
    else await request(store.delete(id));
  }

  close(): void {
    this.db.close();
  }
}

/** Asks the browser not to evict our data under storage pressure (best effort). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
