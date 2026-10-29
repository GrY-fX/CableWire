/** Upgrades raw JSON of version `from` to version `from + 1`. */
export interface Migration {
  from: number;
  migrate(json: Record<string, unknown>): Record<string, unknown>;
}

export const PROJECT_FORMAT_VERSION = 1;

/** Project migrations, in order. Empty while only version 1 exists. */
export const projectMigrations: readonly Migration[] = [];

/** Applies the migrations chain from `version` up to `target`. */
export function migrate(
  json: Record<string, unknown>,
  version: number,
  target: number,
  migrations: readonly Migration[],
): Record<string, unknown> {
  let current = json;
  for (let v = version; v < target; v++) {
    const step = migrations.find((m) => m.from === v);
    if (!step) throw new Error(`Missing migration from format version ${v}`);
    current = { ...step.migrate(current), formatVersion: v + 1 };
  }
  return current;
}
