import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ComponentRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';

type ControlsRef = ComponentRef<typeof OrbitControls>;
import { useSimStore } from '../../store/sim';
import { YEAR_SECONDS, SCENE_SCALE_AU } from '../../config';
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
  currentYear: number
): THREE.Vector3 {
  if (bodyKey === 'system' || bodyKey === 'Sun') {
    return new THREE.Vector3(0, 0, 0);
  }

  const earth = currentFrame.bodies['Earth'];
  if (!earth) return new THREE.Vector3(0, 0, 0);
  const earthScene = eclipticToScene([earth.x, earth.y, earth.z], [0, 0, 0], SCENE_SCALE_AU);

  if (bodyKey === 'Earth') {
    return new THREE.Vector3(...earthScene);
  }

  if (bodyKey === 'Moon') {
    const moonAngle = currentYear * 13.37 * 2 * Math.PI;
    const moonDist = 1.1;
    return new THREE.Vector3(
      earthScene[0] + Math.cos(moonAngle) * moonDist,
      earthScene[1] + Math.sin(moonAngle * 0.5) * 0.15,
      earthScene[2] + Math.sin(moonAngle) * moonDist
    );
  }

  if (bodyKey === 'Tug') {
    const vx = earth.vx;
    const vy = earth.vy;
    const vLen = Math.hypot(vx, vy) || 1;
    const tangX = -vy / vLen;
    const tangZ = -vx / vLen;
    return new THREE.Vector3(
      earthScene[0] + tangX * 1.4,
      earthScene[1],
      earthScene[2] + tangZ * 1.4
    );
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
    case 'Sun':
      return { offset: new THREE.Vector3(0, 4.5, 7.5), minDist: 3.2, maxDist: 150 };
    case 'Earth':
      return { offset: new THREE.Vector3(1.4, 0.9, 1.8), minDist: 0.8, maxDist: 40 };
    case 'Moon':
      return { offset: new THREE.Vector3(0.5, 0.35, 0.65), minDist: 0.3, maxDist: 20 };
    case 'Tug':
      return { offset: new THREE.Vector3(0.9, 0.6, 1.2), minDist: 0.5, maxDist: 30 };
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
  const maxTime = frames[frames.length - 1].time_s;

  const prefersReducedMotion = useMemo(() => {
    return typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
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

      const duration = prefersReducedMotion ? 0.35 : 1.2;
      const startCam = camera.position.clone();
      const startTgt = controlsRef.current ? controlsRef.current.target.clone() : new THREE.Vector3();

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
      const totalFrames = frames.length - 1;
      const frameIdx = Math.min(totalFrames, Math.floor((simTimeRef.current / maxTime) * totalFrames));
      timeSecondaryEl.textContent = `Frame ${frameIdx} / ${totalFrames} | ${simTimeRef.current.toFixed(1)} s`;
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

    // Camera Ease-In-Out & Tracking Loop
    const trans = transitionRef.current;
    const targetPos = getBodyWorldPosition(trans.targetBody, continuousFrame, activeSimState.year);
    const { offset } = getBodyViewParams(trans.targetBody);
    const desiredCamPos = targetPos.clone().add(offset);

    if (trans.active) {
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
      }
    } else {
      // Steady-state continuous tracking
      if (controlsRef.current && trans.targetBody !== 'system') {
        const deltaMove = targetPos.clone().sub(controlsRef.current.target);
        controlsRef.current.target.copy(targetPos);
        camera.position.add(deltaMove);
      }
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
      <ambientLight color={0xdbeafe} intensity={0.22} />
      <pointLight
        ref={lightRef}
        args={[0xfff8ea, 18.0, 0, 0.0]}
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
        minDistance={0.5}
        maxDistance={1800}
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
          luminanceThreshold={0.88}
          luminanceSmoothing={0.2}
          intensity={0.4}
        />
      </EffectComposer>
    </Canvas>
  );
}
