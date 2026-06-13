import { ChatMessage } from "../components/ChatPanel";
import { PipelineIteration } from "../types";
import { CadParam } from "./cadParams";
import { DrawingSpecData } from "../components/DrawingSpecPanel";
import {
  readProjectStorage,
  writeProjectStorage,
} from "./projectStorageClient";

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

const MAX_HISTORY_PER_EXAMPLE = 8;

function stripChatHistory(messages: ChatMessage[] | undefined): ChatMessage[] {
  return (messages ?? []).map(({ image: _image, ...rest }) => rest);
}

export function stripWorkspaceForStorage(workspace: ExampleWorkspace): ExampleWorkspace {
  return {
    ...workspace,
    examplePreviewUrl: null,
    chatHistory: stripChatHistory(workspace.chatHistory),
  };
}

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
  return readProjectStorage<Record<string, ExampleWorkspace>>("workspaces", {});
}

export function saveWorkspace(workspace: ExampleWorkspace) {
  const all = loadAllWorkspaces();
  all[workspace.exampleId] = stripWorkspaceForStorage(workspace);
  writeProjectStorage("workspaces", all);
}

export function getWorkspace(exampleId: string): ExampleWorkspace | null {
  return loadAllWorkspaces()[exampleId] ?? null;
}

function loadAllHistory(): Record<string, WorkspaceHistoryEntry[]> {
  return readProjectStorage<Record<string, WorkspaceHistoryEntry[]>>(
    "workspace-history",
    {}
  );
}

function saveAllHistory(all: Record<string, WorkspaceHistoryEntry[]>) {
  writeProjectStorage("workspace-history", all);
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
    workspace: stripWorkspaceForStorage({ ...workspace, exampleId }),
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
