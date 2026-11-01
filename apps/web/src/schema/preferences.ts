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
