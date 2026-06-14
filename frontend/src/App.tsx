import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { DrawingExplorer } from "./components/DrawingExplorer";
import { CADViewer } from "./components/CADViewer";
import { GLBViewer } from "./components/GLBViewer";
import { MultiModelViewport, ModelPreviewSlot } from "./components/MultiModelViewport";
import { LoopConsole } from "./components/LoopConsole";
import { ChatPanel, ChatMessage } from "./components/ChatPanel";
import { SpecManifest, PipelineIteration, ComparisonResult } from "./types";
import { consumeProcadStream, ProcadStreamEvent } from "./utils/procadStream";
import { DRAWING_EXAMPLES, resolveExample, resolveLibraryExamples, effectiveGeneratePrompt } from "./data/examples";
import { SpecPanel } from "./components/SpecPanel";
import { DrawingSpecPanel, DrawingSpecData } from "./components/DrawingSpecPanel";
import { DashboardLibrary, BatchProgress } from "./components/DashboardLibrary";
import { DashboardStats } from "./components/DashboardStats";
import { DashboardWorkbench } from "./components/DashboardWorkbench";
import { RunsView, RunRow } from "./components/RunsView";
import { extractCadParams, applyCadParamValue } from "./utils/cadParams";
import { mimeFromAssetPath } from "./utils/exampleAssets";
import {
  loadExampleLibrary,
  saveExampleLibrary,
  ExampleLibraryState,
  addCustomEntryToLibrary,
  createCustomEntry,
  collectLibraryFileIds,
  countLibraryFolders,
} from "./utils/exampleLibraryStorage";
import {
  loadPipelineMethod,
  savePipelineMethod,
  pipelineStepsForMethod,
  PIPELINE_METHOD_LABELS,
  PIPELINE_METHOD_ORDER,
  V4_SETTINGS_INFO,
  PipelineMethod,
} from "./utils/pipelineSettings";
import {
  getWorkspace,
  saveWorkspace as persistWorkspace,
  loadWorkspaceHistory,
  archiveWorkspaceHistory,
  WorkspaceHistoryEntry,
  countWorkspacesWithResults,
  loadAllWorkspaces,
} from "./utils/workspaceStorage";
import { WonderCADLogo } from "./components/WonderCADLogo";
import { ResizeHandle } from "./components/ResizeHandle";
import { useResizeWidth } from "./hooks/useResize";
import { 
  CheckCircle2, Search, ChevronDown, SlidersHorizontal, 
  ChevronLeft, Maximize2, Settings, Laptop, Play,
  LayoutDashboard, Activity, Info, Boxes, FolderOpen, ListChecks
} from "lucide-react";

