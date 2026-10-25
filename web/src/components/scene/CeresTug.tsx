import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSimStore } from '../../store/sim';
import { SCENE_SCALE_AU } from '../../config';
import { eclipticToScene } from '../../coords';

const PLASMA_PARTICLE_COUNT = 360;
const CANT_ANGLE_RAD = THREE.MathUtils.degToRad(5.0);
const VISUAL_CANT_ANGLE_RAD = THREE.MathUtils.degToRad(28.0);
const VISUAL_STANDOFF = 1.4;

export function CeresTug() {
  const tugGroupRef = useRef<THREE.Group>(null);
  const towlineRef = useRef<THREE.Line>(null);
  const towlinePositions = useMemo(() => new Float32Array(6), []);

  const shortPlume1Ref = useRef<THREE.Mesh>(null);
  const shortPlume2Ref = useRef<THREE.Mesh>(null);
  const extPlume1Ref = useRef<THREE.Mesh>(null);
  const extPlume2Ref = useRef<THREE.Mesh>(null);

  const focusBody = useSimStore((s) => s.focusBody);

  // 1. Ceres Asteroid Ballast Body (Displaced Chondrite)
  const ceresGeo = useMemo(() => {
    const geo = new THREE.DodecahedronGeometry(0.24, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const noise = 1.0 + 0.12 * Math.sin(vx * 12.0) * Math.cos(vy * 10.0);
      pos.setXYZ(i, vx * noise, vy * noise, vz * noise);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // 2. Short and Extended Plume Geometries
  const { shortPlumeGeo, extPlumeGeo } = useMemo(() => {
    const shortG = new THREE.ConeGeometry(0.04, 0.32, 16, 1, true);
    shortG.translate(0, -0.16, 0);

    const extG = new THREE.ConeGeometry(0.11, 3.2, 16, 1, true);
    extG.translate(0, -1.6, 0);

    return { shortPlumeGeo: shortG, extPlumeGeo: extG };
  }, []);

  // 3. Biosphere Clearance Trajectory Lines
  const { northLineGeo, southLineGeo } = useMemo(() => {
    const northPts = [
      new THREE.Vector3(0, 0.09, 0.42),
      new THREE.Vector3(0, 0.61, 1.40),
      new THREE.Vector3(0, 1.25, 2.60)
    ];
    const southPts = [
      new THREE.Vector3(0, -0.09, 0.42),
      new THREE.Vector3(0, -0.61, 1.40),
      new THREE.Vector3(0, -1.25, 2.60)
    ];
    return {
      northLineGeo: new THREE.BufferGeometry().setFromPoints(northPts),
      southLineGeo: new THREE.BufferGeometry().setFromPoints(southPts)
    };
  }, []);

  // 4. Relativistic Plasma Particle Stream (Twin Canted Cones @ 0.3c)
  const { particleGeometry, particlesData } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(PLASMA_PARTICLE_COUNT * 3);
    const colors = new Float32Array(PLASMA_PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PLASMA_PARTICLE_COUNT * 3);
    const lifetimes = new Float32Array(PLASMA_PARTICLE_COUNT);
    const maxLifetimes = new Float32Array(PLASMA_PARTICLE_COUNT);

    const sinCant = Math.sin(VISUAL_CANT_ANGLE_RAD);
    const cosCant = Math.cos(VISUAL_CANT_ANGLE_RAD);

    for (let i = 0; i < PLASMA_PARTICLE_COUNT; i++) {
      const isNorth = i % 2 === 0;
      const nozzleY = isNorth ? 0.09 : -0.09;
      const cantSign = isNorth ? 1.0 : -1.0;

      maxLifetimes[i] = 0.65 + Math.random() * 0.35;
      lifetimes[i] = Math.random() * maxLifetimes[i];
      const speed = 3.6 + Math.random() * 1.0;

      velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.04;
      velocities[i * 3 + 1] = cantSign * sinCant * speed + (Math.random() - 0.5) * 0.02;
      velocities[i * 3 + 2] = cosCant * speed;

      const t = lifetimes[i];
      positions[i * 3 + 0] = (Math.random() - 0.5) * 0.02 + velocities[i * 3 + 0] * t;
      positions[i * 3 + 1] = nozzleY + (Math.random() - 0.5) * 0.02 + velocities[i * 3 + 1] * t;
      positions[i * 3 + 2] = 0.42 + velocities[i * 3 + 2] * t;

      const progress = lifetimes[i] / maxLifetimes[i];
      if (progress < 0.3) {
        colors[i * 3 + 0] = 0.25; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 1.0;
      } else if (progress < 0.7) {
        colors[i * 3 + 0] = 0.0; colors[i * 3 + 1] = 0.45; colors[i * 3 + 2] = 0.85;
      } else {
        const fade = (1.0 - progress) / 0.3;
        colors[i * 3 + 0] = 0.15 * fade; colors[i * 3 + 1] = 0.05 * fade; colors[i * 3 + 2] = 0.4 * fade;
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    return {
      particleGeometry: geo,
      particlesData: { positions, colors, velocities, lifetimes, maxLifetimes }
    };
  }, []);

  // 5. Towline Geometry
  const towlineGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(towlinePositions, 3));
    return geo;
  }, [towlinePositions]);

  useFrame((state, delta) => {
    const currentFrame = useSimStore.getState().currentFrame;
    const earth = currentFrame.bodies['Earth'];
    if (!earth || !tugGroupRef.current) return;

    const earthScene = eclipticToScene([earth.x, earth.y, earth.z], [0, 0, 0], SCENE_SCALE_AU);
    const earthPos = new THREE.Vector3(earthScene[0], earthScene[1], earthScene[2]);

    // Direction vector ahead of Earth along orbital pull
    let dir = new THREE.Vector3();
    const tugData = currentFrame.bodies['Tug'];
    if (tugData) {
      const tugRaw = eclipticToScene([tugData.x, tugData.y, tugData.z], [0, 0, 0], SCENE_SCALE_AU);
      dir.set(tugRaw[0] - earthScene[0], tugRaw[1] - earthScene[1], tugRaw[2] - earthScene[2]);
    }
    if (dir.lengthSq() < 1e-6) {
      const vScene = eclipticToScene([earth.vx, earth.vy, earth.vz], [0, 0, 0], 1.0);
      dir.set(vScene[0], vScene[1], vScene[2]);
    }
    dir.normalize();

    // Visual Standoff Distance: 1.4 scene units (exact legacy value)
    const tugVisualPos = earthPos.clone().addScaledVector(dir, VISUAL_STANDOFF);
    tugGroupRef.current.position.copy(tugVisualPos);
    // Tug faces forward, thrusters point backward along dir toward Earth/space
    tugGroupRef.current.lookAt(tugVisualPos.clone().sub(dir));

    // Update Gravitational Towline
    if (towlineRef.current) {
      towlinePositions[0] = earthPos.x;
      towlinePositions[1] = earthPos.y;
      towlinePositions[2] = earthPos.z;
      towlinePositions[3] = tugVisualPos.x;
      towlinePositions[4] = tugVisualPos.y;
      towlinePositions[5] = tugVisualPos.z;
      (towlineRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // Dynamic Plume Pulsing
    const time = state.clock.getElapsedTime();
    const pulse1 = 0.92 + 0.08 * Math.sin(time * 18.0);
    const pulse2 = 0.92 + 0.08 * Math.cos(time * 19.0);
    if (shortPlume1Ref.current) shortPlume1Ref.current.scale.set(pulse1, pulse1, pulse1);
    if (shortPlume2Ref.current) shortPlume2Ref.current.scale.set(pulse2, pulse2, pulse2);

    const extPulse1 = 0.88 + 0.12 * Math.sin(time * 14.0);
    const extPulse2 = 0.88 + 0.12 * Math.cos(time * 15.0);
    if (extPlume1Ref.current) extPlume1Ref.current.scale.set(extPulse1, extPulse1, extPulse1);
    if (extPlume2Ref.current) extPlume2Ref.current.scale.set(extPulse2, extPulse2, extPulse2);

    // Animate Relativistic Plasma Particles (0.3c streams)
    const dt = Math.min(delta, 0.05);
    const { positions, colors, velocities, lifetimes, maxLifetimes } = particlesData;
    const sinCant = Math.sin(VISUAL_CANT_ANGLE_RAD);
    const cosCant = Math.cos(VISUAL_CANT_ANGLE_RAD);

    for (let i = 0; i < PLASMA_PARTICLE_COUNT; i++) {
      lifetimes[i] += dt;
      if (lifetimes[i] >= maxLifetimes[i]) {
        const isNorth = i % 2 === 0;
        const nozzleY = isNorth ? 0.09 : -0.09;
        const cantSign = isNorth ? 1.0 : -1.0;

        lifetimes[i] = 0;
        maxLifetimes[i] = 0.65 + Math.random() * 0.35;
        const speed = 3.6 + Math.random() * 1.0;

        velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.04;
        velocities[i * 3 + 1] = cantSign * sinCant * speed + (Math.random() - 0.5) * 0.02;
        velocities[i * 3 + 2] = cosCant * speed;

        positions[i * 3 + 0] = (Math.random() - 0.5) * 0.02;
        positions[i * 3 + 1] = nozzleY + (Math.random() - 0.5) * 0.02;
        positions[i * 3 + 2] = 0.42;
      } else {
        positions[i * 3 + 0] += velocities[i * 3 + 0] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      }

      const progress = lifetimes[i] / maxLifetimes[i];
      if (progress < 0.25) {
        colors[i * 3 + 0] = 0.35; colors[i * 3 + 1] = 0.88; colors[i * 3 + 2] = 1.0;
      } else if (progress < 0.65) {
        colors[i * 3 + 0] = 0.05; colors[i * 3 + 1] = 0.45; colors[i * 3 + 2] = 0.85;
      } else {
        const fade = (1.0 - progress) / 0.35;
        colors[i * 3 + 0] = 0.15 * fade; colors[i * 3 + 1] = 0.05 * fade; colors[i * 3 + 2] = 0.45 * fade;
      }
    }

    particleGeometry.attributes.position.needsUpdate = true;
    particleGeometry.attributes.color.needsUpdate = true;
  });

  return (
    <>
      {/* Gravitational Towline from Earth to Tug */}
      <primitive
        object={
          new THREE.Line(
            towlineGeo,
            new THREE.LineBasicMaterial({
              color: 0x00f0ff,
              transparent: true,
              opacity: 0.85
            })
          )
        }
        ref={towlineRef}
      />

      {/* Ceres Gravity Tug Composite Body */}
      <group
        ref={tugGroupRef}
        onClick={(e) => {
          e.stopPropagation();
          focusBody('Tug');
        }}
      >
        {/* 1. Ceres Asteroid Body */}
        <mesh geometry={ceresGeo} castShadow receiveShadow>
          <meshStandardMaterial
            color={0x6e6659}
            roughness={0.85}
            metalness={0.15}
            flatShading
          />
        </mesh>

        {/* 2. Mining Rig Chassis & Extraction Rig */}
        <group position={[-0.42, 0.04, 0.02]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[0.10, 0.12, 0.18, 8]} />
            <meshStandardMaterial color={0x1e293b} metalness={0.90} roughness={0.25} />
          </mesh>
          {/* Amber collars */}
          <mesh position={[0.04, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[0.122, 0.122, 0.035, 8]} />
            <meshStandardMaterial color={0xf59e0b} metalness={0.70} roughness={0.30} />
          </mesh>
          <mesh position={[-0.04, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[0.122, 0.122, 0.035, 8]} />
            <meshStandardMaterial color={0xf59e0b} metalness={0.70} roughness={0.30} />
          </mesh>
        </group>

        {/* 3. Flash Vaporization Chamber & Gantry */}
        <mesh position={[0, 0, 0.16]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.065, 0.065, 0.09, 12]} />
          <meshStandardMaterial
            color={0xff6600}
            emissive={0xff3300}
            emissiveIntensity={0.85}
            metalness={0.6}
            roughness={0.25}
          />
        </mesh>
        <mesh position={[0, 0, 0.20]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.12, 0.18, 0.16, 8]} />
          <meshStandardMaterial color={0x8892b0} metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0, 0.28]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.26, 0.26, 0.02, 16]} />
          <meshStandardMaterial color={0xd1d5db} metalness={0.95} roughness={0.1} />
        </mesh>

        {/* 4. Dual Canted Relativistic Thruster Nozzles (±5.0° Out-of-Ecliptic Canting) */}
        {/* North Nozzle */}
        <mesh position={[0, 0.09, 0.35]} rotation={[-Math.PI / 2 - CANT_ANGLE_RAD, 0, 0]} castShadow receiveShadow>
          <coneGeometry args={[0.05, 0.14, 12, 1, true]} />
          <meshStandardMaterial color={0x222222} metalness={0.9} roughness={0.2} />
        </mesh>
        {/* South Nozzle */}
        <mesh position={[0, -0.09, 0.35]} rotation={[-Math.PI / 2 + CANT_ANGLE_RAD, 0, 0]} castShadow receiveShadow>
          <coneGeometry args={[0.05, 0.14, 12, 1, true]} />
          <meshStandardMaterial color={0x222222} metalness={0.9} roughness={0.2} />
        </mesh>

        {/* 5. Short Illustrative Exhaust Plumes (±5.0° Canting) */}
        <mesh
          ref={shortPlume1Ref}
          geometry={shortPlumeGeo}
          position={[0, 0.09, 0.42]}
          rotation={[-Math.PI / 2 - CANT_ANGLE_RAD, 0, 0]}
        >
          <meshBasicMaterial
            color={0x00d4ea}
            transparent
            opacity={0.28}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh
          ref={shortPlume2Ref}
          geometry={shortPlumeGeo}
          position={[0, -0.09, 0.42]}
          rotation={[-Math.PI / 2 + CANT_ANGLE_RAD, 0, 0]}
        >
          <meshBasicMaterial
            color={0x00d4ea}
            transparent
            opacity={0.28}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* 6. Extended Out-of-Ecliptic Bi-Conical Plume Corridors (Visual Canting 28°) */}
        <mesh
          ref={extPlume1Ref}
          geometry={extPlumeGeo}
          position={[0, 0.09, 0.42]}
          rotation={[-Math.PI / 2 - VISUAL_CANT_ANGLE_RAD, 0, 0]}
        >
          <meshBasicMaterial
            color={0x00b4d8}
            transparent
            opacity={0.075}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh
          ref={extPlume2Ref}
          geometry={extPlumeGeo}
          position={[0, -0.09, 0.42]}
          rotation={[-Math.PI / 2 + VISUAL_CANT_ANGLE_RAD, 0, 0]}
        >
          <meshBasicMaterial
            color={0x00b4d8}
            transparent
            opacity={0.075}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* 7. Plume Safe Biosphere Clearance Envelope */}
        {/* Out-of-ecliptic clearance rings at Earth encounter plane (Z = 1.40, Y = ±0.61) */}
        <mesh position={[0, 0.61, 1.40]}>
          <ringGeometry args={[0.10, 0.12, 32]} />
          <meshBasicMaterial color={0x38bdf8} transparent opacity={0.16} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.61, 1.40]}>
          <ringGeometry args={[0.10, 0.12, 32]} />
          <meshBasicMaterial color={0x38bdf8} transparent opacity={0.16} side={THREE.DoubleSide} />
        </mesh>

        {/* Corridor trajectory lines */}
        <primitive
          object={
            new THREE.Line(
              northLineGeo,
              new THREE.LineBasicMaterial({ color: 0x00b4d8, transparent: true, opacity: 0.18 })
            )
          }
        />
        <primitive
          object={
            new THREE.Line(
              southLineGeo,
              new THREE.LineBasicMaterial({ color: 0x00b4d8, transparent: true, opacity: 0.18 })
            )
          }
        />

        {/* Biosphere Protection Shield Perimeter Ring around Earth (Z = 1.40, radius 0.44) */}
        <mesh position={[0, 0, 1.40]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.44, 0.455, 48]} />
          <meshBasicMaterial color={0x10b981} transparent opacity={0.18} side={THREE.DoubleSide} />
        </mesh>

        {/* 8. Relativistic Plasma Particle Stream Emitter */}
        <points geometry={particleGeometry}>
          <pointsMaterial
            size={0.024}
            vertexColors
            transparent
            opacity={0.75}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      </group>
    </>
  );
}
