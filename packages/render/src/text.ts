/** Replaces `{field}` placeholders with info values; unknown fields become empty. */
export function fillPlaceholders(text: string, info: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, field: string) => info[field] ?? '');
}

// Lives in core (text bounds need it too); re-exported for existing users.
export { readableText } from '@cablewire/core';
