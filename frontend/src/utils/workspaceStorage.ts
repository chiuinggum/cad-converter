import { ChatMessage } from "../components/ChatPanel";
import { PipelineIteration } from "../types";
import { CadParam } from "./cadParams";

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
  iterations: PipelineIteration[];
  activeIterationIndex: number;
}

const STORAGE_KEY = "wondercad_example_workspaces";

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
