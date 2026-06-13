import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SpecManifest } from "../types";
import { Sliders, RotateCcw, Box, Compass, RefreshCw } from "lucide-react";

interface CADViewerProps {
  spec: SpecManifest;
  onParameterChange: (id: string, value: number) => void;
}

export const CADViewer: React.FC<CADViewerProps> = ({ spec, onParameterChange }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);

  // Drag-to-rotate tracking
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const rotation = useRef({ x: 0.4, y: -0.6 });

  // Get active parameters
  const paramsMap = spec.dimensions.reduce((acc, curr) => {
    acc[curr.id] = curr.value;
    return acc;
  }, {} as Record<string, number>);

  useEffect(() => {
    if (!mountRef.current) return;

    // 1. Setup Scene, Camera, Renderer
    const width = mountRef.current.clientWidth || 500;
    const height = mountRef.current.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc); // Clean clinical white-grey studio background
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 1, 1000);
    // Position camera dynamically based on part depth
    camera.position.set(0, 80, 180);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    
    // Clear old canvases
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 2. Setup Ambient & Directional Lighting for clinical grey metallic feedback
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xea580c, 0.6);
    dirLight1.position.set(100, 150, 80);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x475569, 0.8); // Steel blue directional fill light
    dirLight2.position.set(-100, -50, -80);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0xffffff, 0.5, 300);
    pointLight.position.set(0, 60, 20);
    scene.add(pointLight);

    // 3. Coordinate Helper Grid (Clean light-grey grid lines)
    const gridHelper = new THREE.GridHelper(180, 20, 0xcbd5e1, 0xe2e8f0);
    gridHelper.position.y = -35;
    scene.add(gridHelper);

    // 4. Model Group Root
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // Animation Loop
    let animationFrameId: number;
    const renderScene = () => {
      if (modelGroupRef.current) {
        // Multiplier smoothing for mouse rotations
        modelGroupRef.current.rotation.x += (rotation.current.x - modelGroupRef.current.rotation.x) * 0.15;
        modelGroupRef.current.rotation.y += (rotation.current.y - modelGroupRef.current.rotation.y) * 0.15;
      }
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(renderScene);
    };
    renderScene();

    // Resize Handler
    const handleResize = () => {
      if (!mountRef.current || !renderer || !camera) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Redraw geometry when parameters change
  useEffect(() => {
    const scene = sceneRef.current;
    const modelGroup = modelGroupRef.current;
    if (!scene || !modelGroup) return;

    // Clear previous children
    while (modelGroup.children.length > 0) {
      const obj = modelGroup.children[0];
      modelGroup.remove(obj);
    }

    // Material Styling
    const cadMeshMaterial = new THREE.MeshStandardMaterial({
      color: 0x64748b, // Solid metal steel color
      metalness: 0.85,
      roughness: 0.22,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });

    const activeEdgesMaterial = new THREE.LineBasicMaterial({
      color: 0x4f46e5, // Precise Indigo layout edges line
      linewidth: 2
    });

    const boreMaterial = new THREE.MeshStandardMaterial({
      color: 0x334155, // Clean dark slate inner bore color
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.9
    });

    const holeAxesMaterial = new THREE.LineDashedMaterial({
      color: 0xf43f5e, // Technical Rose-pink dashed lines for drilling dimension axes
      dashSize: 3,
      gapSize: 2
    });

    // Draw part based on its structural type
    const constructCADGeometry = () => {
      const type = spec.part_type;

      if (type === "revolved") {
        const isFlange = paramsMap["D_outer"] !== undefined;

        if (isFlange) {
          // A: Classic Flange Coupling
          const D_outer = paramsMap["D_outer"] || 80;
          const H = paramsMap["H"] || 20;
          const D_bore = paramsMap["D_bore"] || 30;
          const hole_pcd = paramsMap["hole_pcd"] || 60;
          const hole_dia = paramsMap["hole_dia"] || 8;
          const chamfer = paramsMap["chamfer"] || 2;

          // Compute shapes with central bore hole subtracted
          const flangeShape = new THREE.Shape();
          flangeShape.absarc(0, 0, D_outer / 2, 0, Math.PI * 2, false);

          const boreHole = new THREE.Path();
          boreHole.absarc(0, 0, D_bore / 2, 0, Math.PI * 2, true);
          flangeShape.holes.push(boreHole);

          const extrudeSettings = {
            depth: H - chamfer,
            bevelEnabled: true,
            bevelThickness: chamfer,
            bevelSize: chamfer,
            bevelOffset: -chamfer,
            bevelSegments: 4,
            curveSegments: 48
          };

          const geom = new THREE.ExtrudeGeometry(flangeShape, extrudeSettings);
          // Center the geometry relative to extrusion height
          geom.center();

          const mesh = new THREE.Mesh(geom, cadMeshMaterial);
          modelGroup.add(mesh);

          // Add clean yellow outline highlighting edges
          const edges = new THREE.EdgesGeometry(geom);
          const lineSegments = new THREE.LineSegments(edges, activeEdgesMaterial);
          modelGroup.add(lineSegments);

          // Render Array Holes symmetrically
          const holeCount = 4;
          for (let i = 0; i < holeCount; i++) {
            const angle = (i * Math.PI) / 2;
            const hx = Math.cos(angle) * (hole_pcd / 2);
            const hy = Math.sin(angle) * (hole_pcd / 2);

            // Small cylindrical tubes indicating bolt holes inside model
            const boltGeom = new THREE.CylinderGeometry(hole_dia / 2, hole_dia / 2, H * 1.05, 12);
            boltGeom.rotateX(Math.PI / 2);
            const boltMesh = new THREE.Mesh(boltGeom, boreMaterial);
            boltMesh.position.set(hx, hy, 0);
            modelGroup.add(boltMesh);

            // Add center axes dash lines
            const lineGeom = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(hx, hy, -H * 0.7),
              new THREE.Vector3(hx, hy, H * 0.7)
            ]);
            const axisLine = new THREE.Line(lineGeom, holeAxesMaterial);
            axisLine.computeLineDistances();
            modelGroup.add(axisLine);
          }
        } else {
          // B: Stepped Shaft Sleeve
          const D_large = paramsMap["D_large"] || 65;
          const H_flange = paramsMap["H_flange"] || 12;
          const D_small = paramsMap["D_small"] || 40;
          const H_sleeve = paramsMap["H_sleeve"] || 28;
          const D_bore = paramsMap["D_bore"] || 25;
          const pin_hole_dia = paramsMap["pin_hole_dia"] || 6;
          const pin_hole_dist = paramsMap["pin_hole_dist"] || 16;

          // 1. Large flange block
          const flangeShape = new THREE.Shape();
          flangeShape.absarc(0, 0, D_large / 2, 0, Math.PI * 2, false);
          
          const boreHole1 = new THREE.Path();
          boreHole1.absarc(0, 0, D_bore / 2, 0, Math.PI * 2, true);
          flangeShape.holes.push(boreHole1);

          const extrudeFlange = new THREE.ExtrudeGeometry(flangeShape, { depth: H_flange, bevelEnabled: false, curveSegments: 48 });
          const flangeMesh = new THREE.Mesh(extrudeFlange, cadMeshMaterial);
          flangeMesh.position.z = - (H_flange + H_sleeve) / 2; // Offset to group center
          modelGroup.add(flangeMesh);

          flangeMesh.updateMatrixWorld();
          const flangeEdges = new THREE.EdgesGeometry(extrudeFlange);
          const flangeLines = new THREE.LineSegments(flangeEdges, activeEdgesMaterial);
          flangeLines.position.z = flangeMesh.position.z;
          modelGroup.add(flangeLines);

          // 2. Small collar collar
          const sleeveShape = new THREE.Shape();
          sleeveShape.absarc(0, 0, D_small / 2, 0, Math.PI * 2, false);
          
          const boreHole2 = new THREE.Path();
          boreHole2.absarc(0, 0, D_bore / 2, 0, Math.PI * 2, true);
          sleeveShape.holes.push(boreHole2);

          const extrudeSleeve = new THREE.ExtrudeGeometry(sleeveShape, { depth: H_sleeve, bevelEnabled: false, curveSegments: 48 });
          const sleeveMesh = new THREE.Mesh(extrudeSleeve, cadMeshMaterial);
          sleeveMesh.position.z = - (H_flange + H_sleeve) / 2 + H_flange;
          modelGroup.add(sleeveMesh);

          const sleeveEdges = new THREE.EdgesGeometry(extrudeSleeve);
          const sleeveLines = new THREE.LineSegments(sleeveEdges, activeEdgesMaterial);
          sleeveLines.position.z = sleeveMesh.position.z;
          modelGroup.add(sleeveLines);

          // 3. Transverse Pin Hole Drilling
          const totalH = H_flange + H_sleeve;
          const pinZ = - totalH / 2 + totalH - pin_hole_dist;

          const pinGeom = new THREE.CylinderGeometry(pin_hole_dia / 2, pin_hole_dia / 2, D_small * 1.1, 16);
          pinGeom.rotateZ(Math.PI / 2);
          const pinMesh = new THREE.Mesh(pinGeom, boreMaterial);
          pinMesh.position.set(0, 0, pinZ);
          modelGroup.add(pinMesh);

          // Horizontal centerline axis
          const pinAxisGeom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-D_small * 0.7, 0, pinZ),
            new THREE.Vector3(D_small * 0.7, 0, pinZ)
          ]);
          const pinAxis = new THREE.Line(pinAxisGeom, holeAxesMaterial);
          pinAxis.computeLineDistances();
          modelGroup.add(pinAxis);
        }
      } else {
        // C: Array Hole Bracket Plate
        const W = paramsMap["W"] || 120;
        const L = paramsMap["L"] || 80;
        const T = paramsMap["T"] || 12;
        const cut_w = paramsMap["cut_w"] || 50;
        const cut_l = paramsMap["cut_l"] || 30;
        const cut_r = paramsMap["cut_r"] || 5;
        const hole_dia = paramsMap["hole_dia"] || 10;
        const hole_inset = paramsMap["hole_inset"] || 12;

        // Base Outer shape (rounded plate)
        const plateShape = new THREE.Shape();
        const cornerR = 8;
        const halfW = W / 2;
        const halfL = L / 2;

        plateShape.moveTo(-halfW + cornerR, -halfL);
        plateShape.lineTo(halfW - cornerR, -halfL);
        plateShape.quadraticCurveTo(halfW, -halfL, halfW, -halfL + cornerR);
        plateShape.lineTo(halfW, halfL - cornerR);
        plateShape.quadraticCurveTo(halfW, halfL, halfW - cornerR, halfL);
        plateShape.lineTo(-halfW + cornerR, halfL);
        plateShape.quadraticCurveTo(-halfW, halfL, -halfW, halfL - cornerR);
        plateShape.lineTo(-halfW, -halfL + cornerR);
        plateShape.quadraticCurveTo(-halfW, -halfL, -halfW + cornerR, -halfL);

        // Center cutout geometry (with fillet)
        const cutoutPath = new THREE.Path();
        const cutHalfW = cut_w / 2;
        const cutHalfL = cut_l / 2;

        cutoutPath.moveTo(-cutHalfW + cut_r, -cutHalfL);
        cutoutPath.lineTo(cutHalfW - cut_r, -cutHalfL);
        cutoutPath.quadraticCurveTo(cutHalfW, -cutHalfL, cutHalfW, -cutHalfL + cut_r);
        cutoutPath.lineTo(cutHalfW, cutHalfL - cut_r);
        cutoutPath.quadraticCurveTo(cutHalfW, cutHalfL, cutHalfW - cut_r, cutHalfL);
        cutoutPath.lineTo(-cutHalfW + cut_r, cutHalfL);
        cutoutPath.quadraticCurveTo(-cutHalfW, cutHalfL, -cutHalfW, cutHalfL - cut_r);
        cutoutPath.lineTo(-cutHalfW, -cutHalfL + cut_r);
        cutoutPath.quadraticCurveTo(-cutHalfW, -cutHalfL, -cutHalfW + cut_r, -cutHalfL);

        plateShape.holes.push(cutoutPath);

        const extrudeSettings = { depth: T, bevelEnabled: false, curveSegments: 36 };
        const geom = new THREE.ExtrudeGeometry(plateShape, extrudeSettings);
        geom.center();

        const mesh = new THREE.Mesh(geom, cadMeshMaterial);
        modelGroup.add(mesh);

        const edges = new THREE.EdgesGeometry(geom);
        const lineSegments = new THREE.LineSegments(edges, activeEdgesMaterial);
        modelGroup.add(lineSegments);

        // Render 4 corner alignment holes
        const cxPoints = [-halfW + hole_inset, halfW - hole_inset];
        const cyPoints = [-halfL + hole_inset, halfL - hole_inset];

        cxPoints.forEach(x => {
          cyPoints.forEach(y => {
            const hGeom = new THREE.CylinderGeometry(hole_dia / 2, hole_dia / 2, T * 1.05, 12);
            hGeom.rotateX(Math.PI / 2);
            const hMesh = new THREE.Mesh(hGeom, boreMaterial);
            hMesh.position.set(x, y, 0);
            modelGroup.add(hMesh);

            const hAxisGeom = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(x, y, -T * 0.7),
              new THREE.Vector3(x, y, T * 0.7)
            ]);
            const hAxis = new THREE.Line(hAxisGeom, holeAxesMaterial);
            hAxis.computeLineDistances();
            modelGroup.add(hAxis);
          });
        });
      }
    };

    constructCADGeometry();
  }, [spec, paramsMap]);

  // Pointer Interaction Handlers
  const handlePointerDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    previousMousePosition.current = {
      x: e.clientX,
      y: e.clientY
    };
  };

  const handlePointerMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;

    const deltaX = e.clientX - previousMousePosition.current.x;
    const deltaY = e.clientY - previousMousePosition.current.y;

    rotation.current = {
      x: rotation.current.x + deltaY * 0.007,
      y: rotation.current.y + deltaX * 0.007
    };

    previousMousePosition.current = {
      x: e.clientX,
      y: e.clientY
    };
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const resetRotation = () => {
    rotation.current = { x: 0.4, y: -0.6 };
  };

  return (
    <div className="relative border border-slate-200 rounded-xl bg-slate-50 flex flex-col h-full overflow-hidden shadow-sm">
      {/* 3D Header Controls */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
        <div className="flex items-center gap-2 bg-white/95 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-700 backdrop-blur-xs shadow-sm">
          <Compass className="w-3.5 h-3.5 text-orange-600 animate-spin-slow" />
          <span className="font-semibold text-[11px] tracking-wide">3D DIGITAL TWIN MODEL (WEBGL)</span>
        </div>
        
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button 
            onClick={resetRotation}
            className="p-1.5 bg-white/95 hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition shadow-sm"
            title="Reset View"
            id="btn_reset_cam"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Primary HTML Canvas Container */}
      <div 
        ref={mountRef} 
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        className="flex-1 min-h-[300px] cursor-grab active:cursor-grabbing w-full h-full"
        id="cad_canvas_container"
      />

      {/* Part Title and Dimensions Label footer */}
      <div className="absolute bottom-3 left-3 bg-white/95 border border-slate-200 px-3 py-2 rounded-lg shadow-sm backdrop-blur-xs leading-tight text-left">
        <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Active Blueprint</div>
        <div className="text-xs font-bold text-slate-800 font-sans">{spec.part_id.toUpperCase()} • {spec.part_type.toUpperCase()}</div>
      </div>

      {/* Sliders Parameter tuning section */}
      <div className="border-t border-slate-200 bg-white p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Sliders className="w-3.5 h-3.5 text-orange-600" />
          <span className="text-xs font-mono font-bold text-slate-600 uppercase tracking-wider">PARAMETRIC INTERFACE (TOP-LEVEL NAMING VARIABLES)</span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          {spec.dimensions.map((dim) => (
            <div key={dim.id} className="bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/85 flex flex-col gap-1 text-left shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-orange-600 font-bold">{dim.id}</span>
                <span className="text-[10px] font-mono text-slate-400">{dim.feature}</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={Math.max(1, Math.round(dim.value * 0.4))}
                  max={Math.round(dim.value * 1.8)}
                  step="1"
                  value={dim.value}
                  onChange={(e) => onParameterChange(dim.id, parseFloat(e.target.value))}
                  className="flex-1 accent-orange-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  id={`slider_${dim.id}`}
                />
                <span className="text-xs font-mono text-slate-750 text-right inline-block w-14 font-bold">
                  {dim.value.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">mm</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
