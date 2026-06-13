#!/usr/bin/env python3
"""
Build interactive 3D HTML gallery for Pro-CAD results.

CadQuery → 3D pipeline (matches Pro-CAD/src/mesh_utils.py):
  1. exec(code, {'cq': cadquery}) runs the generated Python script.
  2. The script must assign a CadQuery Workplane chain to variable `r`.
  3. r.val() returns an OCP TopoDS_Solid/Compound (exact B-Rep boundary representation).
  4. compound.tessellate(linear_deflection=0.001, angular_deflection=0.1) discretizes
     the B-Rep into triangles (same role as BRepMesh_IncrementalMesh in OCCT).
  5. Triangle vertices/faces are wrapped as trimesh.Trimesh for analysis/export.
  6. trimesh exports GLB for Three.js in the browser (OrbitControls drag-to-rotate).
"""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path
from typing import Any, Optional

import trimesh

PROCAD_ROOT = Path(__file__).resolve().parents[1] / "src" / "Pro-CAD"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--results",
        type=Path,
        default=PROCAD_ROOT / "clarification_results_complex" / "all_results_parallel_0_3.json",
    )
    p.add_argument(
        "--gt-mesh-dir",
        type=Path,
        default=PROCAD_ROOT / "data" / "text2cad" / "deepcad_mesh",
    )
    p.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "outputs" / "procad_interactive",
    )
    return p.parse_args()


def mesh_from_code(code: str) -> Optional[trimesh.Trimesh]:
    if not code:
        return None
    try:
        import sys
        if str(PROCAD_ROOT) not in sys.path:
            sys.path.insert(0, str(PROCAD_ROOT))
        from src.mesh_utils import cadquery_to_mesh
        return cadquery_to_mesh(code)
    except Exception:
        return None


def load_stl(path: Path) -> Optional[trimesh.Trimesh]:
    if not path.exists():
        return None
    mesh = trimesh.load(str(path))
    if isinstance(mesh, trimesh.Scene):
        mesh = trimesh.util.concatenate(tuple(mesh.geometry.values()))
    return mesh


def export_glb(mesh: trimesh.Trimesh, path: Path) -> bool:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        mesh.export(str(path))
        return path.exists()
    except Exception:
        return False


def cd_val(ev: Optional[dict]) -> Optional[float]:
    return ev.get("chamfer_distance") if ev else None


def fmt_cd(v: Optional[float]) -> str:
    if v is None:
        return "N/A"
    return f"{v:.6f}"


def extract_standardized_prompt(step3: Optional[str]) -> Optional[str]:
    if not step3:
        return None
    try:
        m = re.search(r'"standardized_prompt"\s*:\s*"((?:[^"\\]|\\.)*)"', step3, re.DOTALL)
        if m:
            return json.loads(f'"{m.group(1)}"')
    except Exception:
        pass
    return None


