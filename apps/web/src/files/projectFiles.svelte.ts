import { createEmptyProject, updateProjectMeta } from '@cablewire/core';
import type { ProjectDoc, Store } from '@cablewire/core';
import { parseProject, serializeProject } from '@cablewire/formats';
import { nowIso, safeFileName } from './export.ts';
import { canWriteInPlace, pickFile, readHandle, saveAs, writeHandle } from './fileAccess.ts';
import type { FileHandle, OpenedFile } from './fileAccess.ts';
import { addRecent, getCurrentFile, listRecent, removeRecent, setCurrentFile } from './recent.ts';
import type { RecentFile } from './recent.ts';
import { loadSheetFormat } from '../schema/sheetFormat.ts';

export type Notify = (kind: 'info' | 'error', lines: string[]) => void;

const APP = 'CableWire';

/**
 * The project file on disk: open, save, save as, recent files, and whether the
 * project has changed since it was last opened or saved.
 */
export class ProjectFiles {
  /** File the project belongs to (name only for downloads, no handle). */
  file = $state.raw<{ name: string; handle?: FileHandle } | undefined>();
  /** Document as last opened or saved to disk (compared by reference). */
  saved = $state.raw<ProjectDoc | undefined>();
  recent = $state.raw<RecentFile[]>([]);
  readonly writeInPlace = canWriteInPlace();

  constructor(
    private readonly store: Store,
    private readonly notify: Notify,
  ) {
    this.saved = store.doc;
  }

  /** True if the project differs from what was last opened or saved on disk. */
  dirty(doc: ProjectDoc): boolean {
    return doc !== this.saved;
  }

  /** After the browser autosave restored a project: find its file again, if any. */
  async restore(): Promise<void> {
    const current = await getCurrentFile().catch(() => undefined);
    if (current) {
      this.file = { name: current.name, ...(current.handle && { handle: current.handle }) };
      const same = serializeProject(this.store.doc, { app: APP }) === current.savedText;
      this.saved = same ? this.store.doc : undefined;
    } else {
      this.saved = this.store.doc;
    }
    await this.refreshRecent();
  }

  newProject(): void {
    this.store.reset(createEmptyProject('Nuovo progetto', undefined, loadSheetFormat()));
    this.file = undefined;
    this.saved = this.store.doc;
    void setCurrentFile(undefined);
  }

  async open(): Promise<void> {
    const picked = await this.guard(() => pickFile());
    if (picked) await this.load(picked);
  }

  async openRecent(recent: RecentFile): Promise<void> {
    const opened = await this.guard(() => readHandle(recent.handle));
    if (opened) await this.load(opened);
    else if (opened === undefined) {
      this.notify('error', [
        `Impossibile riaprire «${recent.name}»: permesso negato o file spostato.`,
      ]);
      await removeRecent(recent.name).catch(() => {});
      await this.refreshRecent();
    }
  }

  /** Writes the open file, or asks where to save if there is none to overwrite. */
  async save(): Promise<void> {
    const handle = this.file?.handle;
    if (!handle) return this.saveAs();
    const text = this.stampAndSerialize();
    if (await this.guard(() => writeHandle(handle, text))) {
      await this.markSaved(handle.name, handle, text);
      this.notify('info', [`Salvato «${handle.name}».`]);
    }
  }

  async saveAs(): Promise<void> {
    const text = this.stampAndSerialize();
    const name = this.file?.name ?? safeFileName(this.store.doc.meta.title, '.cwp');
    const result = await this.guard(() => saveAs(name, text));
    if (result === undefined) return; // cancelled or failed
    if (result === null) {
      await this.markSaved(name, undefined, text);
      this.notify('info', [`Scaricato «${name}»: tienilo dove preferisci e riaprilo con «Apri…».`]);
    } else {
      await this.markSaved(result.name, result, text);
      this.notify('info', [`Salvato «${result.name}».`]);
    }
  }

  private async load(opened: OpenedFile): Promise<void> {
    const parsed = parseProject(opened.text);
    if (!parsed.ok) {
      this.notify('error', [
        `«${opened.name}» non si può aprire.`,
        parsed.error.message,
        ...parsed.error.details,
      ]);
      return;
    }
    this.store.reset(parsed.value);
    this.file = { name: opened.name, ...(opened.handle && { handle: opened.handle }) };
    this.saved = this.store.doc;
    await setCurrentFile({
      name: opened.name,
      savedText: opened.text,
      ...(opened.handle && { handle: opened.handle }),
    });
    if (opened.handle)
      await addRecent({ name: opened.name, handle: opened.handle }).catch(() => {});
    await this.refreshRecent();
    this.notify('info', [`Aperto «${opened.name}».`, ...parsed.warnings]);
  }

  /** The save date is bookkeeping, not an edit: no undo entry. */
  private stampAndSerialize(): string {
    this.store.runUnrecorded(updateProjectMeta, { set: { updatedAt: nowIso() } });
    return serializeProject(this.store.doc, { app: APP });
  }

  private async markSaved(
    name: string,
    handle: FileHandle | undefined,
    text: string,
  ): Promise<void> {
    this.file = { name, ...(handle && { handle }) };
    this.saved = this.store.doc;
    await setCurrentFile({ name, savedText: text, ...(handle && { handle }) });
    if (handle) await addRecent({ name, handle }).catch(() => {});
    await this.refreshRecent();
  }

  private async refreshRecent(): Promise<void> {
    if (this.writeInPlace) this.recent = await listRecent().catch(() => []);
  }

  /** Runs a file operation, turning unexpected errors into a notice. */
  private async guard<T>(op: () => Promise<T>): Promise<T | undefined> {
    try {
      return await op();
    } catch (e) {
      this.notify('error', [
        'Operazione sul file non riuscita.',
        String((e as Error).message ?? e),
      ]);
      return undefined;
    }
  }
}
