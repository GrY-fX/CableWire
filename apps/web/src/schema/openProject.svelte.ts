import type { DeviceField } from '@cablewire/core';

/**
 * A little of the open project shared with the symbol editor: its device properties,
 * offered there as placeholders for symbol texts.
 */
export const openProject = $state<{ deviceFields: DeviceField[] }>({ deviceFields: [] });
