/**
 * Mapping events that happen outside the document (an export, a new map
 * being started), for the mapping-time tracker to count. Whoever does the
 * thing announces it; the tracker listens while it runs.
 */

export type MappingEvent = "export" | "map_created";

const listeners = new Set<(event: MappingEvent) => void>();

export function noteMappingEvent(event: MappingEvent): void {
  for (const listener of listeners) listener(event);
}

export function onMappingEvent(listener: (event: MappingEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
