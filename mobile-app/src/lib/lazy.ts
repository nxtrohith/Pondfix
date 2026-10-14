// A record whose values are computed when they are read, so constant tables of translated text (labels, status words) follow the active
// language instead of being frozen in whatever language was active when the module loaded.
export function lazyRecord<K extends string, V>(keys: readonly K[], get: (key: K) => V): Record<K, V> {
  const record = {} as Record<K, V>;
  for (const key of keys) Object.defineProperty(record, key, { enumerable: true, get: () => get(key) });
  return record;
}
