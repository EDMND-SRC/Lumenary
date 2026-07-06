import { gsap } from 'gsap';
import { LumenaryWebGPUContext } from './core/LumenaryWebGPUContext';
import { LumenaryCamera } from './core/LumenaryCamera';
import { AssetManager } from './core/AssetManager';
import { CollisionSystem } from './core/CollisionSystem';
import { RoomManager } from './scene/RoomManager';
import { SpatialAudioSystem } from './audio/SpatialAudioSystem';
import { LODSystem } from './systems/LODSystem';
import { ProgressiveLoader } from './systems/ProgressiveLoader';
import {
  MARUAPULA_ROOMS,
  MARUAPULA_TRANSITIONS,
} from './scene/property_data';
import { LUMENARY_SCENES, type LumenaryScene } from './config/scenes';
import { AuthScreen, type AuthUser } from './ui/AuthScreen';
import { MapSceneSelector } from './ui/MapSceneSelector';

const MAX_SPLAT_COUNT = 2_000_000;

let engine: LumenaryWebGPUContext | null = null;
let camera: LumenaryCamera | null = null;
let assetManager: AssetManager | null = null;
let collisionSystem: CollisionSystem | null = null;
let roomManager: RoomManager | null = null;
let audioSystem: SpatialAudioSystem | null = null;
let lodSystem: LODSystem | null = null;
let progressiveLoader: ProgressiveLoader | null = null;
let activeScene: LumenaryScene | null = null;
let animationFrameId: number | null = null;
let lastFrameTime = 0;
let frameCount = 0;
let mapSelector: MapSceneSelector | null = null;

const screens = ['loading-screen', 'auth-screen', 'map-screen', 'viewer-screen'];

function showScreen(screenId: string): void {
  screens.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    gsap.killTweensOf(el);
    gsap.killTweensOf(el.querySelectorAll('*'));
    el.style.removeProperty('opacity');
    el.style.removeProperty('pointer-events');
    el.classList.remove('visible');
    el.classList.add('hidden');
  });
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('visible');
  }
}

function updateHUD(fps: number, splatCount: number): void {
  const fpsEl = document.getElementById('hud-fps');
  const splatsEl = document.getElementById('hud-splats');
  const sceneEl = document.getElementById('hud-scene');
  if (fpsEl) fpsEl.textContent = fps.toFixed(0);
  if (splatsEl) splatsEl.textContent = splatCount.toLocaleString();
  if (sceneEl && activeScene) sceneEl.textContent = activeScene.name;
}

async function initializeEngine(): Promise<boolean> {
  const progressFill = document.getElementById('progress-fill');
  const percentText = document.getElementById('loading-percent');
  const statusText = document.getElementById('loading-status');

  if (progressFill) progressFill.style.width = '10%';
  if (percentText) percentText.textContent = '10.0%';
  if (statusText) statusText.textContent = 'Initializing WebGPU...';

  engine = new LumenaryWebGPUContext({
    canvasElementId: 'lumenary-canvas',
    maxSplatCount: MAX_SPLAT_COUNT,
  });

  const hardwareReady = await engine.initializeHardwarePipeline();
  if (!hardwareReady) {
    console.error('[Lumenary Core] WebGPU not available.');
    return false;
  }

  if (progressFill) progressFill.style.width = '30%';
  if (percentText) percentText.textContent = '30.0%';
  if (statusText) statusText.textContent = 'WebGPU engine ready.';
  return true;
}

