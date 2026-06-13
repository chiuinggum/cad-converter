export interface DimensionItem {
  id: string;
  value: number;
  type: "diameter" | "linear" | "radius";
  feature: string;
  count?: number;
}

export interface FeatureItem {
  id: string;
  type: string;
  controls: string[];
  count?: number;
}

export interface SpecManifest {
  part_id: string;
  part_type: "revolved" | "bracket" | "plate";
  units: "mm";
  views: string[];
  base: {
    primitive: string;
    params: Record<string, any>;
  };
  dimensions: DimensionItem[];
  features: FeatureItem[];
}

export interface ComparisonResult {
  id: string;
  target: number;
  measured: number;
  error: number;
  ok: boolean;
}

export interface PipelineIteration {
  attempt: number;
  stepName: string;
  status: "running" | "exec_error" | "mismatch" | "success";
  logs: string;
  code: string;
  comparison: ComparisonResult[] | null;
  failing: string[];
}