export default function App() {
  const [activeView, setActiveView] = useState<"dashboard" | "reconstruct" | "runs" | "settings">("dashboard");
  
  const [selectedExampleId, setSelectedExampleId] = useState<string>(DRAWING_EXAMPLES[0].id);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [partTypeFilter, setPartTypeFilter] = useState<string>("All");
  const [exampleLibrary, setExampleLibrary] = useState<ExampleLibraryState>(() =>
    loadExampleLibrary()
  );
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [pipelineMethod, setPipelineMethod] = useState<PipelineMethod>(() =>
    loadPipelineMethod()
  );

  const [activeExampleId, setActiveExampleId] = useState<string>(DRAWING_EXAMPLES[0].id);
  const [examplePreviewUrl, setExamplePreviewUrl] = useState<string | null>(null);
  const [isPerceiving, setIsPerceiving] = useState<boolean>(false);
  const [isPipelineRunning, setIsPipelineRunning] = useState<boolean>(false);
  const [isChatResponding, setIsChatResponding] = useState<boolean>(false);

  // Specifications, Iterations & Chat logs
  const [spec, setSpec] = useState<SpecManifest | null>(null);
  const [iterations, setIterations] = useState<PipelineIteration[]>([]);
  const [activeIterationIndex, setActiveIterationIndex] = useState<number>(0);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  // Pro-CAD session (real CadQuery → GLB pipeline)
  const [procadSessionId, setProcadSessionId] = useState<string | null>(null);
  const [promptText, setPromptText] = useState<string>("");
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [stlUrl, setStlUrl] = useState<string | null>(null);
  const [stepUrl, setStepUrl] = useState<string | null>(null);
  const [pyUrl, setPyUrl] = useState<string | null>(null);
  const [pipelineActiveStep, setPipelineActiveStep] = useState<number | null>(null);
  const [pipelineStatusLabel, setPipelineStatusLabel] = useState<string>("");
  const [cadCode, setCadCode] = useState<string | null>(null);
  const [cadParams, setCadParams] = useState<ReturnType<typeof extractCadParams>>([]);
  const [drawingSpec, setDrawingSpec] = useState<DrawingSpecData | null>(null);
  const [isReexecuting, setIsReexecuting] = useState(false);
  const [modelPreviews, setModelPreviews] = useState<ModelPreviewSlot[]>([]);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [workspaceHistory, setWorkspaceHistory] = useState<WorkspaceHistoryEntry[]>(() =>
    loadWorkspaceHistory(DRAWING_EXAMPLES[0].id)
  );
  const [workspaceTick, setWorkspaceTick] = useState(0);

  const resolvedExamples = useMemo(
    () =>
      resolveLibraryExamples(
        exampleLibrary.pathOverrides,
        exampleLibrary.customEntries ?? []
      ),
    [exampleLibrary.pathOverrides, exampleLibrary.customEntries]
  );

  const dashboardStats = useMemo(() => {
    const fileIds = collectLibraryFileIds(exampleLibrary);
    const totalFiles = fileIds.length;
    const folderCount = countLibraryFolders(exampleLibrary);
    const withResults = countWorkspacesWithResults(fileIds);
    const importedIds = new Set((exampleLibrary.customEntries ?? []).map((e) => e.id));
    const importedCount = fileIds.filter((id) => importedIds.has(id)).length;
    return { totalFiles, folderCount, withResults, importedCount };
  }, [exampleLibrary, workspaceTick]);

  // Runs view rows, derived from real stored workspaces (no fabricated metrics).
  const runsData: RunRow[] = useMemo(() => {
    const all = loadAllWorkspaces();
    return resolvedExamples.map((ex) => {
      const ws = all[ex.id];
      const iters = ws?.iterations ?? [];
      const latest = [...iters]
        .reverse()
        .find((it) => it.comparison && it.comparison.length);
      const comp = latest?.comparison ?? [];
      const dimsPass = comp.filter((c) => c.ok).length;
      const accuracy = comp.length
        ? Math.round((dimsPass / comp.length) * 100)
        : null;
      const status: RunRow["status"] = ws?.glbUrl
        ? "success"
        : iters.length
          ? "failed"
          : "none";
      const hist = loadWorkspaceHistory(ex.id);
      return {
        id: ex.id,
        name: ex.name,
        partType: ex.partType,
        imageUrl: ex.imageUrl,
        status,
        accuracy,
        iterations: iters.length,
        dimsPass,
        dimsTotal: comp.length,
        lastRun: hist[0]?.savedAt ?? null,
        recent: hist.slice(0, 4).map((h) => ({ savedAt: h.savedAt, label: h.label })),
      };
    });
  }, [resolvedExamples, workspaceTick]);

  const handleLibraryChange = (patch: Partial<ExampleLibraryState>) => {
    setExampleLibrary((prev) => {
      const next = { ...prev, ...patch };
      saveExampleLibrary(next);
      return next;
    });
  };

  const pipelineRunIdRef = useRef<number>(0);
  const reexecuteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const upsertModelPreview = useCallback((slot: ModelPreviewSlot) => {
    setModelPreviews((prev) => {
      const idx = prev.findIndex((p) => p.id === slot.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = slot;
        return next;
      }
      return [...prev, slot];
    });
    setActivePreviewId(slot.id);
  }, []);

  const findResolvedExample = (exampleId: string) => {
    const fromList = resolvedExamples.find((e) => e.id === exampleId);
    if (fromList) return fromList;
    const custom = (exampleLibrary.customEntries ?? []).find((e) => e.id === exampleId);
    if (custom) {
      return {
        id: custom.id,
        name: custom.name,
        partType: custom.partType,
        inputDrawing: custom.inputDrawing,
        relativePath: `imported://${custom.id}`,
        defaultPrompt: custom.defaultPrompt,
        imageUrl: custom.imageDataUrl,
      };
    }
    const base = DRAWING_EXAMPLES.find((e) => e.id === exampleId);
    if (base) return resolveExample(base, exampleLibrary.pathOverrides);
    return resolvedExamples[0];
  };

  const snapshotWorkspace = useCallback(
    () => ({
      exampleId: activeExampleId,
      procadSessionId,
      chatHistory,
      promptText,
      examplePreviewUrl,
      glbUrl,
      stlUrl,
      stepUrl,
      pyUrl,
      cadCode,
      cadParams,
      drawingSpec,
      iterations,
      activeIterationIndex,
    }),
    [
      activeExampleId,
      procadSessionId,
      chatHistory,
      promptText,
      examplePreviewUrl,
      glbUrl,
      stlUrl,
      stepUrl,
      pyUrl,
      cadCode,
      cadParams,
      drawingSpec,
      iterations,
      activeIterationIndex,
    ]
  );

  const workspaceSnapshotRef = useRef(snapshotWorkspace());
  useEffect(() => {
    workspaceSnapshotRef.current = snapshotWorkspace();
  }, [snapshotWorkspace]);

  useEffect(() => {
    const timer = setTimeout(() => {
      persistWorkspace(workspaceSnapshotRef.current);
      setWorkspaceTick((t) => t + 1);
    }, 500);
    return () => clearTimeout(timer);
  }, [snapshotWorkspace]);

  const applyWorkspaceState = (ws: ReturnType<typeof snapshotWorkspace>) => {
    setProcadSessionId(ws.procadSessionId);
    setChatHistory(ws.chatHistory || []);
    setPromptText(ws.promptText || "");
    setExamplePreviewUrl(ws.examplePreviewUrl);
    setGlbUrl(ws.glbUrl);
    setStlUrl(ws.stlUrl);
    setStepUrl(ws.stepUrl);
    setPyUrl(ws.pyUrl);
    setCadCode(ws.cadCode);
    setCadParams(ws.cadParams || []);
    setDrawingSpec(ws.drawingSpec ?? null);
    setIterations(ws.iterations || []);
    setActiveIterationIndex(ws.activeIterationIndex || 0);
    setModelPreviews([]);
    if (ws.glbUrl) {
      setModelPreviews([
        {
          id: "final",
          label: "Restored model",
          glbUrl: ws.glbUrl,
        },
      ]);
      setActivePreviewId("final");
    }
  };

  const refreshWorkspaceHistory = (exampleId: string) => {
    setWorkspaceHistory(loadWorkspaceHistory(exampleId));
  };

  const fetchExamplePreview = async (imageUrl: string): Promise<string | null> => {
    try {
      const resp = await fetch(imageUrl);
      const blob = await resp.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return imageUrl;
    }
  };

  const loadExample = async (exampleId: string, navigateToReconstruct = false) => {
    const example = findResolvedExample(exampleId);
    if (!example) return null;

    if (exampleId !== activeExampleId) {
      persistWorkspace(snapshotWorkspace());
    }

    setSelectedExampleId(exampleId);
    setActiveExampleId(exampleId);
    refreshWorkspaceHistory(exampleId);

    const saved = getWorkspace(exampleId);
    if (saved) {
      applyWorkspaceState(saved);
      if (!saved.examplePreviewUrl && example.imageUrl) {
        setIsPerceiving(true);
        const preview = await fetchExamplePreview(example.imageUrl);
        setExamplePreviewUrl(preview);
        setIsPerceiving(false);
      }
      if (navigateToReconstruct) setActiveView("reconstruct");
      return { example, preview: saved.examplePreviewUrl };
    }

    setPromptText(example.defaultPrompt);
    setSpec(null);
    setIterations([]);
    setActiveIterationIndex(0);
    setGlbUrl(null);
    setProcadSessionId(null);
    setStlUrl(null);
    setStepUrl(null);
    setPyUrl(null);
    setCadCode(null);
    setCadParams([]);
    setDrawingSpec(null);
    setChatHistory([]);

    let preview: string | null = null;
    if (example.imageUrl) {
      if (example.imageUrl.startsWith("data:")) {
        preview = example.imageUrl;
        setExamplePreviewUrl(preview);
      } else {
        setIsPerceiving(true);
        preview = await fetchExamplePreview(example.imageUrl);
        setExamplePreviewUrl(preview);
        setIsPerceiving(false);
      }
    } else {
      setExamplePreviewUrl(null);
    }

    if (navigateToReconstruct) setActiveView("reconstruct");
    return { example, preview };
  };

  const handleExampleSelect = (exampleId: string) => {
    loadExample(exampleId);
  };

  const handleCustomImageUploaded = (
    base64Image: string,
    mimeType: string,
    fileName: string
  ) => {
    const entry = createCustomEntry(fileName, base64Image, mimeType);
    const nextLibrary = addCustomEntryToLibrary(exampleLibrary, entry);
    setExampleLibrary(nextLibrary);
    saveExampleLibrary(nextLibrary);

    setSelectedExampleId(entry.id);
    setActiveExampleId(entry.id);
    refreshWorkspaceHistory(entry.id);
    setExamplePreviewUrl(base64Image);
    setPromptText(entry.defaultPrompt);
    setActiveView("reconstruct");
    appendChatMessage("user", `Uploaded reference drawing: ${entry.name}`, base64Image);
  };

  // Same as handleCustomImageUploaded but keeps the user on the dashboard.
  const handleDashboardUploadImage = (
    base64Image: string,
    mimeType: string,
    fileName: string
  ) => {
    const entry = createCustomEntry(fileName, base64Image, mimeType);
    const nextLibrary = addCustomEntryToLibrary(exampleLibrary, entry);
    setExampleLibrary(nextLibrary);
    saveExampleLibrary(nextLibrary);

    setSelectedExampleId(entry.id);
    setActiveExampleId(entry.id);
    refreshWorkspaceHistory(entry.id);
    setExamplePreviewUrl(base64Image);
    setPromptText(entry.defaultPrompt);
    // Reset any previous result so the panels reflect the new drawing.
    setGlbUrl(null);
    setStlUrl(null);
    setStepUrl(null);
    setPyUrl(null);
    setCadCode(null);
    setCadParams([]);
    setDrawingSpec(null);
    setIterations([]);
    setActiveIterationIndex(0);
    setModelPreviews([]);
    setProcadSessionId(null);
    appendChatMessage("user", `Uploaded reference drawing: ${entry.name}`, base64Image);
  };

  // Pro-CAD: prompt + optional image → spec extract → codegen → 3D (streaming)
  const upsertChatMessage = (id: string, patch: Partial<ChatMessage> & { role: ChatMessage["role"]; content: string }) => {
    setChatHistory((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...patch };
        return next;
      }
      return [...prev, { id, ...patch }];
    });
  };

  const applyProcadResult = (data: Record<string, unknown>) => {
    if (data.sessionId) setProcadSessionId(data.sessionId as string);
    if (data.glbUrl) {
      const bust = "?t=" + Date.now();
      setGlbUrl((data.glbUrl as string) + bust);
      setStlUrl(data.stlUrl ? (data.stlUrl as string) + bust : null);
      setStepUrl(data.stepUrl ? (data.stepUrl as string) + bust : null);
      setPyUrl(data.pyUrl ? (data.pyUrl as string) + bust : null);
    }
    if (data.code) {
      const code = data.code as string;
      setCadCode(code);
      setCadParams(extractCadParams(code));
    }
    if (data.drawingSpec) {
      setDrawingSpec(data.drawingSpec as DrawingSpecData);
    }
    setWorkspaceTick((t) => t + 1);
  };

  const handleProcadStreamEvent = (event: ProcadStreamEvent) => {
    const runId = pipelineRunIdRef.current;

    if (event.type === "pipeline_start") {
      setModelPreviews([]);
      setActivePreviewId(null);
      upsertChatMessage(`pipeline-header-${runId}`, {
        role: "assistant",
        content: event.message || "Pipeline started",
        kind: "pipeline_header",
        pipelineSteps: event.steps || [],
      });
      setPipelineStatusLabel("Generating…");
      return;
    }

    if (event.type === "model_preview" && event.glbUrl && event.previewId) {
      const bust = "?t=" + Date.now();
      upsertModelPreview({
        id: event.previewId,
        label: event.label || event.previewId,
        glbUrl: event.glbUrl + bust,
      });
      setGlbUrl(event.glbUrl + bust);
      if (event.sessionId) setProcadSessionId(event.sessionId);
      return;
    }

    if (event.type === "step_start" && event.step) {
      setPipelineActiveStep(event.step);
      setPipelineStatusLabel(event.stepName || event.message || "Running…");
      upsertChatMessage(`pipeline-step-${runId}-${event.step}`, {
        role: "assistant",
        content: event.message || "",
        kind: "pipeline_step",
        stepIndex: event.step,
        stepName: event.stepName || `Step ${event.step}`,
        stepStatus: "running",
        streamActive: true,
      });
      return;
    }

    if (event.type === "step_progress" && event.step) {
      setPipelineStatusLabel(event.stepName || event.message || "Running…");
      const progressIter = event.iteration as unknown as PipelineIteration | undefined;
      const progressText = progressIter?.logs || event.message || "";
      upsertChatMessage(`pipeline-step-${runId}-${event.step}`, {
        role: "assistant",
        content: progressText,
        kind: "pipeline_step",
        stepIndex: event.step,
        stepName: event.stepName || `Step ${event.step}`,
        stepStatus: "running",
        streamActive: true,
        imageUrls: event.imageUrls || progressIter?.imageUrls,
      });
      return;
    }

    if (event.type === "step_done" && event.step) {
      const iteration = event.iteration as unknown as PipelineIteration | undefined;
      const status = iteration?.status === "success" ? "success" : "error";
      const doneText = iteration?.logs || event.message || "";
      const imageUrls = event.imageUrls || iteration?.imageUrls;
      if (event.drawingSpec) {
        setDrawingSpec(event.drawingSpec as DrawingSpecData);
      }
      upsertChatMessage(`pipeline-step-${runId}-${event.step}`, {
        role: "assistant",
        content: doneText,
        kind: "pipeline_step",
        stepIndex: event.step,
        stepName: event.stepName || iteration?.stepName || `Step ${event.step}`,
        stepStatus: status,
        streamActive: false,
        imageUrls,
      });
      if (iteration) {
        setIterations((prev) => {
          const next = [...prev];
          const idx = next.findIndex((it) => it.attempt === iteration.attempt);
          if (idx >= 0) next[idx] = iteration;
          else next.push(iteration);
          setActiveIterationIndex(next.length - 1);
          return next;
        });
        if (iteration.code) {
          setCadCode(iteration.code);
          setCadParams(extractCadParams(iteration.code));
        }
      }
      setPipelineActiveStep(event.step + 1);
      setPipelineStatusLabel("Generating…");
      return;
    }

    if (event.type === "complete" && event.result) {
      const data = event.result;
      applyProcadResult(data);
      refreshWorkspaceHistory(activeExampleId);
      if (data.glbUrl) {
        const bust = "?t=" + Date.now();
        upsertModelPreview({
          id: "final",
          label: "Final export",
          glbUrl: (data.glbUrl as string) + bust,
        });
      }
      if (data.success) {
        const visualWarn = data.visualValidationWarning as string | undefined;
        const doneMsg = visualWarn
          ? `Model exported successfully. Visual validation did not pass: ${visualWarn}`
          : "All done! The CadQuery model is ready — rotate it in the viewport and download exports.";
        if (data.reply) {
          upsertChatMessage(`assistant-${Date.now()}`, {
            role: "assistant",
            content: data.reply as string,
            kind: "text",
          });
        } else {
          upsertChatMessage(`pipeline-complete-${Date.now()}`, {
            role: "assistant",
            content: doneMsg,
            kind: "text",
          });
        }
      } else {
        upsertChatMessage(`pipeline-fail-${Date.now()}`, {
          role: "assistant",
          content: `Pipeline did not complete: ${data.error || "Unknown error"}`,
          kind: "text",
        });
      }
      setPipelineActiveStep(null);
      setPipelineStatusLabel("");
      return;
    }

    if (event.type === "error") {
      upsertChatMessage(`pipeline-error-${Date.now()}`, {
        role: "assistant",
        content: `Error: ${event.error || "Pipeline failed"}`,
        kind: "text",
      });
      setPipelineActiveStep(null);
      setPipelineStatusLabel("");
    }
  };

  const runProcadStream = async (
    url: string,
    body: Record<string, unknown>
  ) => {
    await consumeProcadStream(url, body, handleProcadStreamEvent);
  };

  const runProcadGenerateFallback = async (
    prompt: string,
    image?: string,
    mimeType?: string,
    sessionId?: string | null
  ) => {
    const runId = pipelineRunIdRef.current;
    upsertChatMessage(`pipeline-header-${runId}`, {
      role: "assistant",
      content: "Generating 3D model…",
      kind: "pipeline_header",
    });
    setPipelineStatusLabel("Generating…");

    const response = await fetch("/api/procad/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        image,
        imageType: mimeType,
        sessionId: sessionId || undefined,
        pipelineMethod,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }

    if (data.iterations?.length) {
      setIterations(data.iterations);
      setActiveIterationIndex(data.iterations.length - 1);
      const last = data.iterations[data.iterations.length - 1];
      if (last?.code) {
        setCadCode(last.code);
        setCadParams(extractCadParams(last.code));
      }
    }

    applyProcadResult(data);
    if (data.success) {
      upsertChatMessage(`pipeline-complete-${Date.now()}`, {
        role: "assistant",
        content: "Generation complete.",
        kind: "text",
      });
    } else {
      throw new Error(data.error || "Pipeline failed");
    }
  };

  const runProcadGenerateCore = async (
    prompt: string,
    image?: string,
    mimeType?: string,
    sessionId?: string | null
  ) => {
    archiveWorkspaceHistory(activeExampleId, snapshotWorkspace());
    refreshWorkspaceHistory(activeExampleId);

    pipelineRunIdRef.current = Date.now();
    setIsPipelineRunning(true);
    setIsChatResponding(true);
    setIterations([]);
    setActiveIterationIndex(0);
    setGlbUrl(null);
    setModelPreviews([]);
    setActivePreviewId(null);
    setPipelineActiveStep(1);
    setPipelineStatusLabel("Generating…");
    setChatHistory([]);
    setDrawingSpec(null);
    setCadCode(null);
    setCadParams([]);
    appendChatMessage("user", prompt, image);

    try {
      await runProcadStream("/api/procad/generate/stream", {
        prompt,
        image,
        imageType: mimeType,
        sessionId: sessionId || undefined,
        pipelineMethod,
      });
    } catch (streamErr) {
      console.warn("Stream API failed, falling back:", streamErr);
      await runProcadGenerateFallback(prompt, image, mimeType, sessionId);
    }

    setIsPipelineRunning(false);
    setIsChatResponding(false);
    setPipelineActiveStep(null);
    setPipelineStatusLabel("");
  };

  const handleProcadGenerate = async (
    prompt: string,
    image?: string,
    mimeType?: string
  ) => {
    try {
      setActiveView("reconstruct");
      if (image) setActiveExampleId("custom");
      await runProcadGenerateCore(prompt, image, mimeType, procadSessionId);
    } catch (err) {
      console.error("Pro-CAD generate failed:", err);
      setIsPipelineRunning(false);
      setIsChatResponding(false);
      setPipelineActiveStep(null);
      setPipelineStatusLabel("");
      const msg = err instanceof Error ? err.message : String(err);
      appendChatMessage(
        "assistant",
        `Pro-CAD generation failed: ${msg}\n\nIf the API is unavailable, restart the service with scripts/start_frontend.sh.`
      );
    }
  };

  // Dashboard workbench: run reconstruction without leaving the dashboard view.
  const handleDashboardGenerate = async () => {
    try {
      const example = findResolvedExample(selectedExampleId);
      if (!example) return;
      await loadExample(selectedExampleId, false);

      // Resolve the drawing image directly — loadExample's returned preview can be
      // null for a saved workspace, which would silently drop the image and make the
      // model hallucinate an unrelated part.
      let image: string | undefined;
      if (example.imageUrl) {
        image = example.imageUrl.startsWith("data:")
          ? example.imageUrl
          : (await fetchExamplePreview(example.imageUrl)) || undefined;
      }
      const mimeType = mimeFromAssetPath(example.relativePath || "");

      await runProcadGenerateCore(
        effectiveGeneratePrompt(example.defaultPrompt, Boolean(image)),
        image,
        image ? mimeType : undefined,
        null
      );
    } catch (err) {
      console.error("Dashboard reconstruction failed:", err);
      setIsPipelineRunning(false);
      setIsChatResponding(false);
      setPipelineActiveStep(null);
      setPipelineStatusLabel("");
      const msg = err instanceof Error ? err.message : String(err);
      appendChatMessage("assistant", `Reconstruction failed: ${msg}`);
    }
  };

  // Dashboard workbench: re-execute the current CadQuery code with edited params.
  const handleUpdateModel = async () => {
    if (!cadCode || !procadSessionId) return;
    setIsReexecuting(true);
    try {
      const response = await fetch("/api/procad/reexecute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: procadSessionId, code: cadCode }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        applyProcadResult(data);
      }
    } catch (err) {
      console.error("Update model failed:", err);
    } finally {
      setIsReexecuting(false);
    }
  };

  const runFolderBatch = async (folderId: string) => {
    if (batchProgress) return;
    const folder = exampleLibrary.folders.find((f) => f.id === folderId);
    if (!folder) return;

    const items = folder.childIds
      .map((id) => findResolvedExample(id))
      .filter(Boolean);

    setBatchProgress({
      folderId,
      current: 0,
      total: items.length,
      currentName: "",
    });

    let runningExampleId = activeExampleId;

    for (let i = 0; i < items.length; i++) {
      const ex = items[i];
      setBatchProgress({
        folderId,
        current: i,
        total: items.length,
        currentName: ex.name,
      });

      if (runningExampleId !== ex.id) {
        persistWorkspace({ ...workspaceSnapshotRef.current, exampleId: runningExampleId });
      }

      await loadExample(ex.id, false);
      runningExampleId = ex.id;

      let imageData: string | undefined;
      const mimeType = mimeFromAssetPath(ex.relativePath);
      if (ex.imageUrl) {
        const preview = await fetchExamplePreview(ex.imageUrl);
        if (preview) imageData = preview;
      }

      try {
        await runProcadGenerateCore(
          effectiveGeneratePrompt(ex.defaultPrompt, Boolean(imageData)),
          imageData,
          mimeType,
          null
        );
        await new Promise((r) => setTimeout(r, 800));
        persistWorkspace({ ...workspaceSnapshotRef.current, exampleId: ex.id });
      } catch (err) {
        console.error(`Batch run failed for ${ex.name}:`, err);
      }
    }

    setBatchProgress(null);
  };

  // 4. Compile Agent sequence (preset demo flow)
  const triggerPipelineAgent = async (currentSpec: SpecManifest, presetId: string) => {
    try {
      setIsPipelineRunning(true);
      setIterations([]);
      setActiveIterationIndex(0);

      const response = await fetch("/api/run-agent-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: currentSpec, presetId })
      });
      const data = await response.json();

      if (data.success && data.iterations && data.iterations.length > 0) {
        const totalRounds = data.iterations.length;
        for (let i = 0; i < totalRounds; i++) {
          await new Promise((resolve) => setTimeout(resolve, i === 0 ? 300 : 700));
          setIterations((prev) => [...prev, data.iterations[i]]);
          setActiveIterationIndex(i);

          if (data.iterations[i].status === "success") {
            setSpec(data.finalSpec);
          }
        }
      }
      setIsPipelineRunning(false);
    } catch (err) {
      console.error("Pipeline compiler run failed:", err);
      setIsPipelineRunning(false);
    }
  };

  // 5. Dimension Sliders Updates
  const handleParameterChange = (id: string, value: number) => {
    if (!spec) return;
    
    const updatedDims = spec.dimensions.map((d) => 
      d.id === id ? { ...d, value } : d
    );

    const updatedSpec = { ...spec, dimensions: updatedDims };
    setSpec(updatedSpec);

    if (iterations.length > 0) {
      const idxOfSuccess = iterations.findIndex(it => it.status === "success");
      if (idxOfSuccess !== -1) {
        const updatedSuccess = JSON.parse(JSON.stringify(iterations[idxOfSuccess]));
        if (updatedSuccess.comparison) {
          updatedSuccess.comparison = updatedSuccess.comparison.map((c: ComparisonResult) => 
            c.id === id ? { ...c, measured: value, error: Math.abs(c.target - value), ok: Math.abs(c.target - value) < 0.05 } : c
          );
        }
        
        const nextIters = [...iterations];
        nextIters[idxOfSuccess] = updatedSuccess;
        setIterations(nextIters);
      }
    }
  };

  // 6. Dialogue agent (Pro-CAD edit or legacy preset co-pilot)
  const handleSendMessage = async (text: string, attachedImage?: string) => {
    try {
      setIsChatResponding(true);
      appendChatMessage("user", text, attachedImage);

      if (procadSessionId && glbUrl) {
        pipelineRunIdRef.current = Date.now();
        setIsChatResponding(true);
        setIsPipelineRunning(true);
        setPipelineActiveStep(1);
        setPipelineStatusLabel("Applying edit…");

        await runProcadStream("/api/procad/chat/stream", {
          sessionId: procadSessionId,
          message: text,
          image: attachedImage,
        });

        setIsChatResponding(false);
        setIsPipelineRunning(false);
        setPipelineActiveStep(null);
        setPipelineStatusLabel("");
        return;
      }

      if (!spec) {
        setIsChatResponding(false);
        appendChatMessage("assistant", "Enter a prompt and click Generate 3D Model first.");
        return;
      }

      const payloadMessage = { role: "user", content: text };
      const apiMessages = [...chatHistory.map(h => ({ role: h.role, content: h.content })), payloadMessage];
      const activeCode = iterations[iterations.length - 1]?.code || "";

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          currentSpec: spec,
          currentCode: activeCode
        })
      });
      const data = await response.json();

      if (data.updatedSpec && data.reply) {
        appendChatMessage("assistant", data.reply);
        setSpec(data.updatedSpec);
        await triggerPipelineAgent(data.updatedSpec, activeExampleId);
      }
      setIsChatResponding(false);
    } catch (err) {
      console.error("Chat reply failed:", err);
      setIsChatResponding(false);
      appendChatMessage("assistant", "Re-aligned CAD parameters on adaptive model correction...");
    }
  };

  const handleCadParamChange = (paramId: string, value: number) => {
    if (!cadCode || !procadSessionId) return;
    const param = cadParams.find((p) => p.id === paramId);
    if (!param) return;

    const newCode = applyCadParamValue(cadCode, param, value);
    const newParams = extractCadParams(newCode);
    setCadCode(newCode);
    setCadParams(newParams);

    if (reexecuteTimerRef.current) clearTimeout(reexecuteTimerRef.current);
    reexecuteTimerRef.current = setTimeout(async () => {
      setIsReexecuting(true);
      try {
        const response = await fetch("/api/procad/reexecute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: procadSessionId, code: newCode }),
        });
        const data = await response.json();
        if (response.ok && data.success) {
          applyProcadResult(data);
        }
      } catch (err) {
        console.error("Reexecute failed:", err);
      } finally {
        setIsReexecuting(false);
      }
    }, 450);
  };

  const appendChatMessage = (role: "user" | "assistant", content: string, attachment?: string) => {
    const newMsg: ChatMessage = {
      id: Math.random().toString(),
      role,
      content,
      attachment,
      kind: "text",
    };
    setChatHistory((prev) => [...prev, newMsg]);
  };

  const restoreHistoryEntry = async (entry: WorkspaceHistoryEntry) => {
    applyWorkspaceState(entry.workspace);
    if (entry.workspace.procadSessionId) {
      try {
        const resp = await fetch(`/api/procad/session/${entry.workspace.procadSessionId}`);
        const data = await resp.json();
        if (data.success) {
          applyProcadResult(data);
          if (data.glbUrl) {
            const bust = "?t=" + Date.now();
            upsertModelPreview({
              id: "final",
              label: "Restored model",
              glbUrl: (data.glbUrl as string) + bust,
            });
          }
        }
      } catch {
        /* keep local restore */
      }
    }
    appendChatMessage(
      "assistant",
      `Restored session from ${new Date(entry.savedAt).toLocaleString()}.`
    );
  };

  const selectedExample = findResolvedExample(selectedExampleId);
  const activeExample = findResolvedExample(activeExampleId);
  const partTypeOptions = Array.from(
    new Set(resolvedExamples.map((ex) => ex.partType))
  );

  const dashboardDetailResize = useResizeWidth(340, 260, 520);
  const reconstructLeftResize = useResizeWidth(300, 220, 480);
  const reconstructRightResize = useResizeWidth(420, 320, 640);

  // Latest dimension comparison → rail "AI diff" validation status.
  const railComparison =
    [...iterations].reverse().find((it) => it.comparison && it.comparison.length)
      ?.comparison ?? [];
  const railDimsOut = railComparison.filter((c) => !c.ok).length;
  const railHasValidation = railComparison.length > 0;

  return (
    <div className="h-screen overflow-hidden bg-[#f8fafc] text-slate-700 flex font-sans select-none antialiased">
      
      {/* Left icon rail */}
      <aside className="shrink-0 w-14 bg-slate-900 flex flex-col items-center py-3 h-full">
        <div className="h-9 w-9 rounded-lg bg-orange-600 flex items-center justify-center text-white font-black text-lg mb-6 shadow-sm select-none">
          K
        </div>

        <nav className="flex flex-1 flex-col items-center gap-1.5">
          <button
            onClick={() => setActiveView("dashboard")}
            title="Dashboard"
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition cursor-pointer ${
              activeView === "dashboard"
                ? "bg-slate-800 text-orange-500"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
          </button>

          <button
            type="button"
            disabled
            title="Resources (coming soon)"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 cursor-not-allowed"
          >
            <Boxes className="w-5 h-5" />
          </button>

          <button
            onClick={() => setActiveView("runs")}
            title="Runs"
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition cursor-pointer ${
              activeView === "runs"
                ? "bg-slate-800 text-orange-500"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <ListChecks className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              const saved = getWorkspace(activeExampleId);
              if (saved) applyWorkspaceState(saved);
              setActiveView("reconstruct");
            }}
            title="Reconstruct"
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition cursor-pointer ${
              activeView === "reconstruct"
                ? "bg-slate-800 text-orange-500"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <Activity className="w-5 h-5" />
          </button>

          <button
            onClick={() => setActiveView("settings")}
            title="Settings"
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition cursor-pointer ${
              activeView === "settings"
                ? "bg-slate-800 text-orange-500"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <Settings className="w-5 h-5" />
          </button>
        </nav>

        <div className="mt-auto flex flex-col items-center gap-2.5 pt-2">
          {railHasValidation && (
            <span
              title={`AI diff: ${railDimsOut} dimension${railDimsOut === 1 ? "" : "s"} out of tolerance`}
              className={`h-2.5 w-2.5 rounded-full ${
                railDimsOut === 0 ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
          )}
          <span
            title="Pipeline status"
            className={`h-2.5 w-2.5 rounded-full ${
              isPipelineRunning
                ? "bg-orange-400 animate-pulse"
                : glbUrl
                  ? "bg-emerald-400"
                  : "bg-slate-600"
            }`}
          />
          <div className="h-7 w-7 rounded-full bg-slate-700 text-slate-200 text-[10px] font-bold flex items-center justify-center select-none">
            WC
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN SECTION CONTENT CONTAINER */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        
        {/* VIEW 1: DASHBOARD WORKBENCH — single-screen reconstruction cockpit */}
        {activeView === "dashboard" && (
          <DashboardWorkbench
            examples={resolvedExamples}
            selectedExampleId={selectedExampleId}
            onSelectExample={handleExampleSelect}
            example={selectedExample}
            examplePreviewUrl={
              selectedExampleId === activeExampleId ? examplePreviewUrl : selectedExample.imageUrl ?? null
            }
            drawingSpec={drawingSpec}
            glbUrl={glbUrl}
            stlUrl={stlUrl}
            stepUrl={stepUrl}
            pyUrl={pyUrl}
            iterations={iterations}
            activeIterationIndex={activeIterationIndex}
            setActiveIterationIndex={setActiveIterationIndex}
            cadParams={cadParams}
            onParamChange={handleCadParamChange}
            isReexecuting={isReexecuting}
            isPipelineRunning={isPipelineRunning}
            pipelineActiveStep={pipelineActiveStep}
            pipelineStatusLabel={pipelineStatusLabel}
            chatHistory={chatHistory}
            onSendMessage={handleSendMessage}
            isChatResponding={isChatResponding}
            historyEntries={workspaceHistory}
            onRestoreHistory={restoreHistoryEntry}
            onRunReconstruction={handleDashboardGenerate}
            onUpdateModel={handleUpdateModel}
            onOpenReconstruct={() => loadExample(selectedExampleId, true)}
            pipelineMethod={pipelineMethod}
            onPipelineMethodChange={(method) => {
              setPipelineMethod(method);
              savePipelineMethod(method);
            }}
            onUploadImage={handleDashboardUploadImage}
          />
        )}

        {/* VIEW: RUNS — project/run list driven by stored workspaces */}
        {activeView === "runs" && (
          <RunsView
            runs={runsData}
            onOpenRun={(id) => {
              loadExample(id);
              setActiveView("dashboard");
            }}
            onOpenReconstruct={(id) => loadExample(id, true)}
          />
        )}

        {/* VIEW 2: FULLY-FEATURED MULTI-AGENT CAD RECONSTRUCT INTERACTIVE STUDIO WORKBENCH */}
        {activeView === "reconstruct" && (
          <div className="flex-1 flex flex-col overflow-hidden h-full">
            
            {/* Context bar with quick navigation triggers */}
            <div className="border-b border-slate-205 py-2.5 px-4 bg-white flex items-center justify-between text-xs font-sans shrink-0">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setActiveView("dashboard")}
                  className="p-1 px-2 border border-slate-200.5 rounded bg-slate-50 text-slate-650 hover:bg-slate-100 transition cursor-pointer flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back to Dashboard</span>
                </button>
                <div className="h-4 w-px bg-slate-200" />
                <span className="font-mono text-slate-450 uppercase text-[10.5px]">Workshop Active:</span>
                <span className="font-extrabold text-slate-800 tracking-tight font-sans">
                  {activeExample.name} ({activeExample.partType})
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="reconstruct-pipeline-method"
                    className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider"
                  >
                    Pipeline
                  </label>
                  <select
                    id="reconstruct-pipeline-method"
                    value={pipelineMethod}
                    onChange={(e) => {
                      const method = e.target.value as PipelineMethod;
                      setPipelineMethod(method);
                      savePipelineMethod(method);
                    }}
                    className="text-[11px] font-sans text-slate-700 border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-orange-500 cursor-pointer max-w-[220px]"
                  >
                    {PIPELINE_METHOD_ORDER.map((method) => (
                      <option key={method} value={method}>
                        {PIPELINE_METHOD_LABELS[method].title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="h-4 w-px bg-slate-200" />
              {glbUrl && (
                <div className="bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline-block" />
                  <span>PRO-CAD MODEL READY (CadQuery → GLB)</span>
                </div>
              )}
              {!glbUrl && iterations.length === 0 && (
                <div className="bg-slate-50 border border-slate-200 px-3 py-1 rounded-full flex items-center gap-1.5 text-[11px] font-bold text-slate-600 shadow-2xs">
                  <Info className="w-3.5 h-3.5" />
                  <span>Click Generate 3D Model to reconstruct this drawing</span>
                </div>
              )}
              </div>
            </div>

            {/* Split panels grid identical to initial CAD agent workspace */}
            <div className="flex-1 p-4 flex gap-0 overflow-hidden min-h-0">
              <div
                className="shrink-0 flex flex-col overflow-hidden min-h-0"
                style={{ width: reconstructLeftResize.width }}
              >
                <DrawingExplorer
                  drawingTitle={activeExample.name}
                  onCustomImageUploaded={handleCustomImageUploaded}
                  onProcadGenerate={handleProcadGenerate}
                  examplePreviewUrl={examplePreviewUrl}
                  isPerceiving={isPerceiving}
                  isPipelineRunning={isPipelineRunning}
                  pipelineStatusLabel={pipelineStatusLabel}
                  promptText={promptText}
                  onPromptChange={setPromptText}
                />
              </div>

              <ResizeHandle onMouseDown={reconstructLeftResize.startResize("right")} />

              <div className="flex-1 min-w-0 flex flex-col gap-2 overflow-hidden min-h-0 px-3">
                <div className="flex-[5] min-h-0 flex flex-col">
                  {modelPreviews.length > 0 ? (
                    <MultiModelViewport
                      previews={modelPreviews}
                      activeId={activePreviewId}
                      onSelect={setActivePreviewId}
                      downloadUrls={{
                        glbUrl,
                        stlUrl,
                        stepUrl,
                        pyUrl,
                      }}
                    />
                  ) : glbUrl ? (
                    <GLBViewer
                      glbUrl={glbUrl}
                      stlUrl={stlUrl || undefined}
                      stepUrl={stepUrl || undefined}
                      pyUrl={pyUrl || undefined}
                    />
                  ) : spec ? (
                    <CADViewer 
                      spec={spec} 
                      onParameterChange={handleParameterChange}
                    />
                  ) : (
                    <div className="border border-slate-200 rounded-xl bg-white shadow-sm flex flex-col items-center justify-center p-8 text-center h-full min-h-0">
                      <Laptop className="w-12 h-12 text-slate-400 mb-2" />
                      <span className="text-sm font-semibold text-slate-700">3D VIEWPORT READY</span>
                      <span className="text-xs text-slate-500 mt-1 max-w-sm">
                        Click Generate 3D Model to run Pro-CAD on this drawing.
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-[4] min-h-0 grid grid-cols-1 md:grid-cols-2 gap-2">
                  
                  <div className="min-h-0 flex flex-col overflow-hidden">
                    <LoopConsole
                      iterations={iterations}
                      isPipelineRunning={isPipelineRunning}
                      activeIterationIndex={activeIterationIndex}
                      setActiveIterationIndex={setActiveIterationIndex}
                    />
                  </div>

                  <div className="min-h-0 flex flex-col overflow-hidden gap-2">
                    {drawingSpec && (
                      <div className={cadParams.length > 0 ? "flex-[3] min-h-0" : "flex-1 min-h-0"}>
                        <DrawingSpecPanel spec={drawingSpec} />
                      </div>
                    )}
                    <div className={drawingSpec && cadParams.length > 0 ? "flex-[2] min-h-0" : "flex-1 min-h-0"}>
                      <SpecPanel
                        params={cadParams}
                        onParamChange={handleCadParamChange}
                        isUpdating={isReexecuting}
                      />
                    </div>
                  </div>

                </div>

              </div>

              <ResizeHandle
                onMouseDown={reconstructRightResize.startResize("left")}
                side="left"
              />

              <div
                className="shrink-0 flex flex-col overflow-hidden min-h-0"
                style={{ width: reconstructRightResize.width }}
              >
                <ChatPanel
                  chatHistory={chatHistory}
                  onSendMessage={handleSendMessage}
                  isChatResponding={isChatResponding}
                  pipelineActiveStep={pipelineActiveStep}
                  pipelineRunning={isPipelineRunning}
                  historyEntries={workspaceHistory}
                  onRestoreHistory={restoreHistoryEntry}
                />
              </div>

            </div>

          </div>
        )}

        {/* VIEW 3: SYSTEM SETTINGS */}
        {activeView === "settings" && (
          <div className="flex-grow p-8 overflow-y-auto text-left font-sans">
            <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl p-6 shadow-3xs space-y-5">
              
              <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100">
                <Settings className="w-6 h-6 text-orange-600" />
                <h1 className="text-lg font-extrabold text-slate-800 tracking-tight">System Settings</h1>
              </div>

              <div className="space-y-4 text-xs font-sans">
                <div className="space-y-1.5">
                  <label className="block text-slate-450 font-bold font-mono tracking-wider uppercase text-[10px]">
                    Pipeline Method
                  </label>
                  <select
                    value={pipelineMethod}
                    onChange={(e) => {
                      const method = e.target.value as PipelineMethod;
                      setPipelineMethod(method);
                      savePipelineMethod(method);
                    }}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg font-sans text-slate-700 text-sm focus:outline-none focus:border-orange-500 cursor-pointer"
                  >
                    {PIPELINE_METHOD_ORDER.map((method) => (
                      <option key={method} value={method}>
                        {PIPELINE_METHOD_LABELS[method].title}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {PIPELINE_METHOD_LABELS[pipelineMethod].description}
                  </p>
                  <div className="mt-2 p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                    <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                      Pipeline steps (with drawing)
                    </p>
                    <ol className="text-[11px] text-slate-600 space-y-0.5 list-decimal list-inside">
                      {pipelineStepsForMethod(pipelineMethod, true).map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                {(pipelineMethod === "v4" || pipelineMethod === "v5") && (
                  <div className="space-y-3 p-3.5 bg-orange-50/60 border border-orange-100 rounded-lg">
                    <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-orange-700">
                      V4 Visual Validation Settings
                    </p>
                    <div className="space-y-1.5">
                      <label className="block text-slate-450 font-bold font-mono tracking-wider uppercase text-[10px]">
                        {V4_SETTINGS_INFO.visualValidationAttempts.label}
                      </label>
                      <input
                        type="text"
                        disabled
                        value={`${V4_SETTINGS_INFO.visualValidationAttempts.defaultValue} (env: ${V4_SETTINGS_INFO.visualValidationAttempts.envKey})`}
                        className="w-full p-2 bg-[#f8fafc] border border-slate-200 rounded-lg font-sans text-slate-500 font-medium"
                      />
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        {V4_SETTINGS_INFO.visualValidationAttempts.description}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-slate-450 font-bold font-mono tracking-wider uppercase text-[10px]">
                        {V4_SETTINGS_INFO.visualValidationMinScore.label}
                      </label>
                      <input
                        type="text"
                        disabled
                        value={`${V4_SETTINGS_INFO.visualValidationMinScore.defaultValue} (env: ${V4_SETTINGS_INFO.visualValidationMinScore.envKey})`}
                        className="w-full p-2 bg-[#f8fafc] border border-slate-200 rounded-lg font-sans text-slate-500 font-medium"
                      />
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        {V4_SETTINGS_INFO.visualValidationMinScore.description}
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-slate-450 font-bold font-mono tracking-wider uppercase text-[10px]">
                    Tolerance Threshold
                  </label>
                  <input type="text" disabled value="0.05 mm (High Precision Calipers)" className="w-full p-2 bg-[#f8fafc] border border-slate-200 rounded-lg font-sans text-slate-500 font-medium" />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-slate-450 font-bold font-mono tracking-wider uppercase text-[10px]">MULTIMODAL MODEL ALIAS</label>
                  <input type="text" disabled value="gemini-3.5-flash (Standard OCR & Geometry Parser)" className="w-full p-2 bg-[#f8fafc] border border-slate-200 rounded-lg font-sans text-slate-500 font-medium" />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-slate-450 font-bold font-mono tracking-wider uppercase text-[10px]">SANDBOX SHELL EXECUTOR</label>
                  <input type="text" disabled value="python3-cadquery-v2.1" className="w-full p-2 bg-[#f8fafc] border border-slate-200 rounded-lg font-sans text-slate-500 font-medium" />
                </div>

                <div className="p-3.5 bg-orange-50 border border-orange-100 rounded-lg text-orange-900 leading-relaxed space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    How to configure custom API access keys?
                  </p>
                  <p className="text-[11.5px] text-orange-800 leading-relaxed font-sans">
                    Set <code className="font-mono bg-orange-100 px-1 py-0.2 rounded font-bold">GEMINI_API_KEY</code> and <code className="font-mono bg-orange-100 px-1 py-0.2 rounded font-bold">GEMINI_MODEL</code> in <code className="font-mono">wondercad/.env</code> to enable live drawing analysis and 3D generation.
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setActiveView("dashboard")}
                className="bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2 rounded-lg font-sans transition cursor-pointer"
              >
                Return to Dashboard
              </button>

            </div>
          </div>
        )}

      </div>

    </div>
  );
}
