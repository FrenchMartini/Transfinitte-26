import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSimStore } from '../../store/sim';
import {
  SCENE_SCALE_AU,
  TARGET_ORBIT_AU,
  MARS_ORBIT_AU,
  ASTEROID_BELT_INNER_AU,
  URANUS_ORBIT_AU,
  NEPTUNE_ORBIT_AU
} from '../../config';
import { activeSimState } from '../../interpolation';

const SEGMENTS = 256;

interface StaticRingDef {
  name: string;
  radiusAu: number;
  color: number;
  opacity: number;
}

const STATIC_RINGS: StaticRingDef[] = [
  { name: 'Mercury', radiusAu: 0.387, color: 0x94a3b8, opacity: 0.30 },
  { name: 'Venus', radiusAu: 0.723, color: 0xfde047, opacity: 0.32 },
  { name: 'Mars', radiusAu: MARS_ORBIT_AU, color: 0xf97316, opacity: 0.34 },
  { name: 'BeltEntry', radiusAu: ASTEROID_BELT_INNER_AU, color: 0xfbbf24, opacity: 0.35 },
  { name: 'TargetOrbit', radiusAu: TARGET_ORBIT_AU, color: 0xffb000, opacity: 0.70 },
  { name: 'Jupiter', radiusAu: 5.204, color: 0xd97706, opacity: 0.32 },
  { name: 'Saturn', radiusAu: 9.582, color: 0xeab308, opacity: 0.28 },
  { name: 'Uranus', radiusAu: URANUS_ORBIT_AU, color: 0x2dd4bf, opacity: 0.25 },
  { name: 'Neptune', radiusAu: NEPTUNE_ORBIT_AU, color: 0x3b82f6, opacity: 0.22 }
];

/**
 * Dev validation assertion: verifies that every vertex of the ring is strictly finite
 * and that zero vertices sit at (0,0,0).
 */
export function assertFiniteNonZeroRingVertices(positions: Float32Array, label: string) {
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(`[OrbitRings] Invalid non-finite vertex in ${label} at index ${i / 3}: (${x}, ${y}, ${z})`);
    }
    if (x === 0 && y === 0 && z === 0) {
      throw new Error(`[OrbitRings] Forbidden origin vertex (0,0,0) in ${label} at index ${i / 3}`);
    }
  }
}

function buildRingPositions(radiusScene: number): Float32Array {
  const positions = new Float32Array(SEGMENTS * 3);
  for (let i = 0; i < SEGMENTS; i++) {
    const theta = (i / SEGMENTS) * 2 * Math.PI;
    positions[i * 3 + 0] = radiusScene * Math.cos(theta);
    positions[i * 3 + 1] = 0.0;
    positions[i * 3 + 2] = radiusScene * Math.sin(theta);
  }
  return positions;
}

export function OrbitRings() {
  const showOrbits = useSimStore((s) => s.showOrbits);
  const lastEarthRadiusRef = useRef<number>(-1);

  // 1. Static Planet & Reference Rings (Closed Loops)
  const staticRingObjects = useMemo(() => {
    return STATIC_RINGS.map((ring) => {
      const rScene = ring.radiusAu * SCENE_SCALE_AU;
      const positions = buildRingPositions(rScene);

      if (import.meta.env.DEV) {
        assertFiniteNonZeroRingVertices(positions, ring.name);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const mat = new THREE.LineBasicMaterial({
        color: ring.color,
        transparent: true,
        opacity: ring.opacity,
        depthWrite: false
      });

      const lineLoop = new THREE.LineLoop(geo, mat);
      lineLoop.name = `orbitRing_${ring.name}`;
      return lineLoop;
    });
  }, []);

  // 2. Dynamic Earth Migration Orbit Ring (Single Closed Loop at Earth's Current a(t))
  const { earthGeo, earthLineLoop, earthPositions } = useMemo(() => {
    // Initial radius: 1.0 AU (10.0 scene units)
    const initialSceneR = 1.0 * SCENE_SCALE_AU;
    const positions = buildRingPositions(initialSceneR);

    if (import.meta.env.DEV) {
      assertFiniteNonZeroRingVertices(positions, 'EarthCurrentOrbit');
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.LineBasicMaterial({
      color: 0x38bdf8, // Cyan / Accent color for Earth's active orbit
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    });

    const loop = new THREE.LineLoop(geo, mat);
    loop.name = 'orbitRing_EarthCurrent';
    return { earthGeo: geo, earthLineLoop: loop, earthPositions: positions };
  }, []);

  // Redraw Earth's current orbit ring outward as Earth migrates
  useFrame(() => {
    if (!showOrbits) return;
    const currentFrame = activeSimState.frame || useSimStore.getState().currentFrame;
    const earth = currentFrame.bodies['Earth'];
    if (!earth) return;

    const currentRadiusAu = Math.hypot(earth.x, earth.y);
    const currentRadiusScene = currentRadiusAu * SCENE_SCALE_AU;

    if (Math.abs(currentRadiusScene - lastEarthRadiusRef.current) > 1e-4) {
      lastEarthRadiusRef.current = currentRadiusScene;

      for (let i = 0; i < SEGMENTS; i++) {
        const theta = (i / SEGMENTS) * 2 * Math.PI;
        earthPositions[i * 3 + 0] = currentRadiusScene * Math.cos(theta);
        earthPositions[i * 3 + 1] = 0.0;
        earthPositions[i * 3 + 2] = currentRadiusScene * Math.sin(theta);
      }

      if (import.meta.env.DEV) {
        assertFiniteNonZeroRingVertices(earthPositions, 'EarthCurrentOrbit_DynamicUpdate');
      }

      (earthGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
  });

  if (!showOrbits) return null;

  return (
    <group name="orbitRingsGroup">
      {/* Static planet and reference rings */}
      {staticRingObjects.map((obj, i) => (
        <primitive key={`static-ring-${i}`} object={obj} />
      ))}

      {/* Earth's active single migrating closed orbit ring */}
      <primitive object={earthLineLoop} />
    </group>
  );
}
