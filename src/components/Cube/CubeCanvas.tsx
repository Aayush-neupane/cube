import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FACE_COLORS, parseMove, Vec3, Face } from '../../cube/types';
import { cubeEngine } from '../../cube/CubeState';
import { useCubeStore } from '../../store/useCubeStore';

const SPACING = 1.0;
const CUBIE_SIZE = 0.96;
const STICKER_SIZE = 0.84;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface CubieMesh {
  group: THREE.Group;
}

function stickerColor(face: 'U' | 'D' | 'L' | 'R' | 'F' | 'B'): string {
  return FACE_COLORS[face];
}

// One shared material per face color — creating 54 unique materials (and
// disposing them on every rebuild) churns GPU programs for no visual gain.
const stickerMatCache = new Map<string, THREE.MeshStandardMaterial>();
function stickerMat(face: Face): THREE.MeshStandardMaterial {
  let m = stickerMatCache.get(face);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(stickerColor(face)),
      roughness: 0.32,
      metalness: 0.0,
    });
    stickerMatCache.set(face, m);
  }
  return m;
}

function isSharedMaterial(m: THREE.Material | null | undefined): boolean {
  if (!m) return false;
  for (const cached of stickerMatCache.values()) {
    if (cached === m) return true;
  }
  return false;
}

function faceForDir(d: Vec3): 'U' | 'D' | 'L' | 'R' | 'F' | 'B' {
  if (d[0] === 1) return 'R';
  if (d[0] === -1) return 'L';
  if (d[1] === 1) return 'U';
  if (d[1] === -1) return 'D';
  if (d[2] === 1) return 'F';
  return 'B';
}

