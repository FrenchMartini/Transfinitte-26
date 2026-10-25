import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSimStore } from '../../store/sim';
import { SCENE_SCALE_AU } from '../../config';
import { eclipticToScene } from '../../coords';

export function ClimateMirror() {
  const l1GroupRef = useRef<THREE.Group>(null);
  const l2GroupRef = useRef<THREE.Group>(null);
  const bypassGroupRef = useRef<THREE.Group>(null);

  const l1SunbeamRef = useRef<THREE.Mesh>(null);
  const l1NorthPolarBeamRef = useRef<THREE.Mesh>(null);
  const l1SouthPolarBeamRef = useRef<THREE.Mesh>(null);
  const l1SubsolarCausticRef = useRef<THREE.Mesh>(null);
  const l1NorthCausticRef = useRef<THREE.Mesh>(null);
  const l1SouthCausticRef = useRef<THREE.Mesh>(null);
  const l1RimsRef = useRef<THREE.Group>(null);
  const l1RayLinesRef = useRef<THREE.LineSegments>(null);

  const l2EarthshineBeamRef = useRef<THREE.Mesh>(null);
  const l2NightCausticRef = useRef<THREE.Mesh>(null);
  const l2RimsRef = useRef<THREE.Group>(null);
  const l2RayLinesRef = useRef<THREE.LineSegments>(null);

  const focusBody = useSimStore((s) => s.focusBody);

  // =========================================================================
  // 1. L1 SWARM GEOMETRIES (19 Autonomous Hexagonal Flyers)
  // =========================================================================
  const { l1FlyerGeo, l1RimGeo, l1LaserGeo, l1Offsets, l1RayGeo } = useMemo(() => {
    const hexR = 0.042;
    const hexSpacing = hexR * Math.sqrt(3);

    const offsets: [number, number][] = [[0, 0]];
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + Math.PI / 6;
      offsets.push([hexSpacing * Math.cos(angle), hexSpacing * Math.sin(angle)]);
    }
    for (let i = 0; i < 6; i++) {
      const angleCorner = (i * Math.PI) / 3 + Math.PI / 6;
      const cornerX = 2 * hexSpacing * Math.cos(angleCorner);
      const cornerY = 2 * hexSpacing * Math.sin(angleCorner);
      offsets.push([cornerX, cornerY]);

      const nextCornerAngle = ((i + 1) * Math.PI) / 3 + Math.PI / 6;
      const midX = (cornerX + 2 * hexSpacing * Math.cos(nextCornerAngle)) * 0.5;
      const midY = (cornerY + 2 * hexSpacing * Math.sin(nextCornerAngle)) * 0.5;
      offsets.push([midX, midY]);
    }

    const flyerGeo = new THREE.CircleGeometry(hexR * 0.98, 6);
    const rimGeo = new THREE.RingGeometry(hexR * 0.88, hexR, 6);

    const laserPositions: number[] = [];
    for (let i = 0; i < offsets.length; i++) {
      for (let j = i + 1; j < offsets.length; j++) {
        const dx = offsets[i][0] - offsets[j][0];
        const dy = offsets[i][1] - offsets[j][1];
        if (Math.hypot(dx, dy) < hexSpacing * 1.15) {
          laserPositions.push(offsets[i][0], offsets[i][1], 0.002, offsets[j][0], offsets[j][1], 0.002);
        }
      }
    }
    const laserGeo = new THREE.BufferGeometry();
    laserGeo.setAttribute('position', new THREE.Float32BufferAttribute(laserPositions, 3));

    // L1 Ray lines
    const l1RayPositions: number[] = [];
    const northFlyers = offsets.filter(([_, oy]) => oy > 0.03);
    northFlyers.forEach(([ox, oy], k) => {
      const a = (k / northFlyers.length) * Math.PI * 2;
      l1RayPositions.push(ox, oy, 0.003, 0.08 * Math.cos(a), 0.36 + 0.05 * Math.sin(a), 1.22);
    });
    const southFlyers = offsets.filter(([_, oy]) => oy < -0.03);
    southFlyers.forEach(([ox, oy], k) => {
      const a = (k / southFlyers.length) * Math.PI * 2;
      l1RayPositions.push(ox, oy, 0.003, 0.08 * Math.cos(a), -0.36 + 0.05 * Math.sin(a), 1.22);
    });
    const leftFlyers = offsets.filter(([ox, _]) => ox < -0.04);
    leftFlyers.forEach(([ox, oy], k) => {
      l1RayPositions.push(ox, oy, 0.003, -0.38, (k - 1) * 0.14, 1.25);
    });
    const rightFlyers = offsets.filter(([ox, _]) => ox > 0.04);
    rightFlyers.forEach(([ox, oy], k) => {
      l1RayPositions.push(ox, oy, 0.003, 0.38, (k - 1) * 0.14, 1.25);
    });
    const centerFlyers = offsets.filter(([ox, oy]) => Math.hypot(ox, oy) < 0.05);
    centerFlyers.forEach(([ox, oy], k) => {
      const a = (k * Math.PI) / 3;
      l1RayPositions.push(ox, oy, 0.003, 0.15 * Math.cos(a), 0.15 * Math.sin(a), 0.87);
    });
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute('position', new THREE.Float32BufferAttribute(l1RayPositions, 3));

    return { l1FlyerGeo: flyerGeo, l1RimGeo: rimGeo, l1LaserGeo: laserGeo, l1Offsets: offsets, l1RayGeo: rayGeo };
  }, []);

  // L1 Beams and Caustics Geometries
  const { l1CenterBeamGeo, l1PolarBeamGeo, l1NorthCausticGeo } = useMemo(() => {
    const center = new THREE.CylinderGeometry(0.28, 0.16, 0.87, 24, 1, true);
    center.translate(0, 0.435, 0);
    center.rotateX(Math.PI / 2);

    const polar = new THREE.CylinderGeometry(0.10, 0.06, 1.251, 20, 1, true);
    polar.translate(0, 1.251 * 0.5, 0);
    polar.rotateX(Math.PI / 2);

    const northC = new THREE.CircleGeometry(0.10, 20);

    return { l1CenterBeamGeo: center, l1PolarBeamGeo: polar, l1NorthCausticGeo: northC };
  }, []);

  // =========================================================================
  // 2. L2 SWARM GEOMETRIES (37 Colossal Interlocking Hexagons in Honeycomb)
  // =========================================================================
  const { l2FlyerGeo, l2RimGeo, l2LaserGeo, l2Offsets, l2RayGeo, l2BeamGeo } = useMemo(() => {
    const l2HexR = 0.082;
    const l2HexSpacing = l2HexR * Math.sqrt(3);
    const maxDist = 3 * l2HexSpacing;

    const offsets: [number, number, number][] = [];
    for (let q = -3; q <= 3; q++) {
      const r1 = Math.max(-3, -q - 3);
      const r2 = Math.min(3, -q + 3);
      for (let r = r1; r <= r2; r++) {
        const x = l2HexSpacing * (q + r / 2);
        const y = l2HexR * 1.5 * r;
        const dist = Math.hypot(x, y);
        const dishZ = 0.06 * Math.pow(dist / maxDist, 2);
        offsets.push([x, y, dishZ]);
      }
    }

    const flyerGeo = new THREE.CircleGeometry(l2HexR * 0.98, 6);
    const rimGeo = new THREE.RingGeometry(l2HexR * 0.88, l2HexR, 6);

    const laserPositions: number[] = [];
    for (let i = 0; i < offsets.length; i++) {
      for (let j = i + 1; j < offsets.length; j++) {
        const dx = offsets[i][0] - offsets[j][0];
        const dy = offsets[i][1] - offsets[j][1];
        if (Math.hypot(dx, dy) < l2HexSpacing * 1.15) {
          laserPositions.push(
            offsets[i][0], offsets[i][1], offsets[i][2] + 0.002,
            offsets[j][0], offsets[j][1], offsets[j][2] + 0.002
          );
        }
      }
    }
    const laserGeo = new THREE.BufferGeometry();
    laserGeo.setAttribute('position', new THREE.Float32BufferAttribute(laserPositions, 3));

    // L2 Reverse Earthshine Raylines
    const rayPositions: number[] = [];
    const outerL2 = offsets.filter(([ox, oy]) => Math.hypot(ox, oy) > 0.25);
    outerL2.forEach(([ox, oy, dishZ], k) => {
      const a = (k / outerL2.length) * Math.PI * 2;
      rayPositions.push(ox, oy, dishZ + 0.003, 0.34 * Math.cos(a), 0.34 * Math.sin(a), 0.87);
    });
    const innerL2 = offsets.filter(([ox, oy]) => Math.hypot(ox, oy) <= 0.15);
    innerL2.forEach(([ox, oy, dishZ]) => {
      rayPositions.push(ox, oy, dishZ + 0.003, 0, 0, 0.87);
    });
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.Float32BufferAttribute(rayPositions, 3));

    // Reverse Earthshine Converging Beam
    const bGeo = new THREE.CylinderGeometry(0.36, 0.58, 0.87, 32, 1, true);
    bGeo.translate(0, 0.435, 0);
    bGeo.rotateX(Math.PI / 2);

    return {
      l2FlyerGeo: flyerGeo,
      l2RimGeo: rimGeo,
      l2LaserGeo: laserGeo,
      l2Offsets: offsets,
      l2RayGeo: rGeo,
      l2BeamGeo: bGeo
    };
  }, []);

  // =========================================================================
  // 3. BYPASS SOLAR TRANSFER CORRIDOR GEOMETRIES
  // =========================================================================
  const { bypassSheathGeo, bypassRayGeo } = useMemo(() => {
    const sheath = new THREE.CylinderGeometry(0.58, 0.26, 2.50, 32, 1, true);
    sheath.rotateX(Math.PI / 2);

    const rayPositions: number[] = [];
    const numRays = 12;
    for (let i = 0; i < numRays; i++) {
      const a = (i / numRays) * Math.PI * 2;
      const x1 = 0.25 * Math.cos(a);
      const y1 = 0.25 * Math.sin(a);
      const xMid = 0.48 * Math.cos(a);
      const yMid = 0.48 * Math.sin(a);
      const x2 = 0.57 * Math.cos(a);
      const y2 = 0.57 * Math.sin(a);
      rayPositions.push(x1, y1, -1.25, xMid, yMid, 0.0);
      rayPositions.push(xMid, yMid, 0.0, x2, y2, 1.25);
    }
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.Float32BufferAttribute(rayPositions, 3));

    return { bypassSheathGeo: sheath, bypassRayGeo: rGeo };
  }, []);

  useFrame((state) => {
    const currentFrame = useSimStore.getState().currentFrame;
    const earth = currentFrame.bodies['Earth'];
    if (!earth || !l1GroupRef.current || !l2GroupRef.current || !bypassGroupRef.current) return;

    const earthScene = eclipticToScene([earth.x, earth.y, earth.z], [0, 0, 0], SCENE_SCALE_AU);
    const sunToEarth = new THREE.Vector3(...earthScene);
    const distEarth = sunToEarth.length();
    if (distEarth < 0.1) return;

    const sunDir = sunToEarth.clone().normalize();
    const r_au = Math.hypot(earth.x, earth.y) || 1.0;

    // Standoff distance scaling with r_au (matching legacy exact formula)
    const d_l = Math.max(1.10, Math.min(1.50, 1.25 * Math.pow(r_au, 1.0 / 3.0)));

    // Fixed Orthonormal Basis: sceneUp strictly (0, 1, 0)
    const sceneUp = new THREE.Vector3(0, 1, 0);
    let lateralAxis = new THREE.Vector3().crossVectors(sceneUp, sunDir).normalize();
    if (lateralAxis.lengthSq() < 0.01) lateralAxis = new THREE.Vector3(1, 0, 0);
    const orthogonalUp = new THREE.Vector3().crossVectors(sunDir, lateralAxis).normalize();

    // 1. Position L1 Day Concentrator Swarm
    const l1Pos = sunToEarth.clone().addScaledVector(sunDir, -d_l);
    l1GroupRef.current.position.copy(l1Pos);
    const rotMatL1 = new THREE.Matrix4().makeBasis(lateralAxis, orthogonalUp, sunDir);
    l1GroupRef.current.setRotationFromMatrix(rotMatL1);

    // 2. Position L2 Night Giant Concentrator Swarm
    const l2Pos = sunToEarth.clone().addScaledVector(sunDir, d_l);
    l2GroupRef.current.position.copy(l2Pos);
    const rotMatL2 = new THREE.Matrix4().makeBasis(lateralAxis.clone().negate(), orthogonalUp, sunDir.clone().negate());
    l2GroupRef.current.setRotationFromMatrix(rotMatL2);

    // 3. Position Bypass Corridor
    bypassGroupRef.current.position.copy(sunToEarth);
    const rotMatBypass = new THREE.Matrix4().makeBasis(lateralAxis, orthogonalUp, sunDir);
    bypassGroupRef.current.setRotationFromMatrix(rotMatBypass);
    bypassGroupRef.current.scale.set(d_l / 1.25, d_l / 1.25, d_l / 1.25);

    // Animations & Dynamic Scaling
    const time = state.clock.getElapsedTime();
    const boostFraction = Math.max(0.15, Math.min(1.0, (r_au - 1.0) / 1.70));
    const zScale = (d_l - 0.38) / 0.87;
    const pulse = 0.94 + 0.06 * Math.sin(time * 14.0);

    // Tacking rims pulsing
    const tackPulse = 0.65 + 0.35 * Math.sin(time * 8.0);
    if (l1RimsRef.current) {
      l1RimsRef.current.children.forEach((c) => {
        if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
          c.material.opacity = tackPulse;
        }
      });
    }
    if (l2RimsRef.current) {
      l2RimsRef.current.children.forEach((c) => {
        if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
          c.material.opacity = tackPulse;
        }
      });
    }

    // L1 Central Sunbeam
    if (l1SunbeamRef.current) {
      l1SunbeamRef.current.scale.set(pulse, pulse, zScale);
      (l1SunbeamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.28 + 0.35 * boostFraction;
    }

    // L1 Polar Beams
    const pPulse1 = 0.93 + 0.07 * Math.sin(time * 12.0);
    const pPulse2 = 0.93 + 0.07 * Math.cos(time * 13.0);
    if (l1NorthPolarBeamRef.current) {
      l1NorthPolarBeamRef.current.scale.set(pPulse1, pPulse1, zScale);
      (l1NorthPolarBeamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.32 + 0.35 * boostFraction;
    }
    if (l1SouthPolarBeamRef.current) {
      l1SouthPolarBeamRef.current.scale.set(pPulse2, pPulse2, zScale);
      (l1SouthPolarBeamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.32 + 0.35 * boostFraction;
    }
    if (l1RayLinesRef.current) {
      (l1RayLinesRef.current.material as THREE.LineBasicMaterial).opacity = 0.55 + 0.35 * boostFraction;
    }

    // L1 Caustics
    if (l1SubsolarCausticRef.current) {
      l1SubsolarCausticRef.current.position.set(0, 0, d_l - 0.375);
      (l1SubsolarCausticRef.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * boostFraction;
    }
    if (l1NorthCausticRef.current) l1NorthCausticRef.current.position.set(0, 0.36, d_l - 0.08);
    if (l1SouthCausticRef.current) l1SouthCausticRef.current.position.set(0, -0.36, d_l - 0.08);

    // L2 Reverse Earthshine Beam
    if (l2EarthshineBeamRef.current) {
      l2EarthshineBeamRef.current.scale.set(pulse, pulse, zScale);
      (l2EarthshineBeamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.28 + 0.35 * boostFraction;
    }
    if (l2NightCausticRef.current) {
      l2NightCausticRef.current.position.set(0, 0, d_l - 0.375);
      (l2NightCausticRef.current.material as THREE.MeshBasicMaterial).opacity = 0.32 + 0.25 * boostFraction;
    }
    if (l2RayLinesRef.current) {
      (l2RayLinesRef.current.material as THREE.LineBasicMaterial).opacity = 0.55 + 0.35 * boostFraction;
    }
  });

  return (
    <>
      {/* =========================================================================
          1. L1 DAY-SIDE CONCENTRATING SWARM (19 Hexagonal Flyers)
          ========================================================================= */}
      <group
        ref={l1GroupRef}
        onClick={(e) => {
          e.stopPropagation();
          focusBody('Earth');
        }}
      >
        {/* Specular Gold Gossamer Membranes */}
        {l1Offsets.map(([ox, oy], idx) => (
          <mesh key={`l1-flyer-${idx}`} position={[ox, oy, 0]} geometry={l1FlyerGeo}>
            <meshStandardMaterial
              color={0xfffbeb}
              metalness={0.96}
              roughness={0.05}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}

        {/* Electrochromic Tacking Rims */}
        <group ref={l1RimsRef}>
          {l1Offsets.map(([ox, oy], idx) => (
            <mesh key={`l1-rim-${idx}`} position={[ox, oy, 0.001]} geometry={l1RimGeo}>
              <meshBasicMaterial
                color={0x38bdf8}
                side={THREE.DoubleSide}
                transparent
                opacity={0.85}
              />
            </mesh>
          ))}
        </group>

        {/* Gimbal Nodes */}
        {l1Offsets.map(([ox, oy], idx) => (
          <mesh key={`l1-gimbal-${idx}`} position={[ox, oy, 0.003]}>
            <sphereGeometry args={[0.042 * 0.16, 8, 8]} />
            <meshStandardMaterial color={0x64748b} metalness={0.8} roughness={0.2} />
          </mesh>
        ))}

        {/* Laser Metrology Alignment Grid */}
        <lineSegments geometry={l1LaserGeo}>
          <lineBasicMaterial color={0x10b981} transparent opacity={0.55} />
        </lineSegments>

        {/* Amber Statite Perimeter Beacon Ring */}
        <mesh>
          <ringGeometry args={[0.24, 0.26, 32]} />
          <meshBasicMaterial color={0xf59e0b} side={THREE.DoubleSide} transparent opacity={0.70} />
        </mesh>

        {/* Central Day-Side Sunbeam */}
        <mesh ref={l1SunbeamRef} geometry={l1CenterBeamGeo}>
          <meshBasicMaterial
            color={0xffe082}
            transparent
            opacity={0.35}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* Sub-solar Caustics Illumination Disk */}
        <mesh ref={l1SubsolarCausticRef} position={[0, 0, 0.87]}>
          <circleGeometry args={[0.28, 24]} />
          <meshBasicMaterial
            color={0xffd54f}
            transparent
            opacity={0.42}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* North Polar Concentrator Corridor */}
        <mesh
          ref={l1NorthPolarBeamRef}
          geometry={l1PolarBeamGeo}
          position={[0, 0.08, 0]}
          rotation={[-0.2255, 0, 0]}
        >
          <meshBasicMaterial
            color={0xffd54f}
            transparent
            opacity={0.40}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh
          ref={l1NorthCausticRef}
          geometry={l1NorthCausticGeo}
          position={[0, 0.36, 1.22]}
          rotation={[-0.2255, 0, 0]}
        >
          <meshBasicMaterial
            color={0xfffbeb}
            transparent
            opacity={0.65}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* South Polar Concentrator Corridor */}
        <mesh
          ref={l1SouthPolarBeamRef}
          geometry={l1PolarBeamGeo}
          position={[0, -0.08, 0]}
          rotation={[0.2255, 0, 0]}
        >
          <meshBasicMaterial
            color={0xffd54f}
            transparent
            opacity={0.40}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh
          ref={l1SouthCausticRef}
          geometry={l1NorthCausticGeo}
          position={[0, -0.36, 1.22]}
          rotation={[0.2255, 0, 0]}
        >
          <meshBasicMaterial
            color={0xfffbeb}
            transparent
            opacity={0.65}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* L1 Ray-Traced Photon Lines */}
        <lineSegments ref={l1RayLinesRef} geometry={l1RayGeo}>
          <lineBasicMaterial color={0xfef08a} transparent opacity={0.75} />
        </lineSegments>
      </group>

      {/* =========================================================================
          2. L2 NIGHT-SIDE GIANT CONCENTRATOR (37 Hexagonal Honeycomb Array)
          ========================================================================= */}
      <group
        ref={l2GroupRef}
        onClick={(e) => {
          e.stopPropagation();
          focusBody('Earth');
        }}
      >
        {/* Reflective Parabolic Gold Tiles */}
        {l2Offsets.map(([ox, oy, oz], idx) => (
          <mesh key={`l2-flyer-${idx}`} position={[ox, oy, oz]} geometry={l2FlyerGeo}>
            <meshStandardMaterial
              color={0xfef08a}
              emissive={0x92400e}
              emissiveIntensity={0.45}
              metalness={0.96}
              roughness={0.05}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}

        {/* Electrochromic Tacking Rims */}
        <group ref={l2RimsRef}>
          {l2Offsets.map(([ox, oy, oz], idx) => (
            <mesh key={`l2-rim-${idx}`} position={[ox, oy, oz + 0.001]} geometry={l2RimGeo}>
              <meshBasicMaterial
                color={0x38bdf8}
                side={THREE.DoubleSide}
                transparent
                opacity={0.85}
              />
            </mesh>
          ))}
        </group>

        {/* Gimbal Nodes */}
        {l2Offsets.map(([ox, oy, oz], idx) => (
          <mesh key={`l2-gimbal-${idx}`} position={[ox, oy, oz + 0.003]}>
            <sphereGeometry args={[0.082 * 0.16, 8, 8]} />
            <meshStandardMaterial color={0x475569} metalness={0.8} roughness={0.2} />
          </mesh>
        ))}

        {/* L2 Metrology Grid */}
        <lineSegments geometry={l2LaserGeo}>
          <lineBasicMaterial color={0x10b981} transparent opacity={0.55} />
        </lineSegments>

        {/* Cyan Statite Control Ring */}
        <mesh position={[0, 0, 0.06]}>
          <ringGeometry args={[0.56, 0.60, 48]} />
          <meshBasicMaterial color={0x38bdf8} side={THREE.DoubleSide} transparent opacity={0.75} />
        </mesh>

        {/* Converging Reverse Earthshine Focus Beam */}
        <mesh ref={l2EarthshineBeamRef} geometry={l2BeamGeo}>
          <meshBasicMaterial
            color={0xf59e0b}
            transparent
            opacity={0.35}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* Nocturnal Caustic Glow Cap */}
        <mesh ref={l2NightCausticRef} position={[0, 0, 0.87]}>
          <circleGeometry args={[0.36, 32]} />
          <meshBasicMaterial
            color={0xd97706}
            transparent
            opacity={0.40}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* L2 Reverse Earthshine Photon Lines */}
        <lineSegments ref={l2RayLinesRef} geometry={l2RayGeo}>
          <lineBasicMaterial color={0xfbbf24} transparent opacity={0.70} />
        </lineSegments>
      </group>

      {/* =========================================================================
          3. BYPASS SOLAR TRANSFER CORRIDOR (L1 -> around Earth -> L2)
          ========================================================================= */}
      <group ref={bypassGroupRef}>
        <mesh geometry={bypassSheathGeo}>
          <meshBasicMaterial
            color={0xffd54f}
            transparent
            opacity={0.16}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <lineSegments geometry={bypassRayGeo}>
          <lineBasicMaterial color={0xfef08a} transparent opacity={0.65} />
        </lineSegments>
      </group>
    </>
  );
}
