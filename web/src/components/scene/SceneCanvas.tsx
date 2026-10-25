import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ComponentRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';

type ControlsRef = ComponentRef<typeof OrbitControls>;
import { useSimStore } from '../../store/sim';
import { YEAR_SECONDS, SCENE_SCALE_AU, MOON_ROTATION_PERIOD_SECONDS } from '../../config';
import { eclipticToScene } from '../../coords';
import { interpolateFrame, activeSimState } from '../../interpolation';
import { computeHudAnalytics } from '../../hud';
import { BODIES } from '../../data/bodies';
import { Starfield } from './Starfield';
import { OrbitRings } from './OrbitRings';
import { AsteroidBelt } from './AsteroidBelt';
import { Planets } from './Planets';
import { CeresTug } from './CeresTug';
import { ClimateMirror } from './ClimateMirror';
import { PlanetLabels } from './PlanetLabels';


// Smooth cubic ease-in-out easing function
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Compute world position of a body at current time
function getBodyWorldPosition(
  bodyKey: string,
  currentFrame: any,
  currentYear: number,
  fallbackTarget?: THREE.Vector3
): THREE.Vector3 {
  if (bodyKey === 'freeform') {
    return fallbackTarget ? fallbackTarget.clone() : new THREE.Vector3(0, 0, 0);
  }

  if (bodyKey === 'system' || bodyKey === 'Sun') {
    return new THREE.Vector3(0, 0, 0);
  }

  const earth = currentFrame.bodies?.['Earth'];
  if (!earth) return new THREE.Vector3(0, 0, 0);
  const earthScene = eclipticToScene([earth.x, earth.y, earth.z], [0, 0, 0], SCENE_SCALE_AU);

  if (bodyKey === 'Earth') {
    return new THREE.Vector3(...earthScene);
  }

  if (bodyKey === 'Moon') {
    const simTime_s = currentFrame.time_s ?? (currentYear * YEAR_SECONDS);
    const lunarAngle = (2.0 * Math.PI * simTime_s) / MOON_ROTATION_PERIOD_SECONDS;
    const lunarDist = 0.92;
    return new THREE.Vector3(
      earthScene[0] + Math.cos(lunarAngle) * lunarDist,
      earthScene[1] + Math.sin(lunarAngle) * 0.089 * lunarDist,
      earthScene[2] + Math.sin(lunarAngle) * lunarDist
    );
  }

  if (bodyKey === 'Tug') {
    let dir = new THREE.Vector3();
    const tugData = currentFrame.bodies?.['Tug'];
    if (tugData) {
      const tugRaw = eclipticToScene([tugData.x, tugData.y, tugData.z], [0, 0, 0], SCENE_SCALE_AU);
      dir.set(tugRaw[0] - earthScene[0], tugRaw[1] - earthScene[1], tugRaw[2] - earthScene[2]);
    }
    if (dir.lengthSq() < 1e-6) {
      const vScene = eclipticToScene([earth.vx, earth.vy, earth.vz], [0, 0, 0], 1.0);
      dir.set(vScene[0], vScene[1], vScene[2]);
    }
    dir.normalize();
    return new THREE.Vector3(earthScene[0], earthScene[1], earthScene[2]).addScaledVector(dir, 1.4);
  }

  if (bodyKey === 'AsteroidBelt') {
    return new THREE.Vector3(2.7 * SCENE_SCALE_AU, 0, 0);
  }

  const data = BODIES[bodyKey];
  if (data) {
    const rScene = data.orbitAu * SCENE_SCALE_AU;
    const theta = (currentYear / data.periodYr) * 2 * Math.PI;
    return new THREE.Vector3(
      rScene * Math.cos(theta),
      0,
      -rScene * Math.sin(theta)
    );
  }

  return new THREE.Vector3(0, 0, 0);
}

