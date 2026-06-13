#!/usr/bin/env bash
# One-time Pro-CAD setup: dataset + HF checkpoints
set -euo pipefail

ROOT="/dss/dssmcmlfs01/pn46ju/pn46ju-dss-0000/caizhuojiang/wondercad/src/Pro-CAD"
cd "$ROOT"

mkdir -p dataset models

# Dataset (wget avoids hf-cli brotli issues on this cluster)
for f in improved.json selected_misleading_samples_train selected_misleading_samples_test train_val_test.json; do
  if [[ ! -f "dataset/$f" ]]; then
    echo "Downloading dataset/$f ..."
    wget -q --show-progress -O "dataset/$f" \
      "https://huggingface.co/datasets/BBexist/ProCAD/resolve/main/$f"
  fi
done

# Checkpoints
export HF_HUB_DISABLE_BROTLI=1
for repo in ProCAD-coder ProCAD-clarifier; do
  dest="models/$repo"
  if [[ ! -f "$dest/config.json" ]]; then
    echo "Downloading BBexist/$repo ..."
    hf download "BBexist/$repo" --local-dir "$dest"
  fi
done

cp -n config/config.yaml.example config/config.yaml 2>/dev/null || true
echo "Setup done. Run pipeline with: srun --jobid=JOBID --overlap bash scripts/run_procad.sh"