def build_viewer_html(
    entries: list[dict],
    meta: dict,
    output_dir: Path,
) -> Path:
    models = meta.get("models", {})
    cards = []
    for e in entries:
        uid = e["uid"]
        slug = e["slug"]
        meshes_js = json.dumps(e["mesh_keys"])
        q_html = html.escape(e.get("questions") or "—")
        a_html = html.escape(e.get("answers") or "—")
        code_html = html.escape(e.get("code") or e.get("code_note") or "—")
        code_link = ""
        if e.get("code_href"):
            code_link = f'<p><a class="py-link" href="{html.escape(e["code_href"])}" target="_blank">Download generated.py</a></p>'
        what_html = html.escape(e.get("what_changed") or "—")
        cards.append(
            f"""
<section class="sample" id="sample-{slug}">
  <h2>{html.escape(uid)} <span class="tag">{html.escape(e.get('config_name') or '')}</span></h2>
  <p class="cds">CD — original: {html.escape(fmt_cd(e.get('cd_orig')))} | misleading: {html.escape(fmt_cd(e.get('cd_mis')))} | clarified: {html.escape(fmt_cd(e.get('cd_clar')))}</p>
  <div class="cadquery-panel">
    <h3>Generated CadQuery Python <span class="tag">step4_code_extracted</span></h3>
    <p class="note">3D viewer below runs this script via <code>exec()</code>. Pipeline JSON files (clarification_batch_*.json) are logs — CadQuery lives here.</p>
    {code_link}
    <pre class="code-block code-main">{code_html}</pre>
  </div>
  <div class="viewer-row">
    <div class="viewer-wrap" data-slug="{slug}" data-meshes='{meshes_js}'></div>
    <div class="viewer-controls">
      <label>Model layer</label>
      <select class="layer-select" data-slug="{slug}">
        {e['layer_options']}
      </select>
      <p class="hint">Drag to rotate · scroll to zoom · right-drag to pan</p>
    </div>
  </div>
  <details class="pipeline">
    <summary>CadQuery → 3D mesh pipeline</summary>
    <ol>
      <li><code>exec(code)</code> runs CadQuery Python; result must be in variable <code>r</code>.</li>
      <li><code>r.val()</code> → OpenCASCADE B-Rep solid (exact geometry, not triangles yet).</li>
      <li><code>tessellate(0.001, 0.1)</code> → triangle mesh (linear deflection 0.001, angular 0.1 rad).</li>
      <li>Vertices/faces → <code>trimesh</code> → GLB → Three.js viewer above.</li>
    </ol>
  </details>
  <details open>
    <summary>Clarification trace</summary>
    <p><strong>What changed (misleading):</strong><br>{what_html}</p>
    <p><strong>Clarifier questions:</strong><br>{q_html}</p>
    <p><strong>User answers (Gemini):</strong><br>{a_html}</p>
  </details>
</section>"""
        )

    page = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Pro-CAD Interactive 3D</title>
  <style>
    :root {{ --bg: #0f1419; --card: #1a2332; --text: #e2e8f0; --accent: #38bdf8; --muted: #94a3b8; }}
    * {{ box-sizing: border-box; }}
    body {{ font-family: system-ui, sans-serif; margin: 0; background: var(--bg); color: var(--text); }}
    header {{ padding: 20px 24px; border-bottom: 1px solid #334155; }}
    h1 {{ margin: 0 0 8px; font-size: 1.4rem; }}
    .meta {{ color: var(--muted); font-size: 0.85rem; line-height: 1.5; }}
    main {{ padding: 24px; max-width: 1200px; margin: 0 auto; }}
    .sample {{ background: var(--card); border-radius: 12px; padding: 20px; margin-bottom: 28px; }}
    .tag {{ background: #334155; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; }}
    .cds {{ color: var(--accent); font-family: monospace; font-size: 0.85rem; }}
    .viewer-row {{ display: flex; gap: 16px; flex-wrap: wrap; margin: 16px 0; }}
    .viewer-wrap {{ flex: 1; min-width: 320px; height: 420px; background: #0b1020; border-radius: 8px; position: relative; }}
    .viewer-controls {{ min-width: 200px; }}
    .viewer-controls label {{ display: block; margin-bottom: 6px; font-size: 0.85rem; }}
    .viewer-controls select {{ width: 100%; padding: 8px; border-radius: 6px; background: #0b1020; color: var(--text); border: 1px solid #475569; }}
    .hint {{ color: var(--muted); font-size: 0.75rem; margin-top: 12px; }}
    details {{ margin-top: 12px; font-size: 0.9rem; }}
    summary {{ cursor: pointer; color: var(--accent); }}
    .code-main {{ font-size: 0.8rem; max-height: 220px; }}
    .cadquery-panel {{ background: #0b1020; border: 1px solid #334155; border-radius: 8px; padding: 12px 16px; margin: 12px 0; }}
    .cadquery-panel h3 {{ margin: 0 0 8px; font-size: 1rem; color: #fbbf24; }}
    .note {{ color: var(--muted); font-size: 0.8rem; margin: 0 0 8px; }}
    .py-link {{ color: var(--accent); }}
    .code-block {{ background: #111827; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 0.75rem; white-space: pre-wrap; }}
    .pipeline ol {{ margin: 8px 0; padding-left: 20px; color: var(--muted); }}
    .pipeline code {{ color: #fbbf24; }}
  </style>
</head>
<body>
  <header>
    <h1>Pro-CAD — Interactive 3D Results</h1>
    <p class="meta">
      Clarifier: {html.escape(str(models.get('clarify_agent', '—')))}<br/>
      Answer: {html.escape(str(models.get('answer_model', '—')))}<br/>
      Coder: {html.escape(str(models.get('code_gen_model', '—')))}
    </p>
  </header>
  <main>
    {''.join(cards)}
  </main>
  <script type="importmap">
  {{ "imports": {{ "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/" }} }}
  </script>
  <script type="module">
    import * as THREE from 'three';
    import {{ OrbitControls }} from 'three/addons/controls/OrbitControls.js';
    import {{ GLTFLoader }} from 'three/addons/loaders/GLTFLoader.js';

    const viewers = {{}};

    function initViewer(container, slug, meshKeys) {{
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b1020);
      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 10000);
      const renderer = new THREE.WebGLRenderer({{ antialias: true }});
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const dir = new THREE.DirectionalLight(0xffffff, 0.85);
      dir.position.set(3, 5, 4);
      scene.add(dir);
      const dir2 = new THREE.DirectionalLight(0x88aaff, 0.35);
      dir2.position.set(-4, -2, -3);
      scene.add(dir2);

      const loader = new GLTFLoader();
      const models = {{}};
      let active = null;

      function fitCamera(obj) {{
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 1);
        camera.position.copy(center).add(new THREE.Vector3(maxDim * 1.8, maxDim * 1.2, maxDim * 1.8));
        controls.target.copy(center);
        controls.update();
      }}

      function showLayer(key) {{
        if (active) scene.remove(active);
        active = models[key];
        if (active) {{
          scene.add(active);
          fitCamera(active);
        }}
      }}

      let loaded = 0;
      meshKeys.forEach((key) => {{
        loader.load(`assets/${{slug}}/${{key}}.glb`, (gltf) => {{
          const root = gltf.scene;
          root.traverse((c) => {{
            if (c.isMesh) {{
              c.material = new THREE.MeshStandardMaterial({{
                color: key === 'ground_truth' ? 0x4daf4a : (key === 'clarified' ? 0x377eb8 : 0xfc8d62),
                metalness: 0.25,
                roughness: 0.55,
              }});
            }}
          }});
          models[key] = root;
          loaded++;
          if (loaded === 1) showLayer(key);
        }}, undefined, (err) => console.warn('GLB load failed', key, err));
      }});

      function animate() {{
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      }}
      animate();

      viewers[slug] = {{ showLayer }};
      window.addEventListener('resize', () => {{
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      }});
    }}

    document.querySelectorAll('.viewer-wrap').forEach((el) => {{
      const slug = el.dataset.slug;
      const meshKeys = JSON.parse(el.dataset.meshes);
      initViewer(el, slug, meshKeys);
    }});

    document.querySelectorAll('.layer-select').forEach((sel) => {{
      sel.addEventListener('change', () => {{
        const slug = sel.dataset.slug;
        viewers[slug]?.showLayer(sel.value);
      }});
    }});
  </script>
</body>
</html>"""
    out = output_dir / "index.html"
    out.write_text(page, encoding="utf-8")
    return out


def load_results_json(path: Path) -> tuple[list[dict], dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("results", []), data.get("metadata", {})


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    result_paths = [args.results]
    gemini = PROCAD_ROOT / "clarification_results_gemini" / "all_results_parallel_0_2.json"
    if gemini.exists() and gemini.resolve() not in {p.resolve() for p in result_paths}:
        result_paths.append(gemini)

    all_results: list[dict] = []
    meta: dict = {}
    seen: set[str] = set()
    for rp in result_paths:
        if not rp.exists():
            continue
        batch, m = load_results_json(rp)
        meta = m or meta
        for r in batch:
            key = f"{r['uid']}_{r.get('config_name')}"
            if key not in seen:
                seen.add(key)
                all_results.append(r)

    if not all_results:
        raise SystemExit(f"No results found in {result_paths}")
    assets = args.output_dir / "assets"
    entries: list[dict[str, Any]] = []

    for result in all_results:
        uid = result["uid"]
        config = result.get("config_name") or "sample"
        slug = f"{uid}_{config}".replace("/", "_")
        mesh_dir = assets / slug
        mesh_keys: list[str] = []
        layer_opts: list[str] = []

        gt = load_stl(args.gt_mesh_dir / f"{uid}.stl")
        if gt and export_glb(gt, mesh_dir / "ground_truth.glb"):
            mesh_keys.append("ground_truth")
            layer_opts.append('<option value="ground_truth">Ground Truth (STL)</option>')

        code = result.get("step4_code_extracted")
        code_note = result.get("code_note", "")
        clar = mesh_from_code(code)
        py_path = mesh_dir / "generated.py"
        if code:
            py_path.write_text(code + "\n", encoding="utf-8")
            code_href = f"assets/{slug}/generated.py"
        else:
            code_href = None
        if clar and export_glb(clar, mesh_dir / "clarified.glb"):
            mesh_keys.append("clarified")
            layer_opts.append('<option value="clarified">Clarified (CadQuery exec)</option>')

        step1 = result.get("step1_analysis") or {}
        questions = step1.get("questions") or []
        q_text = "\n".join(f"• {q}" for q in questions)

        entries.append({
            "uid": uid,
            "slug": slug,
            "config_name": config,
            "mesh_keys": mesh_keys,
            "layer_options": "\n".join(layer_opts) if layer_opts else "<option>No mesh</option>",
            "cd_orig": cd_val(result.get("evaluation_original")),
            "cd_mis": cd_val(result.get("evaluation_misleading")),
            "cd_clar": cd_val(result.get("evaluation")),
            "what_changed": result.get("what_changed"),
            "questions": q_text,
            "answers": result.get("step2_answers"),
            "code": code,
            "code_href": code_href,
            "code_note": code_note or (
                "No new CadQuery file: clarified description matched original (baseline reused)."
                if not code and result.get("evaluation")
                else "Coder did not return executable code."
            ),
        })
        print(f"exported meshes for {slug}: {mesh_keys}")

    gallery = build_viewer_html(entries, meta, args.output_dir)
    print(f"interactive gallery: {gallery}")


if __name__ == "__main__":
    main()