// Standoff offsets and zoom limits tailored per body
function getBodyViewParams(bodyKey: string): {
  offset: THREE.Vector3;
  minDist: number;
  maxDist: number;
} {
  switch (bodyKey) {
    case 'system':
      return { offset: new THREE.Vector3(0, 52, 62), minDist: 5.0, maxDist: 1800 };
    case 'freeform':
      return { offset: new THREE.Vector3(0, 0, 0), minDist: 0.1, maxDist: 3000 };
    case 'Sun':
      return { offset: new THREE.Vector3(0, 4.5, 7.5), minDist: 3.2, maxDist: 150 };
    case 'Earth':
      return { offset: new THREE.Vector3(1.4, 0.9, 1.8), minDist: 0.8, maxDist: 40 };
    case 'Moon':
      return { offset: new THREE.Vector3(0.35, 0.22, 0.45), minDist: 0.15, maxDist: 15 };
    case 'Tug':
      return { offset: new THREE.Vector3(0.55, 0.35, 0.65), minDist: 0.20, maxDist: 20 };
    case 'Mercury':
      return { offset: new THREE.Vector3(0.7, 0.5, 0.9), minDist: 0.4, maxDist: 25 };
    case 'Venus':
      return { offset: new THREE.Vector3(1.1, 0.7, 1.4), minDist: 0.6, maxDist: 35 };
    case 'Mars':
      return { offset: new THREE.Vector3(0.9, 0.6, 1.2), minDist: 0.5, maxDist: 30 };
    case 'Jupiter':
      return { offset: new THREE.Vector3(3.2, 2.0, 4.2), minDist: 1.8, maxDist: 90 };
    case 'Saturn':
      return { offset: new THREE.Vector3(3.2, 2.2, 4.5), minDist: 2.0, maxDist: 90 };
    case 'Uranus':
      return { offset: new THREE.Vector3(2.0, 1.4, 2.8), minDist: 1.2, maxDist: 70 };
    case 'Neptune':
      return { offset: new THREE.Vector3(2.0, 1.4, 2.8), minDist: 1.2, maxDist: 70 };
    case 'AsteroidBelt':
      return { offset: new THREE.Vector3(15, 12, 18), minDist: 3.0, maxDist: 300 };
    default:
      return { offset: new THREE.Vector3(2.0, 1.5, 2.5), minDist: 1.0, maxDist: 50 };
  }
}

