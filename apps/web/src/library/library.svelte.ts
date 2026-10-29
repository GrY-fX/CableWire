import type { SymbolDef, SymbolId } from '@cablewire/core';
import { loadBaseSymbols } from './base.ts';
import type { LibraryItem } from './logic.ts';
import { requestPersistentStorage, SymbolStorage } from './storage.ts';

/**
 * Library state shared by the Schema and Simboli tabs: base set plus the personal
 * symbols and favourites stored in IndexedDB.
 */
export class Library {
  readonly base: SymbolDef[] = loadBaseSymbols();
  // Sets here are never mutated, only replaced as a whole, so plain Sets are enough.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  readonly baseIds: ReadonlySet<SymbolId> = new Set(this.base.map((s) => s.id));
  // Raw state: symbols are compared by reference and handed to editors unproxied.
  personal = $state.raw<SymbolDef[]>([]);
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  favorites = $state.raw<ReadonlySet<SymbolId>>(new Set());
  /** Set when IndexedDB cannot be used (e.g. private browsing). */
  error = $state('');
  private storage: SymbolStorage | undefined;

  readonly items: LibraryItem[] = $derived([
    ...this.personal.map((symbol) => ({
      symbol,
      source: 'personal' as const,
      favorite: this.favorites.has(symbol.id),
    })),
    ...this.base.map((symbol) => ({
      symbol,
      source: 'base' as const,
      favorite: this.favorites.has(symbol.id),
    })),
  ]);

  async open(): Promise<void> {
    try {
      this.storage = await SymbolStorage.open();
      await this.refresh();
    } catch {
      this.error =
        'Archivio del browser non disponibile (navigazione privata?): i simboli non verranno salvati.';
    }
  }

  get available(): boolean {
    return !!this.storage;
  }

  find(id: SymbolId): LibraryItem | undefined {
    return this.items.find((i) => i.symbol.id === id);
  }

  async put(symbol: SymbolDef): Promise<void> {
    if (!this.storage) return;
    if (this.personal.length === 0) void requestPersistentStorage();
    await this.storage.put(symbol);
    await this.refresh();
  }

  async remove(id: SymbolId): Promise<void> {
    await this.storage?.remove(id);
    await this.refresh();
  }

  async setFavorite(id: SymbolId, favorite: boolean): Promise<void> {
    await this.storage?.setFavorite(id, favorite);
    await this.refresh();
  }

  close(): void {
    this.storage?.close();
  }

  private async refresh(): Promise<void> {
    if (!this.storage) return;
    this.personal = (await this.storage.list()).map((e) => e.symbol);
    this.favorites = await this.storage.favorites();
  }
}
