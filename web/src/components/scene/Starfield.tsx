import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Starfield() {
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);

  const prefersReducedMotion = useMemo(() => {
    return typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  }, []);

  // Sparse, small starfield: points only (no texture, no glow, no nebula colors)
  const starGeometry = useMemo(() => {
    const starCount = 1800; // Small, sparse count
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const prng = mulberry32(4242);

    for (let i = 0; i < starCount; i++) {
      const u = prng();
      const v = prng();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const radius = 700.0 + prng() * 500.0;

      positions[i * 3 + 0] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame((state) => {
    // Subtle star twinkle
    if (!prefersReducedMotion && matRef.current) {
      const t = state.clock.getElapsedTime();
      matRef.current.opacity = 0.70 + 0.20 * Math.sin(t * 1.2);
    }
  });

  return (
    <points ref={pointsRef} geometry={starGeometry}>
      <pointsMaterial
        ref={matRef}
        color={0xd7dae0}
        size={1.2}
        sizeAttenuation={false}
        transparent
        opacity={0.80}
        depthTest
        depthWrite={false}
      />
    </points>
  );
}
