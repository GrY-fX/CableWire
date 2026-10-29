/** Positioned, framework-free description of what to draw. Units are millimetres. */
export type SceneNode =
  | { kind: 'group'; transform?: string; classes?: string[]; children: SceneNode[] }
  | { kind: 'path'; d: string; filled?: boolean; classes?: string[]; screenOnly?: boolean }
  | { kind: 'circle'; cx: number; cy: number; r: number; filled?: boolean; classes?: string[] }
  | {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      anchor: 'start' | 'middle' | 'end';
      /** Clockwise rotation in degrees around (x, y). */
      angle?: number;
      classes?: string[];
    };

/** Drawing order, bottom to top. */
export type Layer = 'frame' | 'wires' | 'elements' | 'junctions';
export const LAYERS: readonly Layer[] = ['frame', 'wires', 'elements', 'junctions'];

/** A top-level drawable with a stable key (`frame`, `element:<id>`, `wire:<id>`, `junction:<id>`). */
export interface SceneItem {
  key: string;
  layer: Layer;
  node: SceneNode;
}

export interface Scene {
  width: number;
  height: number;
  items: SceneItem[];
}
