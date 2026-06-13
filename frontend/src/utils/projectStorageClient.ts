export type ProjectStorageName = "workspaces" | "workspace-history" | "example-library";

const STORAGE_DEFAULTS: Record<ProjectStorageName, unknown> = {
  workspaces: {},
  "workspace-history": {},
  "example-library": null,
};

const LEGACY_LOCAL_KEYS: Record<ProjectStorageName, string> = {
  workspaces: "wondercad_example_workspaces",
  "workspace-history": "wondercad_workspace_history",
  "example-library": "wondercad_example_library",
};

const cache: Partial<Record<ProjectStorageName, unknown>> = {};
const saveTimers: Partial<Record<ProjectStorageName, ReturnType<typeof setTimeout>>> = {};
let initialized = false;
let initPromise: Promise<void> | null = null;

function clearLegacyLocalStorage() {
  for (const key of Object.values(LEGACY_LOCAL_KEYS)) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore quota errors while clearing
    }
  }
}

export function isProjectStorageReady(): boolean {
  return initialized;
}

export async function initProjectStorage(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    for (const name of Object.keys(STORAGE_DEFAULTS) as ProjectStorageName[]) {
      try {
        const resp = await fetch(`/api/storage/${name}`);
        if (resp.ok) {
          cache[name] = await resp.json();
        } else {
          cache[name] = STORAGE_DEFAULTS[name];
        }
      } catch {
        cache[name] = STORAGE_DEFAULTS[name];
      }
    }
    clearLegacyLocalStorage();
    initialized = true;
  })();

  return initPromise;
}

export function readProjectStorage<T>(name: ProjectStorageName, fallback: T): T {
  if (!initialized) {
    return fallback;
  }
  const value = cache[name];
  return (value === undefined || value === null ? fallback : value) as T;
}

export function writeProjectStorage(name: ProjectStorageName, value: unknown) {
  cache[name] = value;
  if (!initialized) return;

  const existing = saveTimers[name];
  if (existing) clearTimeout(existing);

  saveTimers[name] = setTimeout(() => {
    void flushProjectStorage(name);
  }, 300);
}

async function flushProjectStorage(name: ProjectStorageName) {
  const payload = cache[name] ?? STORAGE_DEFAULTS[name];
  try {
    const resp = await fetch(`/api/storage/${name}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      console.error(`Failed to persist ${name}: HTTP ${resp.status}`);
    }
  } catch (err) {
    console.error(`Failed to persist ${name}:`, err);
  }
}

export async function uploadImportImage(
  entryId: string,
  mimeType: string,
  dataUrl: string
): Promise<string> {
  const resp = await fetch("/api/storage/imports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: entryId, mimeType, dataUrl }),
  });
  if (!resp.ok) {
    throw new Error(`Import upload failed: HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as { filename: string };
  return data.filename;
}

export async function clearProjectStorageOnServer(): Promise<void> {
  await fetch("/api/storage/clear", { method: "POST" });
  for (const name of Object.keys(STORAGE_DEFAULTS) as ProjectStorageName[]) {
    cache[name] = STORAGE_DEFAULTS[name];
  }
  clearLegacyLocalStorage();
}
