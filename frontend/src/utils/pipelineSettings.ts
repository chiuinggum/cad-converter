export type PipelineMethod = "v1" | "v2" | "v3" | "v4" | "v5";

const STORAGE_KEY = "wondercad_pipeline_method";
const STORAGE_SCHEMA_KEY = "wondercad_pipeline_method_schema";
const STORAGE_SCHEMA_VERSION = "v1-v2-swapped";

export const PIPELINE_METHOD_ORDER: PipelineMethod[] = ["v1", "v2", "v3", "v4", "v5"];

export const PIPELINE_METHOD_LABELS: Record<
  PipelineMethod,
  { title: string; description: string }
> = {
  v1: {
    title: "Method V1 — Direct codegen (image-only)",
    description:
      "Skip drawing spec extract. CadQuery codegen from prompt + image directly → execute & export with repair loop.",
  },
  v2: {
    title: "Method V2 — Full pipeline (spec + input)",
    description:
      "Drawing spec extract (with format repair) → CadQuery codegen (prompt + spec + image) → execute & export with repair loop.",
  },
  v3: {
    title: "Method V3 — Spec validation loop",
    description:
      "Same as V2, plus a spec validation stage: extract spec from CadQuery, compare with drawing spec, repair code until aligned (gemini-3.5-flash), then execute & export.",
  },
  v4: {
    title: "Method V4 — Visual validation loop",
    description:
      "V3 plus view-type detection (no crop), render matched multi-view composite from the 3D model, and Gemini compares the full drawing with renders in chat.",
  },
  v5: {
    title: "Method V5 — Pioneer dual-model validation (spec-to-cq)",
    description:
      "V4 plus Pioneer fine-tuned spec-to-CQ model generating alternative code in step 2. Uses spec-alignment score to cross-validate and select the best candidate.",
  },
};

export const V4_SETTINGS_INFO = {
  visualValidationAttempts: {
    label: "Visual Validation Repair Attempts",
    envKey: "MAX_VISUAL_VALIDATION_ATTEMPTS",
    defaultValue: "3",
    description: "Max CadQuery repair loops when rendered views do not match the drawing.",
  },
  visualValidationMinScore: {
    label: "Visual Validation Min Score",
    envKey: "VISUAL_VALIDATION_MIN_SCORE",
    defaultValue: "0.72",
    description: "Minimum Gemini similarity score (0–1) required to pass visual validation.",
  },
} as const;

export function loadPipelineMethod(): PipelineMethod {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const schema = localStorage.getItem(STORAGE_SCHEMA_KEY);
    if (schema !== STORAGE_SCHEMA_VERSION && (raw === "v1" || raw === "v2")) {
      const migrated: PipelineMethod = raw === "v1" ? "v2" : "v1";
      savePipelineMethod(migrated);
      localStorage.setItem(STORAGE_SCHEMA_KEY, STORAGE_SCHEMA_VERSION);
      return migrated;
    }
    if (raw === "v2") return "v2";
    if (raw === "v3") return "v3";
    if (raw === "v4") return "v4";
    if (raw === "v5") return "v5";
    return "v1";
  } catch {
    return "v1";
  }
}

export function savePipelineMethod(method: PipelineMethod) {
  localStorage.setItem(STORAGE_KEY, method);
}

export function pipelineStepsForMethod(
  method: PipelineMethod,
  hasImage: boolean
): string[] {
  const steps: string[] = [];
  if (hasImage && (method === "v4" || method === "v5")) {
    steps.push("View Decouple");
  }
  if (hasImage && method !== "v1") {
    steps.push("Drawing Spec Extract");
  }
  steps.push("CadQuery Generation");
  if (hasImage && (method === "v3" || method === "v4" || method === "v5")) {
    steps.push("Spec Validation");
  }
  steps.push("Execute & Export");
  if (hasImage && (method === "v4" || method === "v5")) {
    steps.push("Visual Validation");
  }
  return steps;
}
