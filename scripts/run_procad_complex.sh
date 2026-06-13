#!/usr/bin/env bash
# Run Pro-CAD on 3 complex misleading samples + interactive viz
set -euo pipefail

ROOT="/dss/dssmcmlfs01/pn46ju/pn46ju-dss-0000/caizhuojiang/wondercad"
PROCAD="$ROOT/src/Pro-CAD"
WONDERCAD_SCRIPTS="$ROOT/scripts"

export MISLEADING_JSON="$PROCAD/dataset/selected_complex_samples.json"
export OUTPUT_DIR="$PROCAD/clarification_results_complex"
export END_IDX=3
export BATCH_SIZE=1
export INFERENCE_BATCH_SIZE=1

# Build GT STL for complex uids (from improved.json)
srun --jobid="${SLURM_JOBID:-5672420}" --overlap bash -lc "
  cd '$PROCAD'
  set -a && source .env 2>/dev/null; set +a
  python3 << 'PY'
import json
from pathlib import Path
from src.mesh_utils import cadquery_to_mesh

improved = json.load(open('dataset/improved.json'))
code_by_uid = {s['uid']: s['ground_truth_code'] for s in improved.get('samples', improved) if s.get('ground_truth_code')}
uids = {s['uid'] for s in json.load(open('dataset/selected_complex_samples.json'))['samples']}
out = Path('data/text2cad/deepcad_mesh')
out.mkdir(parents=True, exist_ok=True)
for uid in uids:
    p = out / f'{uid}.stl'
    if p.exists():
        print('ok', uid)
        continue
    code = code_by_uid.get(uid)
    if not code:
        print('no code', uid)
        continue
    mesh = cadquery_to_mesh(code)
    mesh.export(str(p))
    print('exported', uid)
PY
  bash '$WONDERCAD_SCRIPTS/run_procad.sh'
  python3 '$WONDERCAD_SCRIPTS/visualize_procad_interactive.py' \
    --results '$OUTPUT_DIR/all_results_parallel_0_3.json' \
    --output-dir '$ROOT/outputs/procad_interactive'
"

echo "Done. Open: $ROOT/outputs/procad_interactive/index.html"
