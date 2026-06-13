import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Download, Box } from "lucide-react";

interface GLBViewerProps {
  glbUrl: string;
  stlUrl?: string;
  stepUrl?: string;
  pyUrl?: string;
}

function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  margin = 1.35
) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);

  controls.target.copy(center);

  const fov = (camera.fov * Math.PI) / 180;
  const distance = (maxDim / 2) / Math.tan(fov / 2) * margin;

  const direction = new THREE.Vector3(1, 0.65, 1).normalize();
  camera.position.copy(center).add(direction.multiplyScalar(distance));
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.update();
}

export const GLBViewer: React.FC<GLBViewerProps> = ({
  glbUrl,
  stlUrl,
  stepUrl,
  pyUrl,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current || !glbUrl) return;

    const mount = mountRef.current;
    const width = mount.clientWidth || 500;
    const height = mount.clientHeight || 360;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 10000);
    camera.position.set(120, 80, 120);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;

    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.minDistance = 1;
    controls.maxDistance = 5000;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.78);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xea580c, 0.65);
    dirLight.position.set(120, 180, 100);
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x475569, 0.55);
    fillLight.position.set(-100, -60, -80);
    scene.add(fillLight);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    let gridHelper: THREE.GridHelper | null = null;

    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        const root = gltf.scene;
        modelGroup.clear();
        if (gridHelper) {
          scene.remove(gridHelper);
          gridHelper = null;
        }

        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        root.position.sub(center);

        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const targetSize = 100;
        const scale = targetSize / maxDim;
        root.scale.setScalar(scale);

        root.updateMatrixWorld(true);

        const scaledBox = new THREE.Box3().setFromObject(root);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        root.position.sub(scaledCenter);

        root.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.material = new THREE.MeshStandardMaterial({
              color: 0x94a3b8,
              metalness: 0.35,
              roughness: 0.45,
            });
          }
        });

        modelGroup.add(root);

        const finalBox = new THREE.Box3().setFromObject(modelGroup);
        const finalSize = finalBox.getSize(new THREE.Vector3());
        const gridSpan = Math.max(finalSize.x, finalSize.z, 40) * 1.6;
        const divisions = Math.min(24, Math.max(8, Math.round(gridSpan / 10)));
        gridHelper = new THREE.GridHelper(gridSpan, divisions, 0xcbd5e1, 0xe2e8f0);
        gridHelper.position.y = finalBox.min.y;
        scene.add(gridHelper);

        fitCameraToObject(camera, controls, modelGroup);
      },
      undefined,
      (err) => console.error("GLB load error:", err)
    );

    let animationFrameId: number;
    const renderScene = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(renderScene);
    };
    renderScene();

    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
    };
  }, [glbUrl]);

  const downloadLink = (label: string, url?: string) => {
    if (!url) return null;
    return (
      <a
        href={url}
        download
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white/90 border border-slate-200 text-[10px] font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
      >
        <Download className="w-3 h-3" />
        {label}
      </a>
    );
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm flex flex-col h-full max-h-full overflow-hidden relative min-h-0">
      <div className="p-2.5 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-orange-600" />
          <h2 className="text-sm font-semibold text-slate-800 tracking-wide font-sans uppercase">
            3D MODEL (CadQuery)
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          {downloadLink("GLB", glbUrl)}
          {downloadLink("STL", stlUrl)}
          {downloadLink("STEP", stepUrl)}
          {downloadLink("PY", pyUrl)}
        </div>
      </div>
      <div
        ref={mountRef}
        className="flex-1 min-h-0 cursor-grab active:cursor-grabbing"
      />
      <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50 text-[9px] text-slate-400 font-mono shrink-0">
        Drag: rotate · Right-drag / Shift+drag: pan · Scroll: zoom
      </div>
    </div>
  );
};
