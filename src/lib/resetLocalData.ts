export type LocalDataReset = {
  databases: string[];
  caches: string[];
  serviceWorkers: number;
  keys: number;
};

const KNOWN_DATABASES = ["mania-editor"];

function clearWebStorage(): number {
  let cleared = 0;
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      const store = (globalThis as Partial<Record<typeof name, Storage>>)[name];
      if (!store) continue;
      cleared += store.length;
      store.clear();
    } catch {
    }
  }
  return cleared;
}

export async function listLocalDatabases(): Promise<string[]> {
  const names = new Set(KNOWN_DATABASES);
  try {
    const listed = (await indexedDB.databases?.()) ?? [];
    for (const row of listed) if (row.name) names.add(row.name);
  } catch {
  }
  return [...names];
}

function deleteDatabase(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.deleteDatabase(name);
    } catch {
      resolve(false);
      return;
    }
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(true);
  });
}

async function clearCaches(): Promise<string[]> {
  try {
    if (typeof caches === "undefined") return [];
    const names = await caches.keys();
    const removed: string[] = [];
    for (const name of names) {
      if (await caches.delete(name)) removed.push(name);
    }
    return removed;
  } catch {
    return [];
  }
}

async function unregisterServiceWorkers(): Promise<number> {
  try {
    const registrations =
      (await navigator.serviceWorker?.getRegistrations()) ?? [];
    let count = 0;
    for (const registration of registrations) {
      if (await registration.unregister()) count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}

export async function eraseLocalData(): Promise<LocalDataReset> {
  const keys = clearWebStorage();
  const names = await listLocalDatabases();
  const databases: string[] = [];
  for (const name of names) {
    if (await deleteDatabase(name)) databases.push(name);
  }
  const [cacheNames, serviceWorkers] = await Promise.all([
    clearCaches(),
    unregisterServiceWorkers(),
  ]);
  return { databases, caches: cacheNames, serviceWorkers, keys };
}
