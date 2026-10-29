import type { Rotation } from '@cablewire/core';

/** Replaces `{field}` placeholders with info values; unknown fields become empty. */
export function fillPlaceholders(text: string, info: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, field: string) => info[field] ?? '');
}

type Anchor = 'start' | 'middle' | 'end';

/**
 * Keeps texts of a rotated/mirrored element readable from the bottom or the right
 * (ISO convention): the text turns at most 90° and swaps its anchor instead of
 * being drawn upside down or mirrored.
 */
export function readableText(
  rotation: Rotation,
  mirrored: boolean,
  anchor: Anchor,
): { angle: 0 | 90; anchor: Anchor } {
  const flipped = rotation >= 180 !== mirrored;
  const swapped: Anchor = anchor === 'start' ? 'end' : anchor === 'end' ? 'start' : 'middle';
  return { angle: (rotation % 180) as 0 | 90, anchor: flipped ? swapped : anchor };
}
