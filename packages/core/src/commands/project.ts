import { defineCommand, ok } from '../command.ts';
import type { ProjectMeta, ProjectSettings } from '../model.ts';
import { meta } from '../ops.ts';

export const updateProjectMeta = defineCommand<{ set: Partial<ProjectMeta> }>(
  'Modifica dati progetto',
  (doc, { set }) => ok([meta({ meta: { ...doc.meta, ...set } })]),
);

/** Changes settings; a setting set to `undefined` is removed (back to its default). */
export const updateSettings = defineCommand<{
  set: { [K in keyof ProjectSettings]?: ProjectSettings[K] | undefined };
}>('Modifica impostazioni', (doc, { set }) => {
  const settings: Record<string, unknown> = { ...doc.settings };
  for (const [key, value] of Object.entries(set)) {
    if (value === undefined) delete settings[key];
    else settings[key] = value;
  }
  return ok([meta({ settings: settings as unknown as ProjectSettings })]);
});
