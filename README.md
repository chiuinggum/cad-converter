<div align="center">

<img src="frontend/public/favicon.svg" width="72" alt="WonderCAD logo" />

# WonderCAD

**Turn technical drawings into editable 3D CAD models**

[![Python](https://img.shields.io/badge/python-3.10+-3776ab?logo=python&logoColor=white)](pyproject.toml)
[![Node](https://img.shields.io/badge/node-20+-339933?logo=node.js&logoColor=white)](frontend/package.json)
[![CadQuery](https://img.shields.io/badge/CadQuery-parametric%20CAD-ea580c)](https://github.com/CadQuery/cadquery)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

</div>

---

WonderCAD is an open-source agent pipeline that reads mechanical engineering drawings and produces parametric CadQuery code, executable 3D models, and STEP/GLB exports. It combines vision-language extraction, structured drawing specs, and an iterative generate–execute–verify loop.

## Features

- **Drawing understanding** — Extract views, features, dimensions, and relations from PNG/JPEG drawings
- **Spec-to-CAD codegen** — Generate CadQuery from structured specs (Gemini, Pioneer, or fine-tuned models)
- **Closed-loop verification** — Execute code, render views, compare, and refine
- **Web UI** — Upload drawings, inspect specs, preview 3D, and download results

## Requirements

- Python 3.10+
- Node.js 20+ (for the web frontend)
- [CadQuery](https://github.com/CadQuery/cadquery) / OpenCASCADE (for 3D execution)
- A Gemini API key (`GEMINI_API_KEY`); optional Pioneer keys for cross-validation and fine-tuned codegen

## Installation

```bash
git clone https://github.com/chiuinggum/cad-converter.git
cd cad-converter
# Python backend & drawing agent
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Web frontend
cd frontend
npm install
```

Copy environment variables and add your API keys:

```bash
cp frontend/.env.example frontend/.env
# Or create wondercad/.env at the repo root (recommended)
```

```env
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.5-flash
```

See `frontend/.env.example` for optional Pioneer / cross-validation settings.

## Quick Start

### Web UI

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`, upload a drawing, and run the reconstruction pipeline.

### CLI

Extract a structured drawing spec:

```bash
understand-drawing path/to/drawing.png -o outputs/drawing_spec.json
```

Run the full agent pipeline (extract → review → refine):

```bash
run-drawing-agent path/to/drawing.png --output-root outputs/agent_run
```

## Project Layout

```
wondercad/
├── frontend/          # React + Express web UI
├── src/
│   ├── drawing_agent/ # Drawing spec extraction & refinement
│   └── Pro-CAD/       # Text-to-CadQuery agent (vendored)
├── scripts/           # Data & training utilities
└── example/           # Sample drawings and pipeline outputs
```

## Examples

Browse `example/benchcad_pipeline_demo/` for an end-to-end sample (input drawing → spec → CadQuery → SFT export). Open `example/benchcad_pipeline_demo/pipeline_demo.html` for a visual walkthrough.

## License

WonderCAD is released under the [MIT License](LICENSE).

The vendored [Pro-CAD](src/Pro-CAD/) component remains under Apache 2.0. See `src/Pro-CAD/README.md` for paper citation and upstream details.

## Acknowledgments

- [Pro-CAD](https://github.com/BoYuanVisionary/Pro-CAD) — Clarify-before-draw text-to-CAD agent
- [CadQuery](https://github.com/CadQuery/cadquery) — Parametric CAD in Python
- [BenchCAD](https://huggingface.co/datasets) — Benchmark data for spec-to-CadQuery training
