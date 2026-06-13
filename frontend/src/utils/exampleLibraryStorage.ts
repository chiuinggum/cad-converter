import {
  DEFAULT_EXAMPLE_FOLDERS,
  DRAWING_EXAMPLES,
  ExampleFolder,
} from "../data/examples";

export interface ExampleLibraryState {
  folderOrder: string[];
  folders: ExampleFolder[];
  expandedFolderIds: string[];
  pathOverrides: Record<string, string>;
}

const STORAGE_KEY = "wondercad_example_library";

function defaultState(): ExampleLibraryState {
  return {
    folderOrder: DEFAULT_EXAMPLE_FOLDERS.map((f) => f.id),
    folders: DEFAULT_EXAMPLE_FOLDERS.map((f) => ({ ...f, childIds: [...f.childIds] })),
    expandedFolderIds: [DEFAULT_EXAMPLE_FOLDERS[0]?.id ?? "folder_example"],
    pathOverrides: {},
  };
}

export function loadExampleLibrary(): ExampleLibraryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as ExampleLibraryState;
    const knownIds = new Set(DRAWING_EXAMPLES.map((e) => e.id));
    const folders = (parsed.folders ?? []).map((folder) => ({
      ...folder,
      childIds: (folder.childIds ?? []).filter((id) => knownIds.has(id)),
    }));
    const defaultFolder = defaultState();
    const mergedFolders =
      folders.length > 0
        ? folders
        : defaultFolder.folders;
    const folderOrder =
      parsed.folderOrder?.length > 0
        ? parsed.folderOrder.filter((id) =>
            mergedFolders.some((f) => f.id === id)
          )
        : mergedFolders.map((f) => f.id);
    for (const f of mergedFolders) {
      if (!folderOrder.includes(f.id)) folderOrder.push(f.id);
    }
    for (const ex of DRAWING_EXAMPLES) {
      const inAny = mergedFolders.some((f) => f.childIds.includes(ex.id));
      if (!inAny && mergedFolders[0]) {
        mergedFolders[0].childIds.push(ex.id);
      }
    }
    return {
      folderOrder,
      folders: mergedFolders,
      expandedFolderIds: parsed.expandedFolderIds ?? defaultFolder.expandedFolderIds,
      pathOverrides: parsed.pathOverrides ?? {},
    };
  } catch {
    return defaultState();
  }
}

export function saveExampleLibrary(state: ExampleLibraryState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
