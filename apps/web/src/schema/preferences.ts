// Small editor preferences remembered in this browser. Storage may be unavailable
// (private windows): reads fall back to the default and writes are skipped.

const AUTO_CONNECT = 'cablewire.autoConnect';

/** Automatic connections of aligned terminals; on unless turned off. */
export function loadAutoConnect(): boolean {
  try {
    return localStorage.getItem(AUTO_CONNECT) !== 'off';
  } catch {
    return true;
  }
}

export function saveAutoConnect(on: boolean): void {
  try {
    localStorage.setItem(AUTO_CONNECT, on ? 'on' : 'off');
  } catch {
    // Not remembered: the next session starts with it on.
  }
}

const OPEN_SECTIONS = 'cablewire.openSections';
const DEFAULT_OPEN = ['Dati del progetto'];

/** Sections of the Progetto tab left open; only the first one by default. */
export function loadOpenSections(): Set<string> {
  try {
    const saved = localStorage.getItem(OPEN_SECTIONS);
    const names: unknown = saved ? JSON.parse(saved) : DEFAULT_OPEN;
    return new Set(Array.isArray(names) ? names.filter((n) => typeof n === 'string') : []);
  } catch {
    return new Set(DEFAULT_OPEN);
  }
}

export function saveOpenSections(names: ReadonlySet<string>): void {
  try {
    localStorage.setItem(OPEN_SECTIONS, JSON.stringify([...names]));
  } catch {
    // Not remembered: the next session opens the default ones.
  }
}
