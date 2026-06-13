import { ChatMessage } from "../components/ChatPanel";
import { PipelineIteration } from "../types";
import { CadParam } from "./cadParams";
import { DrawingSpecData } from "../components/DrawingSpecPanel";

export interface ExampleWorkspace {
  exampleId: string;
  procadSessionId: string | null;
  chatHistory: ChatMessage[];
  promptText: string;
  examplePreviewUrl: string | null;
  glbUrl: string | null;
  stlUrl: string | null;
  stepUrl: string | null;
  pyUrl: string | null;
  cadCode: string | null;
  cadParams: CadParam[];
  drawingSpec: DrawingSpecData | null;
  iterations: PipelineIteration[];
  activeIterationIndex: number;
}

export interface WorkspaceHistoryEntry {
  id: string;
  savedAt: string;
  label: string;
  workspace: ExampleWorkspace;
}

const STORAGE_KEY = "wondercad_example_workspaces";
const HISTORY_KEY = "wondercad_workspace_history";
const MAX_HISTORY_PER_EXAMPLE = 12;

function workspaceHasContent(ws: ExampleWorkspace): boolean {
  return Boolean(
    ws.glbUrl ||
      ws.cadCode ||
      ws.drawingSpec ||
      (ws.iterations && ws.iterations.length > 0) ||
      (ws.chatHistory && ws.chatHistory.length > 1)
  );
}

export function loadAllWorkspaces(): Record<string, ExampleWorkspace> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ExampleWorkspace>;
  } catch {
    return {};
  }
}

export function saveWorkspace(workspace: ExampleWorkspace) {
  const all = loadAllWorkspaces();
  all[workspace.exampleId] = workspace;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getWorkspace(exampleId: string): ExampleWorkspace | null {
  return loadAllWorkspaces()[exampleId] ?? null;
}

function loadAllHistory(): Record<string, WorkspaceHistoryEntry[]> {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, WorkspaceHistoryEntry[]>;
  } catch {
    return {};
  }
}

function saveAllHistory(all: Record<string, WorkspaceHistoryEntry[]>) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
}

export function loadWorkspaceHistory(exampleId: string): WorkspaceHistoryEntry[] {
  return loadAllHistory()[exampleId] ?? [];
}

export function archiveWorkspaceHistory(exampleId: string, workspace: ExampleWorkspace) {
  if (!workspaceHasContent(workspace)) return;

  const label =
    workspace.promptText?.trim().slice(0, 56) ||
    (workspace.glbUrl ? "Generated model" : "Previous session");

  const entry: WorkspaceHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    label,
    workspace: { ...workspace, exampleId },
  };

  const all = loadAllHistory();
  const prev = all[exampleId] ?? [];
  const deduped = prev.filter(
    (e) =>
      e.workspace.procadSessionId !== workspace.procadSessionId ||
      e.savedAt !== entry.savedAt
  );
  all[exampleId] = [entry, ...deduped].slice(0, MAX_HISTORY_PER_EXAMPLE);
  saveAllHistory(all);
}

export function countWorkspacesWithResults(fileIds: Iterable<string>): number {
  const workspaces = loadAllWorkspaces();
  let count = 0;
  for (const id of fileIds) {
    if (workspaces[id]?.glbUrl) count += 1;
  }
  return count;
}
