export interface CadParam {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  start: number;
  end: number;
}

function adaptiveRange(value: number) {
  const abs = Math.abs(value);
  const span = Math.max(abs * 0.5, abs < 1 ? 0.5 : 2);
  const min = Math.min(value - span, value * 0.25);
  const max = Math.max(value + span, value * 2.5, min + 0.1);
  const step = abs >= 50 ? 1 : abs >= 10 ? 0.5 : abs >= 1 ? 0.1 : 0.01;
  return { min, max, step };
}

// A numeric literal: optional sign, integer/decimal. Shared by every rule so a
// negative value (e.g. extrude(-5)) is captured everywhere, not just on extrude.
const NUM = "-?\\d+(?:\\.\\d+)?";

type ExtraGroup = { group: number; suffix: string };

type Rule = {
  regex: RegExp;
  label: (match: RegExpExecArray, index: number) => string;
  valueGroup: number;
  // Additional numeric args from the same match exposed as their own params
  // (e.g. box width/height, cylinder radius).
  extra?: ExtraGroup[];
};

const RULES: Rule[] = [
  // Top-of-line variable assignments to a bare number, e.g. `radius = 5.5`.
  // This is the most common reason params went missing: the model often factors
  // dimensions into named constants instead of inlining literals into the calls.
  // The `$` (with /m) requires the whole RHS to be just a number, so expressions
  // like `r = d / 2` and statements like `result = cq.Workplane()` are skipped.
  {
    regex: new RegExp(`^[ \\t]*([A-Za-z_]\\w*)\\s*=\\s*(${NUM})\\s*(?:#.*)?$`, "gm"),
    label: (m) => m[1],
    valueGroup: 2,
  },
  {
    regex: new RegExp(`\\.circle\\s*\\(\\s*(${NUM})`, "g"),
    label: (_, i) => `Circle radius #${i + 1}`,
    valueGroup: 1,
  },
  {
    regex: new RegExp(`\\.extrude\\s*\\(\\s*(${NUM})`, "g"),
    label: (_, i) => `Extrude #${i + 1}`,
    valueGroup: 1,
  },
  {
    regex: new RegExp(`\\.hole\\s*\\(\\s*(${NUM})`, "g"),
    label: (_, i) => `Hole #${i + 1}`,
    valueGroup: 1,
  },
  {
    regex: new RegExp(`\\.(?:cbore|csk)Hole\\s*\\(\\s*(${NUM})`, "g"),
    label: (_, i) => `Counter-hole #${i + 1}`,
    valueGroup: 1,
  },
  {
    regex: new RegExp(`\\.rect\\s*\\(\\s*(${NUM})\\s*,\\s*(${NUM})`, "g"),
    label: (m, i) => `Rect ${m[1]}×${m[2]} #${i + 1}`,
    valueGroup: 1,
  },
  {
    regex: new RegExp(`\\.box\\s*\\(\\s*(${NUM})\\s*,\\s*(${NUM})\\s*,\\s*(${NUM})`, "g"),
    label: (_, i) => `Box L #${i + 1}`,
    valueGroup: 1,
    extra: [
      { group: 2, suffix: "W" },
      { group: 3, suffix: "H" },
    ],
  },
  // CadQuery solid primitive: cylinder(height, radius).
  {
    regex: new RegExp(`\\.cylinder\\s*\\(\\s*(${NUM})\\s*,\\s*(${NUM})`, "g"),
    label: (_, i) => `Cylinder height #${i + 1}`,
    valueGroup: 1,
    extra: [{ group: 2, suffix: "radius" }],
  },
  {
    regex: new RegExp(`\\.sphere\\s*\\(\\s*(${NUM})`, "g"),
    label: (_, i) => `Sphere radius #${i + 1}`,
    valueGroup: 1,
  },
  // polygon(nSides, diameter): nSides is an integer count, not a dimension, so
  // only the diameter (group 2) is exposed as an editable param.
  {
    regex: new RegExp(`\\.polygon\\s*\\(\\s*${NUM}\\s*,\\s*(${NUM})`, "g"),
    label: (_, i) => `Polygon diameter #${i + 1}`,
    valueGroup: 1,
  },
];

export function extractCadParams(code: string): CadParam[] {
  if (!code?.trim()) return [];
  const params: CadParam[] = [];
  const seen = new Set<number>(); // dedupe by literal position in the source
  let globalIdx = 0;

  const push = (raw: string, label: string, start: number, end: number) => {
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) return;
    if (seen.has(start)) return;
    seen.add(start);
    const { min, max, step } = adaptiveRange(value);
    params.push({
      id: `param_${globalIdx}`,
      label,
      value,
      min,
      max,
      step,
      unit: "mm",
      start,
      end,
    });
    globalIdx += 1;
  };

  for (const rule of RULES) {
    // `d` flag → match.indices gives exact [start, end] of each capture group,
    // so we never mis-locate a number that also appears inside an identifier.
    const re = new RegExp(rule.regex.source, rule.regex.flags + "d");
    let match: RegExpExecArray | null;
    let localIdx = 0;
    while ((match = re.exec(code)) !== null) {
      const indices = (match as RegExpExecArray & { indices?: Array<[number, number] | undefined> }).indices;
      const primary = indices?.[rule.valueGroup];
      if (!primary) continue;
      push(match[rule.valueGroup], rule.label(match, localIdx), primary[0], primary[1]);

      for (const ex of rule.extra ?? []) {
        const span = indices?.[ex.group];
        if (!span || match[ex.group] == null) continue;
        push(match[ex.group], `${rule.label(match, localIdx)} (${ex.suffix})`, span[0], span[1]);
      }
      localIdx += 1;
    }
  }

  // Keep source order so sliders track the code top-to-bottom.
  params.sort((a, b) => a.start - b.start);
  return params.slice(0, 24);
}

export function applyCadParamValue(code: string, param: CadParam, newValue: number): string {
  const str = String(
    Number.isInteger(newValue) ? newValue : parseFloat(newValue.toFixed(4))
  );
  return code.slice(0, param.start) + str + code.slice(param.end);
}
