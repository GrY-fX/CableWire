/**
 * Undo/redo by snapshots of an immutable value. A gesture (e.g. a drag) updates the
 * value many times but records a single entry when committed.
 */
export class SnapshotHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private current: T;
  private gestureStart: T | undefined;

  constructor(
    initial: T,
    private readonly max = 200,
  ) {
    this.current = initial;
  }

  get value(): T {
    return this.current;
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  get inGesture(): boolean {
    return this.gestureStart !== undefined;
  }

  /** Records a change as one undo entry (or updates the open gesture). */
  set(next: T): void {
    if (next === this.current) return;
    if (this.gestureStart !== undefined) {
      this.current = next;
      return;
    }
    this.record(this.current);
    this.current = next;
  }

  begin(): void {
    this.gestureStart ??= this.current;
  }

  /** Ends the gesture; records an entry only if the value changed. */
  commit(): void {
    const start = this.gestureStart;
    this.gestureStart = undefined;
    if (start !== undefined && start !== this.current) this.record(start);
  }

  /** Ends the gesture restoring the value it started from. */
  cancel(): void {
    if (this.gestureStart !== undefined) this.current = this.gestureStart;
    this.gestureStart = undefined;
  }

  undo(): boolean {
    this.commit();
    const previous = this.past.pop();
    if (previous === undefined) return false;
    this.future.push(this.current);
    this.current = previous;
    return true;
  }

  redo(): boolean {
    this.commit();
    const next = this.future.pop();
    if (next === undefined) return false;
    this.past.push(this.current);
    this.current = next;
    return true;
  }

  /** Replaces the current value without recording an entry (e.g. after saving). */
  replace(value: T): void {
    this.current = value;
  }

  /** Starts over with a new value and an empty history. */
  reset(value: T): void {
    this.past = [];
    this.future = [];
    this.gestureStart = undefined;
    this.current = value;
  }

  private record(previous: T): void {
    this.past.push(previous);
    if (this.past.length > this.max) this.past.shift();
    this.future = [];
  }
}
