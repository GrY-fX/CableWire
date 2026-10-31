// File System Access API (Chrome, Edge) with a fallback to <input type=file> and
// downloads elsewhere. Only the parts of the API we use are typed here.

interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}
interface PermissionCapable {
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
}
type FileHandle = FileSystemFileHandle & PermissionCapable;
interface PickerWindow {
  showOpenFilePicker?(o: { types: PickerType[]; multiple?: boolean }): Promise<FileHandle[]>;
  showSaveFilePicker?(o: { types: PickerType[]; suggestedName: string }): Promise<FileHandle>;
}

export type { FileHandle };

export const PROJECT_TYPES: PickerType[] = [
  { description: 'Progetto CableWire', accept: { 'application/json': ['.cwp'] } },
];

const picker = () => window as unknown as PickerWindow;

/** True where files can be written in place (Save overwrites the opened file). */
export function canWriteInPlace(): boolean {
  return typeof picker().showSaveFilePicker === 'function';
}

export interface OpenedFile {
  name: string;
  text: string;
  handle?: FileHandle;
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/** Lets the user choose a file; undefined if cancelled. */
export async function pickFile(
  types: PickerType[] = PROJECT_TYPES,
): Promise<OpenedFile | undefined> {
  const open = picker().showOpenFilePicker;
  if (open) {
    try {
      const [handle] = await open.call(window, { types });
      if (!handle) return undefined;
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (e) {
      if (isAbort(e)) return undefined;
      throw e;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = Object.values(types[0]?.accept ?? {})
      .flat()
      .join(',');
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, text: await file.text() } : undefined);
    };
    input.oncancel = () => resolve(undefined);
    input.click();
  });
}

/** Reads a remembered file, asking the browser for permission again if needed. */
export async function readHandle(handle: FileHandle): Promise<OpenedFile | undefined> {
  if (!(await ensurePermission(handle))) return undefined;
  const file = await handle.getFile();
  return { name: file.name, text: await file.text(), handle };
}

async function ensurePermission(handle: FileHandle): Promise<boolean> {
  const mode = { mode: 'readwrite' } as const;
  if ((await handle.queryPermission?.(mode)) === 'granted') return true;
  return (await handle.requestPermission?.(mode)) === 'granted';
}

/** Overwrites a file chosen earlier. Returns false if permission was refused. */
export async function writeHandle(handle: FileHandle, text: string): Promise<boolean> {
  if (!(await ensurePermission(handle))) return false;
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  return true;
}

/**
 * Asks where to save (or downloads where that is not possible). Returns the new
 * handle, `null` for a plain download, undefined if cancelled.
 */
export async function saveAs(
  suggestedName: string,
  text: string,
  types: PickerType[] = PROJECT_TYPES,
): Promise<FileHandle | null | undefined> {
  const save = picker().showSaveFilePicker;
  if (!save) {
    download(suggestedName, new Blob([text], { type: 'application/json' }));
    return null;
  }
  try {
    const handle = await save.call(window, { types, suggestedName });
    await writeHandle(handle, text);
    return handle;
  } catch (e) {
    if (isAbort(e)) return undefined;
    throw e;
  }
}

export function download(name: string, blob: Blob): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
