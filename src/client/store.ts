/** Minimal immutable snapshot store used by the standalone client bundle. */
export interface SnapshotStore<T> {
  /** Read the current immutable snapshot. */
  getSnapshot: () => T
  /** Subscribe to snapshot replacements. */
  subscribe: (listener: () => void) => () => void
  /** Replace the current snapshot. */
  set: (next: T) => void
  /** Produce and publish a shallow-cloned snapshot. */
  update: (mutate: (draft: T) => void) => void
}

/** Create a small React `useSyncExternalStore`-compatible store. */
export function createSnapshotStore<T extends object>(initial: T): SnapshotStore<T> {
  let snapshot = initial
  const listeners = new Set<() => void>()
  const publish = (next: T): void => {
    snapshot = next
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: publish,
    update(mutate) {
      const next = { ...snapshot }
      mutate(next)
      publish(next)
    },
  }
}
