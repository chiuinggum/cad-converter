#!/usr/bin/env bash
# Pro-CAD reproduction on Slurm interactive allocation (use: srun --jobid=JOBID --overlap bash scripts/run_procad.sh)
set -euo pipefail

ROOT="/dss/dssmcmlfs01/pn46ju/pn46ju-dss-0000/caizhuojiang/wondercad/src/Pro-CAD"
PROCAD_ENV="$ROOT/.env"

cd "$ROOT"

for env_file in "$PROCAD_ENV"; do
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
done

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "Warning: GEMINI_API_KEY is not set (needed for default Answer simulator)."
  echo "  Copy src/Pro-CAD/.env.example to src/Pro-CAD/.env and add your key."
fi

export DATA_ROOT="${DATA_ROOT:-$ROOT/data}"
export GT_MESH_DIR="${GT_MESH_DIR:-$DATA_ROOT/text2cad/deepcad_mesh}"
export MISLEADING_JSON="${MISLEADING_JSON:-$ROOT/dataset/selected_misleading_samples_test}"
export OUTPUT_DIR="${OUTPUT_DIR:-$ROOT/clarification_results}"

CODER_MODEL="${CODE_GEN_MODEL:-$ROOT/models/ProCAD-coder}"
CLARIFIER_MODEL="${CLARIFY_AGENT_MODEL:-$ROOT/models/ProCAD-clarifier}"
ANSWER_MODEL="${ANSWER_MODEL:-gemini-3.5-flash}"

BATCH_SIZE="${BATCH_SIZE:-2}"
END_IDX="${END_IDX:-2}"

echo "=== Pro-CAD pipeline ==="
echo "Coder:      $CODER_MODEL"
echo "Clarifier:  $CLARIFIER_MODEL"
echo "Answer sim: $ANSWER_MODEL"
echo "GT meshes:  $GT_MESH_DIR"
echo "Output:     $OUTPUT_DIR"
echo "Samples:    0..$END_IDX (batch=$BATCH_SIZE)"

python3 pipeline.py \
  --json_path "$MISLEADING_JSON" \
  --output_dir "$OUTPUT_DIR" \
  --batch_size "$BATCH_SIZE" \
  --inference_batch_size "$BATCH_SIZE" \
  --start_idx 0 \
  --end_idx "$END_IDX" \
  --clarify_model "$CLARIFIER_MODEL" \
  --answer_model "$ANSWER_MODEL" \
  --code_model "$CODER_MODEL"
