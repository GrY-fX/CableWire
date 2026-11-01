/** A UUID string tagged with the kind of object it identifies. */
export type Id<K extends string> = string & { readonly __kind: K };

export type SheetId = Id<'sheet'>;
export type SymbolId = Id<'symbol'>;
export type ElementId = Id<'element'>;
export type WireId = Id<'wire'>;
export type JunctionId = Id<'junction'>;
export type TextId = Id<'text'>;
/** Terminal ids are unique only within their symbol. */
export type TerminalId = Id<'terminal'>;

// Available in browsers and Node >= 19; declared here because core has no DOM or Node typings.
declare const crypto: { randomUUID(): string };

export function newId<K extends string>(): Id<K> {
  return crypto.randomUUID() as Id<K>;
}
