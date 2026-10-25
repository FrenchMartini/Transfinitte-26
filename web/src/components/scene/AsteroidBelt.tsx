import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  SCENE_SCALE_AU,
  ASTEROID_BELT_INNER_AU,
  ASTEROID_BELT_OUTER_AU
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

const COUNT_CRATERED = 1100;
const COUNT_FACETED = 900;
const COUNT_BILOBATE = 500;

export function AsteroidBelt() {
  const groupRef = useRef<THREE.Group>(null);
  const meshCrateredRef = useRef<THREE.InstancedMesh>(null);
  const meshFacetedRef = useRef<THREE.InstancedMesh>(null);
  const meshBilobateRef = useRef<THREE.InstancedMesh>(null);

  const focusBody = useSimStore((s) => s.focusBody);

  // 1. Morphological 3D Shape A: Cratered Chondrite Boulder (concave crater basins + rims)
  const crateredGeo = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(0.046, 2);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();

    // Two defined impact crater centers (normalized on unit sphere)
    const c1 = new THREE.Vector3(0.55, 0.65, 0.35).normalize();
    const c2 = new THREE.Vector3(-0.50, -0.45, 0.60).normalize();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const len = v.length();
      const nx = v.x / len;
      const ny = v.y / len;
      const nz = v.z / len;

      // Asymmetric triaxial base shape
      let disp = 1.0 + 0.12 * (nx * nx - ny * ny) - 0.06 * (nz * nz);
      // Rough terrain harmonics
      disp += 0.08 * Math.sin(nx * 5.0 + 0.4) * Math.cos(ny * 6.0) + 0.04 * Math.sin(nz * 8.0);

      // Crater 1: radius 0.52, depression + raised rim
      const d1 = Math.hypot(nx - c1.x, ny - c1.y, nz - c1.z);
      if (d1 < 0.52) {
        const u = d1 / 0.52;
        // Cosine depression with rim spike near u = 0.85
        const bowl = -0.18 * Math.cos(u * Math.PI * 0.5);
        const rim = u > 0.65 ? 0.08 * Math.sin(((u - 0.65) / 0.35) * Math.PI) : 0;
        disp += bowl + rim;
      }

      // Crater 2: radius 0.42, depression + rim
      const d2 = Math.hypot(nx - c2.x, ny - c2.y, nz - c2.z);
      if (d2 < 0.42) {
        const u = d2 / 0.42;
        const bowl = -0.15 * Math.cos(u * Math.PI * 0.5);
        const rim = u > 0.60 ? 0.06 * Math.sin(((u - 0.60) / 0.40) * Math.PI) : 0;
        disp += bowl + rim;
      }

      v.multiplyScalar(disp);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // 2. Morphological 3D Shape B: Cleaved Collisional Shard (sharp fracture planes & crystalline facets)
  const facetedGeo = useMemo(() => {
    const geo = new THREE.DodecahedronGeometry(0.044, 1);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const len = v.length();
      const nx = v.x / len;
      const ny = v.y / len;
      const nz = v.z / len;

      // Planar fracture plane simulating catastrophic collisional cleavage
      const cleavage = 0.14 * Math.sign(nx + ny * 0.7) * Math.pow(Math.abs(nx + ny * 0.7), 1.4);
      // Angular stepped ridges
      const stepped = 0.06 * Math.sin(nx * 9.0) * Math.cos(nz * 9.0);

      const disp = 1.0 + cleavage + stepped;
      v.multiplyScalar(disp);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // 3. Morphological 3D Shape C: Elongated Contact-Binary / Bilobate Asteroid (dumbbell / Toutatis shape)
  const bilobateGeo = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(0.042, 2);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const len = v.length();
      const nx = v.x / len;
      const ny = v.y / len;
      const nz = v.z / len;

      // Elongation along X + central waist neck indentation
      const waist = 0.76 + 0.24 * Math.min(1.0, Math.abs(nx) * 2.2);
      // Lobe asymmetric lumps
      const lumps = 0.07 * Math.sin(nx * 4.0) * Math.cos(ny * 7.0 + nz * 6.0);

      v.x *= 1.55;
      v.multiplyScalar(waist + lumps);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // Populate Instanced Meshes with non-uniform scaling, full 3D rotations, and mineral composition colors
  useEffect(() => {
    const meshes = [
      { ref: meshCrateredRef, count: COUNT_CRATERED },
      { ref: meshFacetedRef, count: COUNT_FACETED },
      { ref: meshBilobateRef, count: COUNT_BILOBATE }
    ];

    const prng = mulberry32(42);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    const r_min_sq = ASTEROID_BELT_INNER_AU * ASTEROID_BELT_INNER_AU;
    const r_max_sq = ASTEROID_BELT_OUTER_AU * ASTEROID_BELT_OUTER_AU;

    for (const { ref, count } of meshes) {
      if (!ref.current) continue;
      const mesh = ref.current;

      for (let i = 0; i < count; i++) {
        // Heliocentric orbital placement within Main Belt
        const r_au = Math.sqrt(r_min_sq + prng() * (r_max_sq - r_min_sq));
        const theta = prng() * 2.0 * Math.PI;
        // Realistic vertical orbital inclination dispersion
        const z_au = (prng() - 0.5) * 0.15 * (1.0 + 0.4 * Math.sin(theta * 2.0));

        const pos = eclipticToScene(
          [r_au * Math.cos(theta), r_au * Math.sin(theta), z_au],
          [0, 0, 0],
          SCENE_SCALE_AU
        );
        dummy.position.set(pos[0], pos[1], pos[2]);

        // Full 3D tumbling orientation (independent on all 3 axes)
        dummy.rotation.set(
          prng() * Math.PI * 2,
          prng() * Math.PI * 2,
          prng() * Math.PI * 2
        );

        // Power-law size distribution: many smaller debris, few massive rocks
        const baseScale = 0.35 + prng() * 1.35;
        const powerLaw = Math.pow(prng(), 2.2) * 1.6 + 0.45;
        const s = baseScale * powerLaw;

        // Distinct non-uniform aspect ratios per instance
        const sx = s * (0.80 + prng() * 0.40);
        const sy = s * (0.75 + prng() * 0.50);
        const sz = s * (0.80 + prng() * 0.40);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();

        mesh.setMatrixAt(i, dummy.matrix);

        // Taxonomic mineral composition colors:
        // ~72% C-type (Carbonaceous dark charcoal graphite), ~18% S-type (Silicate stony ochre), ~10% M-type (Nickel-iron sheen)
        const classRoll = prng();
        if (classRoll < 0.72) {
          const l = 0.24 + prng() * 0.14;
          color.setRGB(l * 0.98, l * 0.94, l * 0.90);
        } else if (classRoll < 0.90) {
          const l = 0.38 + prng() * 0.16;
          color.setRGB(l * 1.05, l * 0.95, l * 0.84);
        } else {
          const l = 0.44 + prng() * 0.18;
          color.setRGB(l * 0.95, l * 0.98, l * 1.04);
        }
        mesh.setColorAt(i, color);
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }
  }, [crateredGeo, facetedGeo, bilobateGeo]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.003;
    }
  });

  return (
    <group ref={groupRef}>
      {/* 1. Cratered Chondrite Boulders (1100 instances) */}
      <instancedMesh
        ref={meshCrateredRef}
        args={[crateredGeo, undefined, COUNT_CRATERED]}
        onClick={(e) => {
          e.stopPropagation();
          focusBody('AsteroidBelt');
        }}
      >
        <meshStandardMaterial roughness={0.88} metalness={0.12} flatShading />
      </instancedMesh>

      {/* 2. Cleaved Collisional Shards (900 instances) */}
      <instancedMesh
        ref={meshFacetedRef}
        args={[facetedGeo, undefined, COUNT_FACETED]}
        onClick={(e) => {
          e.stopPropagation();
          focusBody('AsteroidBelt');
        }}
      >
        <meshStandardMaterial roughness={0.88} metalness={0.12} flatShading />
      </instancedMesh>

      {/* 3. Elongated Bilobate Asteroids (500 instances) */}
      <instancedMesh
        ref={meshBilobateRef}
        args={[bilobateGeo, undefined, COUNT_BILOBATE]}
        onClick={(e) => {
          e.stopPropagation();
          focusBody('AsteroidBelt');
        }}
      >
        <meshStandardMaterial roughness={0.88} metalness={0.12} flatShading />
      </instancedMesh>
    </group>
  );
}
