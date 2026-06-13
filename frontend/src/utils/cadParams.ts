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

type Rule = {
  regex: RegExp;
  label: (match: RegExpExecArray, index: number) => string;
  valueGroup: number;
};

const RULES: Rule[] = [
  {
    regex: /\.circle\s*\(\s*([\d.]+)/g,
    label: (_, i) => `Circle radius #${i + 1}`,
    valueGroup: 1,
  },
  {
    regex: /\.extrude\s*\(\s*(-?[\d.]+)/g,
    label: (_, i) => `Extrude #${i + 1}`,
    valueGroup: 1,
  },
  {
    regex: /\.hole\s*\(\s*([\d.]+)/g,
    label: (_, i) => `Hole #${i + 1}`,
    valueGroup: 1,
  },
  {
    regex: /\.rect\s*\(\s*([\d.]+)\s*,\s*([\d.]+)/g,
    label: (m, i) => `Rect ${m[1]}×${m[2]} #${i + 1}`,
    valueGroup: 1,
  },
  {
    regex: /\.box\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/g,
    label: (m, i) => `Box L×W×H #${i + 1}`,
    valueGroup: 1,
  },
];

export function extractCadParams(code: string): CadParam[] {
  if (!code?.trim()) return [];
  const params: CadParam[] = [];
  let globalIdx = 0;

  for (const rule of RULES) {
    const re = new RegExp(rule.regex.source, rule.regex.flags);
    let match: RegExpExecArray | null;
    let localIdx = 0;
    while ((match = re.exec(code)) !== null) {
      const raw = match[rule.valueGroup];
      const value = parseFloat(raw);
      if (!Number.isFinite(value)) continue;

      const start = match.index + match[0].indexOf(raw);
      const end = start + raw.length;
      const { min, max, step } = adaptiveRange(value);

      params.push({
        id: `param_${globalIdx}`,
        label: rule.label(match, localIdx),
        value,
        min,
        max,
        step,
        unit: "mm",
        start,
        end,
      });
      globalIdx += 1;
      localIdx += 1;

      // box: also expose W and H as separate params when present
      if (rule.regex.source.includes("box") && match[2] && match[3]) {
        for (const [g, suffix] of [
          [2, "W"],
          [3, "H"],
        ] as const) {
          const v = parseFloat(match[g]);
          if (!Number.isFinite(v)) continue;
          const s = match.index + match[0].indexOf(match[g]);
          const e = s + match[g].length;
          const range = adaptiveRange(v);
          params.push({
            id: `param_${globalIdx}`,
            label: `Box ${suffix} #${localIdx}`,
            value: v,
            min: range.min,
            max: range.max,
            step: range.step,
            unit: "mm",
            start: s,
            end: e,
          });
          globalIdx += 1;
        }
      }
    }
  }

  return params.slice(0, 24);
}

export function applyCadParamValue(code: string, param: CadParam, newValue: number): string {
  const str = String(
    Number.isInteger(newValue) ? newValue : parseFloat(newValue.toFixed(4))
  );
  return code.slice(0, param.start) + str + code.slice(param.end);
}
