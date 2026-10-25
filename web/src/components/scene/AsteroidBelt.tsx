import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  SCENE_SCALE_AU,
  ASTEROID_BELT_INNER_AU,
  ASTEROID_BELT_OUTER_AU,
  CERES_SEMI_MAJOR_AXIS_AU
} from '../../config';
import { eclipticToScene } from '../../coords';
import { useSimStore } from '../../store/sim';

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function AsteroidBelt() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const focusBody = useSimStore((s) => s.focusBody);
  const ceresPos = eclipticToScene([CERES_SEMI_MAJOR_AXIS_AU, 0, 0], [0, 0, 0], SCENE_SCALE_AU);

  useEffect(() => {
    if (!meshRef.current) return;
    const asteroidCount = 2500;
    const prng = mulberry32(42);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < asteroidCount; i++) {
      const r_min_sq = ASTEROID_BELT_INNER_AU * ASTEROID_BELT_INNER_AU;
      const r_max_sq = ASTEROID_BELT_OUTER_AU * ASTEROID_BELT_OUTER_AU;
      const r_au = Math.sqrt(r_min_sq + prng() * (r_max_sq - r_min_sq));
      const theta = prng() * 2.0 * Math.PI;
      const z_au = (prng() - 0.5) * 0.12;

      const pos = eclipticToScene([r_au * Math.cos(theta), r_au * Math.sin(theta), z_au], [0, 0, 0], SCENE_SCALE_AU);
      dummy.position.set(pos[0], pos[1], pos[2]);
      dummy.rotation.set(prng() * Math.PI, prng() * Math.PI, 0);
      const scale = 0.4 + prng() * 1.4;
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();

      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.003; // Slow realistic orbital drift
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, 2500]}
        onClick={(e) => {
          e.stopPropagation();
          focusBody('AsteroidBelt');
        }}
      >
        <dodecahedronGeometry args={[0.04, 0]} />
        <meshStandardMaterial color={0x887766} roughness={0.9} metalness={0.1} />
      </instancedMesh>

      <group
        position={[ceresPos[0], ceresPos[1], ceresPos[2]]}
        onClick={(e) => {
          e.stopPropagation();
          focusBody('AsteroidBelt');
        }}
      >
        <mesh>
          <sphereGeometry args={[0.14, 16, 16]} />
          <meshBasicMaterial color={0xffaa00} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.22, 0.28, 24]} />
          <meshBasicMaterial color={0xffca28} side={THREE.DoubleSide} transparent opacity={0.7} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
