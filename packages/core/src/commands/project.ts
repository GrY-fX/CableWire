import { defineCommand, ok } from '../command.ts';
import type { ProjectMeta, ProjectSettings } from '../model.ts';
import { meta } from '../ops.ts';

export const updateProjectMeta = defineCommand<{ set: Partial<ProjectMeta> }>(
  'Modifica dati progetto',
  (doc, { set }) => ok([meta({ meta: { ...doc.meta, ...set } })]),
);

export const updateSettings = defineCommand<{ set: Partial<ProjectSettings> }>(
  'Modifica impostazioni',
  (doc, { set }) => ok([meta({ settings: { ...doc.settings, ...set } })]),
);