export default function CubeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cubiesRef = useRef<CubieMesh[]>([]);
  const animatingRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const sharedRef = useRef<{ plasticGeo: THREE.BufferGeometry; stickerGeo: THREE.BufferGeometry; plasticMat: THREE.Material } | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [cameraTick, setCameraTick] = useState(0);

  const moveQueue = useCubeStore((s) => s.moveQueue);
  const historyLen = useCubeStore((s) => s.history.length);
  const solved = useCubeStore((s) => s.solved);
  const scanVersion = useCubeStore((s) => s.scanVersion);

  // ---- scene setup (once) ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setWebglError('WebGL is unavailable in this browser. The interactive 3D simulator requires WebGL.');
      return;
    }
    if (!renderer.getContext()) {
      setWebglError('WebGL is unavailable in this browser. The interactive 3D simulator requires WebGL.');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(5.2, 4.4, 6.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 14;
    controls.rotateSpeed = useCubeStore.getState().settings.cameraSensitivity;

    // Lighting — subtle studio
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1d24, 0.5);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(5, 8, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdbe4ff, 0.45);
    fill.position.set(-6, -3, -5);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.3);
    rim.position.set(-2, 4, 7);
    scene.add(rim);

    // Build 26 cubelets
    const plasticGeo = new RoundedBoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE, 3, 0.09);
    const plasticMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#15181e'),
      roughness: 0.42,
      metalness: 0.08,
    });
    const stickerGeo = new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE);
    // subtle rounded sticker look via canvas texture? Keep plane with slight bevel illusion via roughness.
    const cubies: CubieMesh[] = [];
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const group = new THREE.Group();
          group.position.set(x * SPACING, y * SPACING, z * SPACING);
          const plastic = new THREE.Mesh(plasticGeo, plasticMat);
          group.add(plastic);
          const dirs: Vec3[] = [];
          if (x !== 0) dirs.push([Math.sign(x), 0, 0]);
          if (y !== 0) dirs.push([0, Math.sign(y), 0]);
          if (z !== 0) dirs.push([0, 0, Math.sign(z)]);
          for (const d of dirs) {
            const face = faceForDir(d);
            const mat = stickerMat(face);
            const sticker = new THREE.Mesh(stickerGeo, mat);
            const offset = 0.481;
            sticker.position.set(d[0] * offset, d[1] * offset, d[2] * offset);
            // orient plane outward
            if (d[0] !== 0) sticker.rotation.y = (d[0] === 1 ? 1 : -1) * Math.PI / 2;
            else if (d[1] !== 0) sticker.rotation.x = d[1] === 1 ? -Math.PI / 2 : Math.PI / 2;
            else if (d[2] === -1) sticker.rotation.y = Math.PI;
            group.add(sticker);
          }
          scene.add(group);
          cubies.push({ group });
        }
      }
    }

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    cubiesRef.current = cubies;
    sharedRef.current = { plasticGeo, stickerGeo, plasticMat };

    const resize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    window.addEventListener('resize', resize);

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', resize);
      renderer.setAnimationLoop(null);
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const m = mesh.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m?.dispose();
        }
      });
      plasticGeo.dispose();
      stickerGeo.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // camera sensitivity live
  useEffect(() => {
    const unsub = useCubeStore.subscribe((s) => {
      if (controlsRef.current) {
        controlsRef.current.rotateSpeed = s.settings.cameraSensitivity;
      }
    });
    return unsub;
  }, []);

  // mirror external queue into local ref
  useEffect(() => {
    if (moveQueue.length === 0) return;
    const moves = useCubeStore.getState().consumeQueueForAnimation();
    if (moves.length === 0) return;
    queueRef.current.push(...moves);
    void processQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveQueue]);

  // reset visuals when history cleared (Reset button) — wait for in-flight animation, then hard-reset
  useEffect(() => {
    if (historyLen === 0 && solved && cubiesRef.current.length > 0) {
      queueRef.current = [];
      const iv = setInterval(() => {
        if (animatingRef.current) return;
        clearInterval(iv);
        rebuildFromEngine();
      }, 120);
      const fallback = setTimeout(() => {
        clearInterval(iv);
        if (!animatingRef.current) rebuildFromEngine();
      }, 2500);
      return () => {
        clearInterval(iv);
        clearTimeout(fallback);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLen]);

  // rebuild visuals when a scanned real-cube state is loaded
  useEffect(() => {
    if (scanVersion === 0 || cubiesRef.current.length === 0) return;
    queueRef.current = [];
    const iv = setInterval(() => {
      if (animatingRef.current) return;
      clearInterval(iv);
      rebuildFromEngine();
    }, 120);
    const fallback = setTimeout(() => {
      clearInterval(iv);
      if (!animatingRef.current) rebuildFromEngine();
    }, 2500);
    return () => {
      clearInterval(iv);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanVersion]);

  function snapAllToGrid() {
    const scene = sceneRef.current;
    if (!scene) return;
    for (const c of cubiesRef.current) {
      scene.attach(c.group);
      c.group.position.set(
        Math.round(c.group.position.x / SPACING) * SPACING,
        Math.round(c.group.position.y / SPACING) * SPACING,
        Math.round(c.group.position.z / SPACING) * SPACING
      );
      // snap rotation to nearest 90°
      const e = new THREE.Euler().setFromQuaternion(c.group.quaternion, 'XYZ');
      const snap = (a: number) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
      c.group.quaternion.setFromEuler(new THREE.Euler(snap(e.x), snap(e.y), snap(e.z)));
      c.group.updateMatrix();
    }
  }

  function rebuildFromEngine() {
    // Rebuild every cubelet mesh from the logical engine state. The plastic
    // body is symmetric, so only sticker positions (current dirs) matter —
    // this reproduces ANY state, solved or scanned, with no animation.
    const scene = sceneRef.current;
    if (!scene) return;
    // Remove existing (dispose only sticker materials; shared geos/mats are reused)
    for (const c of cubiesRef.current) {
      c.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          const m = mesh.material as THREE.Material;
          if (m && m !== sharedRef.current?.plasticMat && !isSharedMaterial(m)) m.dispose();
        }
      });
      scene.remove(c.group);
    }
    cubiesRef.current = [];
    const shared = sharedRef.current;
    const plasticGeo = shared?.plasticGeo ?? new RoundedBoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE, 3, 0.09);
    const plasticMat = (shared?.plasticMat as THREE.Material) ?? new THREE.MeshStandardMaterial({ color: new THREE.Color('#15181e'), roughness: 0.42, metalness: 0.08 });
    const stickerGeo = shared?.stickerGeo ?? new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE);
    if (!shared) sharedRef.current = { plasticGeo, stickerGeo, plasticMat };
    for (const cb of cubeEngine.cubies) {
      const group = new THREE.Group();
      group.position.set(cb.pos[0] * SPACING, cb.pos[1] * SPACING, cb.pos[2] * SPACING);
      group.quaternion.identity();
      const plastic = new THREE.Mesh(plasticGeo, plasticMat);
      group.add(plastic);
      for (const st of cb.stickers) {
        const d = st.dir;
        const face = st.color as Face;
        const mat = stickerMat(face);
        const sticker = new THREE.Mesh(stickerGeo, mat);
        const offset = 0.481;
        sticker.position.set(d[0] * offset, d[1] * offset, d[2] * offset);
        if (d[0] !== 0) sticker.rotation.y = (d[0] === 1 ? 1 : -1) * Math.PI / 2;
        else if (d[1] !== 0) sticker.rotation.x = d[1] === 1 ? -Math.PI / 2 : Math.PI / 2;
        else if (d[2] === -1) sticker.rotation.y = Math.PI;
        group.add(sticker);
      }
      scene.add(group);
      cubiesRef.current.push({ group });
    }
  }

  async function processQueue(): Promise<void> {
    if (animatingRef.current) return;
    const scene = sceneRef.current;
    if (!scene) return;
    animatingRef.current = true;
    useCubeStore.getState().setAnimating(true);
    while (queueRef.current.length > 0) {
      const move = queueRef.current.shift()!;
      try {
        await animateMove(move);
      } catch {
        /* ignore single-move failure */
      }
      useCubeStore.getState().notifyMoveAnimated(move);
    }
    animatingRef.current = false;
    useCubeStore.getState().setAnimating(false);
  }

  function animateMove(move: string): Promise<void> {
    return new Promise((resolve) => {
      const scene = sceneRef.current;
      if (!scene) return resolve();
      let parsed;
      try {
        parsed = parseMove(move);
      } catch {
        return resolve();
      }
      const { axis, layer, quarter } = parsed;
      const target = (quarter * Math.PI) / 2;

      // select layer meshes by visual position
      const eps = 0.15;
      const selected = cubiesRef.current.filter((c) => {
        const p = c.group.position;
        const v = axis === 'x' ? p.x : axis === 'y' ? p.y : p.z;
        if (layer === 'all') return true;
        return Math.abs(v - (layer as number) * SPACING) < eps;
      });

      const speed = useCubeStore.getState().settings.animationSpeed;
      const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      let duration = 240 / Math.max(0.25, speed);
      if (Math.abs(quarter) === 2) duration *= 1.35;
      if (reduced) duration = 0;

      if (duration <= 0) {
        // instant
        const pivot = new THREE.Group();
        scene.add(pivot);
        pivot.updateMatrixWorld(true);
        for (const c of selected) pivot.attach(c.group);
        pivot.rotation[axis] = target;
        pivot.updateMatrixWorld(true);
        for (const c of selected) scene.attach(c.group);
        scene.remove(pivot);
        snapAllToGrid();
        return resolve();
      }

      const pivot = new THREE.Group();
      scene.add(pivot);
      pivot.updateMatrixWorld(true);
      for (const c of selected) pivot.attach(c.group);

      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const e = easeInOutCubic(t);
        pivot.rotation[axis] = target * e;
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          pivot.updateMatrixWorld(true);
          for (const c of selected) scene.attach(c.group);
          scene.remove(pivot);
          snapAllToGrid();
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  const resetCamera = () => {
    const cam = cameraRef.current;
    const ctl = controlsRef.current;
    if (!cam || !ctl) return;
    cam.position.set(5.2, 4.4, 6.4);
    ctl.target.set(0, 0, 0);
    ctl.update();
    setCameraTick((t) => t + 1);
  };

  const zoom = (dir: 1 | -1) => {
    const cam = cameraRef.current;
    const ctl = controlsRef.current;
    if (!cam || !ctl) return;
    const factor = dir === 1 ? 0.9 : 1.1;
    const next = THREE.MathUtils.clamp(cam.position.distanceTo(ctl.target) * factor, ctl.minDistance, ctl.maxDistance);
    const v = cam.position.clone().sub(ctl.target).normalize().multiplyScalar(next);
    cam.position.copy(ctl.target).add(v);
    ctl.update();
  };

  if (webglError) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">3D unavailable</p>
          <p className="mt-1 text-sm text-neutral-500">{webglError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cube-canvas-container relative h-full w-full overflow-hidden rounded-lg border border-neutral-200 bg-[#f4f5f7] dark:border-neutral-800 dark:bg-[#0e1116]">
      <div ref={containerRef} className="absolute inset-0" aria-label="Interactive 3D Rubik's Cube. Drag to orbit, scroll to zoom." role="application" />
      {/* camera toolbar */}
      <div className="absolute right-3 top-3 flex gap-1.5">
        <button onClick={() => zoom(1)} aria-label="Zoom in" className="h-8 w-8 rounded-md border border-neutral-200 bg-white text-sm text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800">+</button>
        <button onClick={() => zoom(-1)} aria-label="Zoom out" className="h-8 w-8 rounded-md border border-neutral-200 bg-white text-sm text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800">−</button>
        <button onClick={resetCamera} aria-label="Reset camera" className="h-8 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800">Reset view</button>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-white/80 px-2 py-1 text-[11px] text-neutral-500 backdrop-blur dark:bg-black/40 dark:text-neutral-400">
        Drag to orbit · Scroll / pinch to zoom
      </div>
      <span className="hidden">{cameraTick}</span>
    </div>
  );
}