function SimController({ controlsRef }: { controlsRef: React.RefObject<ControlsRef | null> }) {
  const { camera, scene } = useThree();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__threeScene = scene;
      (window as any).THREE = THREE;
    }
  }, [scene]);

  const isPlaying = useSimStore((s) => s.isPlaying);

  const targetPlaybackSpeed = useSimStore((s) => s.playbackSpeed);
  const currentTimeSec = useSimStore((s) => s.currentTimeSec);
  const cameraFocus = useSimStore((s) => s.cameraFocus);
  const frames = useSimStore((s) => s.replayData.frames);
  const updateHudAnalytics = useSimStore((s) => s.updateHudAnalytics);
  const setIsPlaying = useSimStore((s) => s.setIsPlaying);
  const zoomAction = useSimStore((s) => s.zoomAction);

  const simTimeRef = useRef(currentTimeSec);
  const currentSpeedRef = useRef(targetPlaybackSpeed);
  const lastHudUpdateRef = useRef(0);
  const lastHandledZoomRef = useRef(0);
  const userInteractingRef = useRef(false);
  const activeKeysRef = useRef<Set<string>>(new Set());
  const prevBodyPosRef = useRef<THREE.Vector3 | null>(null);
  const controlsInitializedRef = useRef(false);
  const maxTime = frames[frames.length - 1].time_s;

  const prefersReducedMotion = useMemo(() => {
    return typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  }, []);

  // Listen to keyboard controls (WASD, Arrow keys, Q/E) for smooth fly/pan navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const code = e.code;
      if (
        code === 'KeyW' || code === 'KeyS' || code === 'KeyA' || code === 'KeyD' ||
        code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight' ||
        code === 'KeyQ' || code === 'KeyE'
      ) {
        activeKeysRef.current.add(code);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      activeKeysRef.current.delete(e.code);
    };

    const onBlur = () => {
      activeKeysRef.current.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Camera transition state: allows smooth 1.2s ease-in-out with interruption blending
  const transitionRef = useRef<{
    active: boolean;
    startTime: number;
    duration: number;
    startCamPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    targetBody: string;
  }>({
    active: false,
    startTime: 0,
    duration: prefersReducedMotion ? 0.35 : 1.2,
    startCamPos: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    targetBody: cameraFocus
  });

  const lastFocusRef = useRef(cameraFocus);

  // When camera focus changes, initiate smooth 1.2s ease-in-out transition
  useEffect(() => {
    if (cameraFocus !== lastFocusRef.current) {
      lastFocusRef.current = cameraFocus;

      if (cameraFocus === 'freeform') {
        transitionRef.current.targetBody = 'freeform';
        return;
      }

      const duration = prefersReducedMotion ? 0.35 : 1.2;
      const startCam = camera.position.clone();
      const startTgt = controlsRef.current ? controlsRef.current.target.clone() : new THREE.Vector3();

      prevBodyPosRef.current = null;
      transitionRef.current = {
        active: true,
        startTime: -1, // will set on next frame with clock
        duration,
        startCamPos: startCam,
        startTarget: startTgt,
        targetBody: cameraFocus
      };

      // Set zoom limits for controls
      if (controlsRef.current) {
        const { minDist, maxDist } = getBodyViewParams(cameraFocus);
        controlsRef.current.minDistance = minDist;
        controlsRef.current.maxDistance = maxDist;
      }
    }
  }, [cameraFocus, camera, controlsRef, prefersReducedMotion]);

  useEffect(() => {
    simTimeRef.current = currentTimeSec;
  }, [currentTimeSec]);

  useFrame((state, delta) => {
    // Check if document is hidden to pause rendering updates
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    const now = state.clock.getElapsedTime();

    // Smooth time-scale ramping
    currentSpeedRef.current = THREE.MathUtils.lerp(
      currentSpeedRef.current,
      targetPlaybackSpeed,
      Math.min(1.0, delta * 6.0)
    );

    // Timeline tick
    if (isPlaying) {
      simTimeRef.current += delta * currentSpeedRef.current * YEAR_SECONDS;
      if (simTimeRef.current >= maxTime) {
        simTimeRef.current = maxTime;
        setIsPlaying(false);
      }
    }

    // 60 Hz continuous frame evaluation for silky smooth 3D rendering
    const continuousFrame = interpolateFrame(frames, simTimeRef.current);
    activeSimState.time_s = simTimeRef.current;
    activeSimState.year = simTimeRef.current / YEAR_SECONDS;
    activeSimState.frame = continuousFrame;

    // Direct DOM update at 60 Hz for continuous rolling year readout without React render lag
    const maxYear = maxTime / YEAR_SECONDS;
    const timePrimaryEl = document.getElementById('time-primary');
    if (timePrimaryEl) {
      timePrimaryEl.textContent = `Year ${activeSimState.year.toFixed(2)} / ${maxYear.toFixed(2)}`;
    }
    const timeSecondaryEl = document.getElementById('time-secondary');
    if (timeSecondaryEl) {
      const totalFrames = frames.length;
      const frameIdx = Math.min(
        totalFrames,
        Math.max(1, Math.floor((simTimeRef.current / maxTime) * (totalFrames - 1)) + 1)
      );
      timeSecondaryEl.textContent = `Frame ${frameIdx} / ${totalFrames} | ${(simTimeRef.current / 1e9).toFixed(1)} Gs`;
    }
    const scrubberEl = document.getElementById('timeline-scrubber') as HTMLInputElement | null;
    if (scrubberEl && document.activeElement !== scrubberEl) {
      scrubberEl.value = String(simTimeRef.current);
    }

    // Throttled HUD telemetry updates (10 Hz = 0.1s)
    if (now - lastHudUpdateRef.current >= 0.1) {
      lastHudUpdateRef.current = now;
      const analytics = computeHudAnalytics(continuousFrame);
      updateHudAnalytics(analytics, simTimeRef.current, continuousFrame);
    }

    // Floating Zoom Button actions (+, -, Reset)
    if (zoomAction.timestamp > lastHandledZoomRef.current) {
      lastHandledZoomRef.current = zoomAction.timestamp;
      if (controlsRef.current) {
        if (zoomAction.type === 'in') {
          camera.position.sub(controlsRef.current.target).multiplyScalar(0.78).add(controlsRef.current.target);
        } else if (zoomAction.type === 'out') {
          camera.position.sub(controlsRef.current.target).multiplyScalar(1.28).add(controlsRef.current.target);
        }
      }
    }

    const trans = transitionRef.current;

    // Attach OrbitControls listeners on the first frame where controlsRef.current is mounted
    if (controlsRef.current && !controlsInitializedRef.current) {
      controlsInitializedRef.current = true;
      controlsRef.current.addEventListener('start', () => {
        userInteractingRef.current = true;
        transitionRef.current.active = false;
      });
      controlsRef.current.addEventListener('end', () => {
        userInteractingRef.current = false;
        const currentTrans = transitionRef.current;
        if (controlsRef.current && currentTrans.targetBody !== 'system' && currentTrans.targetBody !== 'freeform') {
          const continuousFrame = activeSimState.frame || frames[0];
          const targetPos = getBodyWorldPosition(currentTrans.targetBody, continuousFrame, activeSimState.year);
          if (controlsRef.current.target.distanceTo(targetPos) > 1.2) {
            currentTrans.targetBody = 'freeform';
            useSimStore.getState().setCameraFocus('freeform');
          }
        }
      });
    }

    // 1. Interactive Keyboard Fly / Pan Navigation (WASD, Arrow keys, Q/E)
    const keys = activeKeysRef.current;
    if (keys.size > 0) {
      trans.active = false;
      if (trans.targetBody !== 'freeform') {
        trans.targetBody = 'freeform';
        useSimStore.getState().setCameraFocus('freeform');
      }

      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const camRight = new THREE.Vector3().crossVectors(camDir, camera.up).normalize();
      const camUp = new THREE.Vector3().crossVectors(camRight, camDir).normalize();

      const moveDir = new THREE.Vector3();
      if (keys.has('KeyW') || keys.has('ArrowUp')) moveDir.add(camUp);
      if (keys.has('KeyS') || keys.has('ArrowDown')) moveDir.sub(camUp);
      if (keys.has('KeyD') || keys.has('ArrowRight')) moveDir.add(camRight);
      if (keys.has('KeyA') || keys.has('ArrowLeft')) moveDir.sub(camRight);
      if (keys.has('KeyE')) moveDir.add(camDir);
      if (keys.has('KeyQ')) moveDir.sub(camDir);

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        const dist = controlsRef.current
          ? camera.position.distanceTo(controlsRef.current.target)
          : 15.0;
        const panSpeed = Math.max(1.5, Math.min(dist * 0.85, 80.0)) * delta;
        const moveVec = moveDir.multiplyScalar(panSpeed);
        camera.position.add(moveVec);
        if (controlsRef.current) {
          controlsRef.current.target.add(moveVec);
        }
      }
    }

    // 2. Camera Ease-In-Out & Continuous Body Tracking
    const targetPos = getBodyWorldPosition(trans.targetBody, continuousFrame, activeSimState.year, controlsRef.current?.target);
    const { offset } = getBodyViewParams(trans.targetBody);
    const desiredCamPos = targetPos.clone().add(offset);

    if (trans.active && trans.targetBody !== 'freeform') {
      if (trans.startTime < 0) {
        trans.startTime = now;
      }
      const elapsed = now - trans.startTime;
      const progress = Math.min(1.0, elapsed / trans.duration);
      const eased = easeInOutCubic(progress);

      if (controlsRef.current) {
        controlsRef.current.target.lerpVectors(trans.startTarget, targetPos, eased);
      }
      camera.position.lerpVectors(trans.startCamPos, desiredCamPos, eased);

      if (progress >= 1.0) {
        trans.active = false;
        prevBodyPosRef.current = targetPos.clone();
      }
    } else if (trans.targetBody !== 'system' && trans.targetBody !== 'freeform') {
      // Steady-state continuous tracking: translate camera and target by the moving body's displacement
      if (prevBodyPosRef.current) {
        const bodyDelta = targetPos.clone().sub(prevBodyPosRef.current);
        if (controlsRef.current && !userInteractingRef.current) {
          controlsRef.current.target.add(bodyDelta);
        }
        camera.position.add(bodyDelta);
      }
      prevBodyPosRef.current = targetPos.clone();
    }

    if (controlsRef.current) {
      controlsRef.current.update();
    }
  });

  return null;
}