async function loadScene(scene: LumenaryScene): Promise<void> {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  activeScene = scene;
  showScreen('viewer-screen');
  updateHUD(0, 0);

  const loadingEl = document.getElementById('loading-screen')!;
  loadingEl.classList.remove('hidden');
  loadingEl.classList.add('visible');

  const progressFill = document.getElementById('progress-fill');
  const percentText = document.getElementById('loading-percent');
  const statusText = document.getElementById('loading-status');

  function setProgress(pct: number, msg: string) {
    if (progressFill) progressFill.style.width = `${pct * 100}%`;
    if (percentText) percentText.textContent = `${(pct * 100).toFixed(1)}%`;
    if (statusText) statusText.textContent = msg;
  }

  setProgress(0.05, `Loading ${scene.name}...`);

  if (!engine) {
    const ok = await initializeEngine();
    if (!ok) {
      setProgress(1, 'WebGPU initialization failed.');
      setTimeout(() => {
        loadingEl.classList.remove('visible');
        loadingEl.classList.add('hidden');
        showScreen('map-screen');
      }, 1500);
      return;
    }
  }

  camera = new LumenaryCamera(
    {
      moveSpeed: 5.0,
      lookSensitivity: 0.002,
      interpolationFactor: 0.12,
      orbitMinDistance: 1.0,
      orbitMaxDistance: 30.0,
    },
    engine!.getCanvas()
  );

  assetManager = new AssetManager(engine!.getDevice());
  collisionSystem = new CollisionSystem(0.15, -0.5, 1.7);
  roomManager = new RoomManager();
  audioSystem = new SpatialAudioSystem();
  lodSystem = new LODSystem();
  progressiveLoader = new ProgressiveLoader(assetManager, engine!, 0.1, 100_000);

  roomManager.loadProperty(MARUAPULA_ROOMS, MARUAPULA_TRANSITIONS);
  collisionSystem.loadRooms(MARUAPULA_ROOMS);

  camera.setPosition(scene.defaultCamera.position);
  camera.setTarget(scene.defaultCamera.target);

  const initialPos: [number, number, number] = [...scene.defaultCamera.position];
  collisionSystem.resolvePosition(initialPos, initialPos, 0);

  setProgress(0.2, 'Streaming splat data...');

  try {
    await progressiveLoader.load(scene.plyUrl, (state) => {
      const pct = 0.2 + state.progress * 0.7;
      setProgress(
        pct,
        `${state.phase}: ${(state.progress * 100).toFixed(0)}% (${state.loadedSplats.toLocaleString()} splats)`
      );
    });
  } catch (err) {
    console.error('[Lumenary Core] Failed to load PLY:', err);
    setProgress(1, 'Failed to load 3D data.');
    setTimeout(() => {
      loadingEl.classList.remove('visible');
      loadingEl.classList.add('hidden');
      showScreen('map-screen');
    }, 1500);
    return;
  }

  setProgress(0.95, 'Initializing audio...');
  let audioInitialized = false;
  const initAudioOnInteraction = async (): Promise<void> => {
    if (audioInitialized) return;
    audioInitialized = true;
    const success = await audioSystem!.initialize();
    if (success) {
      for (const room of MARUAPULA_ROOMS) {
        await audioSystem!.loadRoomAudio(room);
      }
    }
  };
  document.addEventListener('pointerlockchange', () => initAudioOnInteraction(), { once: false });

  setProgress(1, 'Ready.');
  setTimeout(() => {
    loadingEl.classList.remove('visible');
    loadingEl.classList.add('hidden');
  }, 500);

  lastFrameTime = 0;
  frameCount = 0;

  function animationLoop(timestamp: number): void {
    const deltaTime = lastFrameTime === 0 ? 0 : (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    camera!.update(deltaTime);

    const currentPos: [number, number, number] = [
      camera!.getPosition()[0],
      camera!.getPosition()[1],
      camera!.getPosition()[2],
    ];
    const resolvedPos = collisionSystem!.resolvePosition(
      initialPos,
      currentPos,
      deltaTime
    );

    if (
      resolvedPos[0] !== currentPos[0] ||
      resolvedPos[1] !== currentPos[1] ||
      resolvedPos[2] !== currentPos[2]
    ) {
      camera!.setPosition(resolvedPos);
    }

    const target = camera!.getTarget();
    engine!.updateViewMatrix(
      [resolvedPos[0], resolvedPos[1], resolvedPos[2]],
      [target[0], target[1], target[2]]
    );

    const newRoomId = roomManager!.updateActiveRoom(resolvedPos, collisionSystem!);
    if (newRoomId) {
      audioSystem!.setActiveRoom(newRoomId);
    }

    audioSystem!.update([resolvedPos[0], resolvedPos[1], resolvedPos[2]]);

    const lod = lodSystem!.update(deltaTime);
    engine!.renderFrame(deltaTime, lod.splatCount);

    frameCount++;
    if (frameCount % 30 === 0) {
      updateHUD(lod.fps, lod.splatCount);
    }

    animationFrameId = requestAnimationFrame(animationLoop);
  }

  animationFrameId = requestAnimationFrame(animationLoop);
}

function goToMap(user: AuthUser): void {
  console.log('[Lumenary Auth] User:', user.displayName || 'Guest');

  const nameEl = document.getElementById('user-display-name');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = user.displayName || 'Guest';
  if (avatarEl) {
    avatarEl.textContent = (user.displayName || 'G')[0].toUpperCase();
  }

  showScreen('map-screen');

  try {
    mapSelector = new MapSceneSelector(
      document.getElementById('map-screen') as HTMLDivElement,
      LUMENARY_SCENES,
      (scene: LumenaryScene) => {
        if (mapSelector) mapSelector.hide();
        loadScene(scene);
      }
    );
  } catch (err) {
    console.error('[Lumenary] MapSceneSelector init failed:', err);
  }
}

function setupBackButton(): void {
  const backBtn = document.getElementById('back-to-map-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      activeScene = null;
      if (mapSelector) {
        mapSelector.destroy();
        mapSelector = null;
      }
      showScreen('map-screen');
      try {
        mapSelector = new MapSceneSelector(
          document.getElementById('map-screen') as HTMLDivElement,
          LUMENARY_SCENES,
          (scene: LumenaryScene) => {
            if (mapSelector) mapSelector.hide();
            loadScene(scene);
          }
        );
      } catch (err) {
        console.error('[Lumenary] MapSceneSelector reinit failed:', err);
      }
    });
  }
}

async function bootstrap(): Promise<void> {
  showScreen('loading-screen');

  const progressFill = document.getElementById('progress-fill');
  const percentText = document.getElementById('loading-percent');
  const statusText = document.getElementById('loading-status');
  if (progressFill) progressFill.style.width = '5%';
  if (percentText) percentText.textContent = '5.0%';
  if (statusText) statusText.textContent = 'Starting Lumenary...';

  let engineReady = false;
  try {
    engineReady = await initializeEngine();
  } catch (err) {
    console.warn('[Lumenary] WebGPU init failed, continuing without 3D:', err);
  }

  if (progressFill) progressFill.style.width = '100%';
  if (percentText) percentText.textContent = '100.0%';
  if (statusText) statusText.textContent = engineReady ? 'Ready.' : 'No WebGPU — map mode only.';

  setupBackButton();

  const authScreen = new AuthScreen(
    document.getElementById('auth-screen') as HTMLDivElement,
    (user: AuthUser) => {
      console.log('[Lumenary Auth] User:', user.displayName || 'Guest', `(${user.provider})`);
      goToMap(user);
    }
  );

  setTimeout(() => {
    showScreen('auth-screen');
    authScreen.show();
  }, 800);
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrap().catch((err) => {
    console.error('[Lumenary Core] Fatal initialization failure:', err);
    const statusText = document.getElementById('loading-status');
    if (statusText) statusText.textContent = 'Initialization failed. Please refresh.';
  });
});
