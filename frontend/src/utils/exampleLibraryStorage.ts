import {
  CustomDrawingEntry,
  DEFAULT_EXAMPLE_FOLDERS,
  DRAWING_EXAMPLES,
  ExampleFolder,
  FOLDER_OTHER_EXAMPLES_ID,
  FOLDER_TIER_EXAMPLES_ID,
  folderIdForExample,
  IMPORTED_FOLDER_ID,
} from "../data/examples";

export interface ExampleLibraryState {
  folderOrder: string[];
  folders: ExampleFolder[];
  expandedFolderIds: string[];
  pathOverrides: Record<string, string>;
  customEntries: CustomDrawingEntry[];
}

const STORAGE_KEY = "wondercad_example_library";

function defaultState(): ExampleLibraryState {
  return {
    folderOrder: DEFAULT_EXAMPLE_FOLDERS.map((f) => f.id),
    folders: DEFAULT_EXAMPLE_FOLDERS.map((f) => ({ ...f, childIds: [...f.childIds] })),
    expandedFolderIds: [
      IMPORTED_FOLDER_ID,
      FOLDER_TIER_EXAMPLES_ID,
      FOLDER_OTHER_EXAMPLES_ID,
    ],
    pathOverrides: {},
    customEntries: [],
  };
}

function ensureImportedFolder(state: ExampleLibraryState): ExampleLibraryState {
  const hasImported = state.folders.some((f) => f.id === IMPORTED_FOLDER_ID);
  if (hasImported) return state;
  const importedFolder: ExampleFolder = {
    id: IMPORTED_FOLDER_ID,
    name: "Imported",
    childIds: (state.customEntries ?? []).map((e) => e.id),
  };
  return {
    ...state,
    folders: [importedFolder, ...state.folders],
    folderOrder: [IMPORTED_FOLDER_ID, ...state.folderOrder.filter((id) => id !== IMPORTED_FOLDER_ID)],
  };
}