function SolarLighting() {
  const lightRef = useRef<THREE.PointLight>(null);

  useEffect(() => {
    if (lightRef.current) {
      lightRef.current.decay = 0;
      lightRef.current.distance = 0;
      lightRef.current.shadow.bias = -0.0002;
      lightRef.current.shadow.radius = 2;
      lightRef.current.shadow.mapSize.width = 2048;
      lightRef.current.shadow.mapSize.height = 2048;
      lightRef.current.shadow.camera.near = 0.5;
      lightRef.current.shadow.camera.far = 2500;
    }
  }, []);

  return (
    <>
      <ambientLight color={0xdbeafe} intensity={0.18} />
      <pointLight
        ref={lightRef}
        args={[0xfff8ea, 6.5, 0, 0.0]}
        position={[0, 0, 0]}
        decay={0}
        distance={0}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-radius={2}
        shadow-camera-near={0.5}
        shadow-camera-far={2500}
      />
    </>
  );
}

export function SceneCanvas() {
  const controlsRef = useRef<ControlsRef>(null);

  // Cap pixel ratio at 2 for performance
  const pixelRatio = typeof window !== 'undefined'
    ? Math.min(window.devicePixelRatio || 1, 2)
    : 1;

  return (
    <Canvas
      shadows
      onCreated={({ gl }) => {
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFShadowMap;
      }}
      camera={{ position: [0, 52, 62], fov: 45, near: 0.1, far: 50000 }}
      dpr={pixelRatio}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%', background: '#0A0B0D' }}
    >
      <SolarLighting />

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.06}
        minDistance={0.15}
        maxDistance={2500}
      />

      <SimController controlsRef={controlsRef} />

      <Starfield />
      <OrbitRings />
      <AsteroidBelt />
      <Planets />
      <CeresTug />
      <ClimateMirror />
      <PlanetLabels />

      {/* Selective bloom for Sun & relativistic plasma plume glow */}
      <EffectComposer enableNormalPass={false} multisampling={0}>
        <Bloom
          luminanceThreshold={0.90}
          luminanceSmoothing={0.25}
          intensity={0.22}
        />
      </EffectComposer>
    </Canvas>
  );
}