export function createCustomEntry(
  fileName: string,
  imageDataUrl: string,
  mimeType: string
): CustomDrawingEntry {
  const stem = fileName.replace(/\.[^.]+$/, "").trim() || "Imported drawing";
  return {
    id: `import_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: stem,
    partType: "Imported",
    inputDrawing: fileName,
    imageDataUrl,
    mimeType,
    createdAt: new Date().toISOString(),
    defaultPrompt: "",
  };
}

export function addCustomEntryToLibrary(
  library: ExampleLibraryState,
  entry: CustomDrawingEntry
): ExampleLibraryState {
  const customEntries = [...(library.customEntries ?? []), entry];
  let next = ensureImportedFolder({ ...library, customEntries });
  next = {
    ...next,
    folders: next.folders.map((folder) =>
      folder.id === IMPORTED_FOLDER_ID
        ? {
            ...folder,
            childIds: [entry.id, ...folder.childIds.filter((id) => id !== entry.id)],
          }
        : folder
    ),
    expandedFolderIds: next.expandedFolderIds.includes(IMPORTED_FOLDER_ID)
      ? next.expandedFolderIds
      : [...next.expandedFolderIds, IMPORTED_FOLDER_ID],
  };
  return next;
}

function migrateFolderLayout(folders: ExampleFolder[]): ExampleFolder[] {
  const byId = new Map(folders.map((f) => [f.id, { ...f, childIds: [...f.childIds] }]));
  const legacyOther = byId.get("folder_example");
  if (legacyOther) {
    byId.delete("folder_example");
    const existingOther = byId.get(FOLDER_OTHER_EXAMPLES_ID);
    if (existingOther) {
      existingOther.childIds = Array.from(
        new Set([...existingOther.childIds, ...legacyOther.childIds])
      );
    } else {
      byId.set(FOLDER_OTHER_EXAMPLES_ID, {
        ...legacyOther,
        id: FOLDER_OTHER_EXAMPLES_ID,
        name: "other_examples",
      });
    }
  }

  for (const def of DEFAULT_EXAMPLE_FOLDERS) {
    if (!byId.has(def.id)) {
      byId.set(def.id, { ...def, childIds: [...def.childIds] });
    } else {
      const folder = byId.get(def.id)!;
      folder.name = def.name;
    }
  }

  const tierIds = new Set(
    DRAWING_EXAMPLES.filter((e) => folderIdForExample(e.id) === FOLDER_TIER_EXAMPLES_ID).map(
      (e) => e.id
    )
  );
  const otherIds = new Set(
    DRAWING_EXAMPLES.filter((e) => folderIdForExample(e.id) === FOLDER_OTHER_EXAMPLES_ID).map(
      (e) => e.id
    )
  );

  for (const folder of byId.values()) {
    if (folder.id === FOLDER_TIER_EXAMPLES_ID) {
      folder.childIds = Array.from(new Set([...folder.childIds.filter((id) => tierIds.has(id)), ...tierIds]));
    } else if (folder.id === FOLDER_OTHER_EXAMPLES_ID) {
      folder.childIds = Array.from(
        new Set([...folder.childIds.filter((id) => otherIds.has(id)), ...otherIds])
      );
    } else if (folder.id !== IMPORTED_FOLDER_ID) {
      folder.childIds = folder.childIds.filter((id) => !tierIds.has(id) && !otherIds.has(id));
    }
  }

  return Array.from(byId.values());
}

function migrateFolderOrder(folderOrder: string[], folders: ExampleFolder[]): string[] {
  const order = folderOrder
    .map((id) => (id === "folder_example" ? FOLDER_OTHER_EXAMPLES_ID : id))
    .filter((id, idx, arr) => arr.indexOf(id) === idx);
  for (const folder of folders) {
    if (!order.includes(folder.id)) order.push(folder.id);
  }
  if (!order.includes(IMPORTED_FOLDER_ID)) order.unshift(IMPORTED_FOLDER_ID);
  const preferred = [IMPORTED_FOLDER_ID, FOLDER_TIER_EXAMPLES_ID, FOLDER_OTHER_EXAMPLES_ID];
  return [
    ...preferred.filter((id) => order.includes(id)),
    ...order.filter((id) => !preferred.includes(id)),
  ];
}

export function loadExampleLibrary(): ExampleLibraryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as ExampleLibraryState;
    const customEntries = parsed.customEntries ?? [];
    const knownIds = new Set([
      ...DRAWING_EXAMPLES.map((e) => e.id),
      ...customEntries.map((e) => e.id),
    ]);
    const folders = (parsed.folders ?? []).map((folder) => ({
      ...folder,
      childIds: (folder.childIds ?? []).filter((id) => knownIds.has(id)),
    }));
    const defaultFolder = defaultState();
    let mergedFolders = folders.length > 0 ? folders : defaultFolder.folders;
    mergedFolders = ensureImportedFolder({
      ...defaultFolder,
      ...parsed,
      folders: mergedFolders,
      customEntries,
    }).folders;
    mergedFolders = migrateFolderLayout(mergedFolders);

    const folderOrder = migrateFolderOrder(
      parsed.folderOrder?.length > 0
        ? parsed.folderOrder
        : mergedFolders.map((f) => f.id),
      mergedFolders
    );

    for (const ex of DRAWING_EXAMPLES) {
      const inAny = mergedFolders.some((f) => f.childIds.includes(ex.id));
      if (!inAny) {
        const targetId = folderIdForExample(ex.id);
        const targetFolder = mergedFolders.find((f) => f.id === targetId);
        if (targetFolder) targetFolder.childIds.push(ex.id);
      }
    }

    for (const entry of customEntries) {
      const inAny = mergedFolders.some((f) => f.childIds.includes(entry.id));
      if (!inAny) {
        const importedFolder = mergedFolders.find((f) => f.id === IMPORTED_FOLDER_ID);
        if (importedFolder) importedFolder.childIds.unshift(entry.id);
      }
    }

    return {
      folderOrder,
      folders: mergedFolders,
      expandedFolderIds: parsed.expandedFolderIds ?? defaultFolder.expandedFolderIds,
      pathOverrides: parsed.pathOverrides ?? {},
      customEntries,
    };
  } catch {
    return defaultState();
  }
}

export function saveExampleLibrary(state: ExampleLibraryState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function collectLibraryFileIds(library: ExampleLibraryState): string[] {
  const ids = new Set<string>();
  for (const folder of library.folders) {
    for (const id of folder.childIds) ids.add(id);
  }
  return Array.from(ids);
}

export function countLibraryFolders(library: ExampleLibraryState): number {
  return library.folders.length;
}
