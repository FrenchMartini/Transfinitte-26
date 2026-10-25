import { useRef, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useSimStore } from '../../store/sim';
import { SCENE_SCALE_AU } from '../../config';
import { eclipticToScene } from '../../coords';
import { activeSimState } from '../../interpolation';

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

  // Surface texture map for Ceres Gravity Tug ballast
  const [asteroidTexture, setAsteroidTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(
      '/textures/asteroid.jpg',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        setAsteroidTexture(tex);
      },
      undefined,
      (err) => {
        console.warn('Failed to load /textures/asteroid.jpg:', err);
      }
    );
  }, []);

  // 1. Ceres Asteroid Ballast Body (Displaced Chondrite with proper spherical UV mapping)
  const ceresGeo = useMemo(() => {
    const geo = new THREE.SphereGeometry(0.24, 48, 36);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const len = v.length();
      const nx = v.x / len;
      const ny = v.y / len;
      const nz = v.z / len;
      // Irregular asteroid morphology: triaxial ellipsoid shape + low-frequency crater basins
      const triaxial = 1.0 + 0.08 * (nx * nx - ny * ny) - 0.04 * (nz * nz);
      const terrain = 0.06 * Math.sin(nx * 6.0 + 0.5) * Math.cos(ny * 7.0) * Math.sin(nz * 5.0)
                    + 0.025 * Math.sin(nx * 12.0) * Math.cos(nz * 12.0);
      v.multiplyScalar(triaxial + terrain);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // 2. Short and Extended Plume Geometries (Compact, sleek scale behind asteroid)
  const { shortPlumeGeo, extPlumeGeo } = useMemo(() => {
    const shortG = new THREE.ConeGeometry(0.009, 0.07, 16, 1, true);
    shortG.translate(0, -0.035, 0);

    const extG = new THREE.ConeGeometry(0.022, 0.45, 16, 1, true);
    extG.translate(0, -0.225, 0);

    return { shortPlumeGeo: shortG, extPlumeGeo: extG };
  }, []);

  // 3. Biosphere Clearance Trajectory Lines (Tightly proportioned envelope)
  const { northLineGeo, southLineGeo } = useMemo(() => {
    const northPts = [
      new THREE.Vector3(0, 0.018, 0.292),
      new THREE.Vector3(0, 0.18, 0.65),
      new THREE.Vector3(0, 0.35, 1.15)
    ];
    const southPts = [
      new THREE.Vector3(0, -0.018, 0.292),
      new THREE.Vector3(0, -0.18, 0.65),
      new THREE.Vector3(0, -0.35, 1.15)
    ];
    return {
      northLineGeo: new THREE.BufferGeometry().setFromPoints(northPts),
      southLineGeo: new THREE.BufferGeometry().setFromPoints(southPts)
    };
  }, []);

  // 4. Relativistic Plasma Particle Stream (Twin Canted Cones @ 0.3c, tight particle plume)
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
      const nozzleY = isNorth ? 0.018 : -0.018;
      const cantSign = isNorth ? 1.0 : -1.0;

      maxLifetimes[i] = 0.35 + Math.random() * 0.20;
      lifetimes[i] = Math.random() * maxLifetimes[i];
      const speed = 1.8 + Math.random() * 0.6;

      velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.015;
      velocities[i * 3 + 1] = cantSign * sinCant * speed + (Math.random() - 0.5) * 0.01;
      velocities[i * 3 + 2] = cosCant * speed;

      const t = lifetimes[i];
      positions[i * 3 + 0] = (Math.random() - 0.5) * 0.01 + velocities[i * 3 + 0] * t;
      positions[i * 3 + 1] = nozzleY + (Math.random() - 0.5) * 0.01 + velocities[i * 3 + 1] * t;
      positions[i * 3 + 2] = 0.292 + velocities[i * 3 + 2] * t;

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
    const currentFrame = activeSimState.frame || useSimStore.getState().currentFrame;
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
        const nozzleY = isNorth ? 0.018 : -0.018;
        const cantSign = isNorth ? 1.0 : -1.0;

        lifetimes[i] = 0;
        maxLifetimes[i] = 0.35 + Math.random() * 0.20;
        const speed = 1.8 + Math.random() * 0.6;

        velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.015;
        velocities[i * 3 + 1] = cantSign * sinCant * speed + (Math.random() - 0.5) * 0.01;
        velocities[i * 3 + 2] = cosCant * speed;

        positions[i * 3 + 0] = (Math.random() - 0.5) * 0.01;
        positions[i * 3 + 1] = nozzleY + (Math.random() - 0.5) * 0.01;
        positions[i * 3 + 2] = 0.292;
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
            map={asteroidTexture || undefined}
            bumpMap={asteroidTexture || undefined}
            bumpScale={0.025}
            color={asteroidTexture ? 0xd4c8b8 : 0x7a7268}
            roughness={0.88}
            metalness={0.08}
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

        {/* 3. Upgraded Flash Vaporization Chamber & External Thruster Mounting Assembly */}
        {/* Rock Interface Cradle Mount (starts at outer asteroid rock face) */}
        <mesh position={[0, 0, 0.238]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.038, 0.052, 0.030, 8]} />
          <meshStandardMaterial color={0x1e293b} metalness={0.85} roughness={0.35} />
        </mesh>

        {/* Machined Titanium Backing Plate & Structural Flange (Cleanly on outside surface) */}
        <mesh position={[0, 0, 0.254]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.058, 0.058, 0.008, 24]} />
          <meshStandardMaterial color={0x94a3b8} metalness={0.95} roughness={0.12} />
        </mesh>
        <mesh position={[0, 0, 0.256]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.042, 0.042, 0.008, 16]} />
          <meshStandardMaterial color={0x475569} metalness={0.90} roughness={0.20} />
        </mesh>

        {/* High-Tech Vaporization Chamber Assembly */}
        <group position={[0, 0, 0.246]}>
          {/* Chamber Casing */}
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.022, 0.022, 0.032, 16]} />
            <meshStandardMaterial color={0x0f172a} metalness={0.85} roughness={0.25} />
          </mesh>

          {/* Intense Ionization Plasma Core */}
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.015, 0.015, 0.034, 16]} />
            <meshStandardMaterial
              color={0xff8800}
              emissive={0xff4400}
              emissiveIntensity={1.4}
              roughness={0.2}
            />
          </mesh>

          {/* Magnetic Confinement Coils (Toroidal Superconducting Rings) */}
          <mesh position={[0, 0, -0.012]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.025, 0.0035, 12, 24]} />
            <meshStandardMaterial color={0x38bdf8} emissive={0x0284c7} emissiveIntensity={0.8} metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[0, 0, 0.0]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.026, 0.0035, 12, 24]} />
            <meshStandardMaterial color={0x38bdf8} emissive={0x0284c7} emissiveIntensity={0.8} metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[0, 0, 0.012]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.025, 0.0035, 12, 24]} />
            <meshStandardMaterial color={0x38bdf8} emissive={0x0284c7} emissiveIntensity={0.8} metalness={0.9} roughness={0.1} />
          </mesh>

          {/* Heat-Dissipating Radial Cooling Fins */}
          <mesh position={[0.025, 0, 0]} rotation={[0, 0, 0]}>
            <boxGeometry args={[0.012, 0.003, 0.028]} />
            <meshStandardMaterial color={0x64748b} metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[-0.025, 0, 0]} rotation={[0, 0, 0]}>
            <boxGeometry args={[0.012, 0.003, 0.028]} />
            <meshStandardMaterial color={0x64748b} metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.025, 0]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.012, 0.003, 0.028]} />
            <meshStandardMaterial color={0x64748b} metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, -0.025, 0]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.012, 0.003, 0.028]} />
            <meshStandardMaterial color={0x64748b} metalness={0.9} roughness={0.2} />
          </mesh>
        </group>

        {/* 4. Sleek Miniature 3D Callout Label for Plasma Vaporisation Chamber */}
        <Html
          center
          distanceFactor={1.6}
          position={[0, 0.046, 0.250]}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
            whiteSpace: 'nowrap'
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1px'
            }}
          >
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.88)',
                border: '1px solid rgba(56, 189, 248, 0.65)',
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.5)',
                borderRadius: '3px',
                padding: '1px 4px',
                fontSize: '6.5px',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 600,
                letterSpacing: '0.06em',
                color: '#38bdf8',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                lineHeight: 1.2
              }}
            >
              <span
                style={{
                  width: '3.5px',
                  height: '3.5px',
                  borderRadius: '50%',
                  backgroundColor: '#f59e0b',
                  boxShadow: '0 0 3px #f59e0b'
                }}
              />
              Plasma Vaporisation Chamber
            </div>
            <div
              style={{
                width: '1px',
                height: '5px',
                background: 'linear-gradient(to bottom, rgba(56, 189, 248, 0.75), transparent)'
              }}
            />
          </div>
        </Html>

        {/* 5. Dual Canted Relativistic Thruster Nozzles (±5.0° Out-of-Ecliptic Canting) */}
        {/* North Nozzle */}
        <mesh position={[0, 0.018, 0.274]} rotation={[-Math.PI / 2 - CANT_ANGLE_RAD, 0, 0]} castShadow receiveShadow>
          <coneGeometry args={[0.010, 0.035, 12, 1, true]} />
          <meshStandardMaterial color={0x222222} metalness={0.9} roughness={0.2} />
        </mesh>
        {/* South Nozzle */}
        <mesh position={[0, -0.018, 0.274]} rotation={[-Math.PI / 2 + CANT_ANGLE_RAD, 0, 0]} castShadow receiveShadow>
          <coneGeometry args={[0.010, 0.035, 12, 1, true]} />
          <meshStandardMaterial color={0x222222} metalness={0.9} roughness={0.2} />
        </mesh>

        {/* 6. Short Illustrative Exhaust Plumes (±5.0° Canting) */}
        <mesh
          ref={shortPlume1Ref}
          geometry={shortPlumeGeo}
          position={[0, 0.018, 0.292]}
          rotation={[-Math.PI / 2 - CANT_ANGLE_RAD, 0, 0]}
        >
          <meshBasicMaterial
            color={0x00d4ea}
            transparent
            opacity={0.30}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh
          ref={shortPlume2Ref}
          geometry={shortPlumeGeo}
          position={[0, -0.018, 0.292]}
          rotation={[-Math.PI / 2 + CANT_ANGLE_RAD, 0, 0]}
        >
          <meshBasicMaterial
            color={0x00d4ea}
            transparent
            opacity={0.30}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* 7. Extended Out-of-Ecliptic Bi-Conical Plume Corridors (Visual Canting 28°) */}
        <mesh
          ref={extPlume1Ref}
          geometry={extPlumeGeo}
          position={[0, 0.018, 0.292]}
          rotation={[-Math.PI / 2 - VISUAL_CANT_ANGLE_RAD, 0, 0]}
        >
          <meshBasicMaterial
            color={0x00b4d8}
            transparent
            opacity={0.05}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh
          ref={extPlume2Ref}
          geometry={extPlumeGeo}
          position={[0, -0.018, 0.292]}
          rotation={[-Math.PI / 2 + VISUAL_CANT_ANGLE_RAD, 0, 0]}
        >
          <meshBasicMaterial
            color={0x00b4d8}
            transparent
            opacity={0.05}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* 8. Plume Safe Biosphere Clearance Envelope */}
        {/* Out-of-ecliptic clearance rings */}
        <mesh position={[0, 0.18, 0.65]}>
          <ringGeometry args={[0.035, 0.045, 32]} />
          <meshBasicMaterial color={0x38bdf8} transparent opacity={0.16} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.18, 0.65]}>
          <ringGeometry args={[0.035, 0.045, 32]} />
          <meshBasicMaterial color={0x38bdf8} transparent opacity={0.16} side={THREE.DoubleSide} />
        </mesh>

        {/* Corridor trajectory lines */}
        <primitive
          object={
            new THREE.Line(
              northLineGeo,
              new THREE.LineBasicMaterial({ color: 0x00b4d8, transparent: true, opacity: 0.16 })
            )
          }
        />
        <primitive
          object={
            new THREE.Line(
              southLineGeo,
              new THREE.LineBasicMaterial({ color: 0x00b4d8, transparent: true, opacity: 0.16 })
            )
          }
        />

        {/* Biosphere Protection Shield Perimeter Ring (Z = 0.65, radius 0.18) */}
        <mesh position={[0, 0, 0.65]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, 0.19, 48]} />
          <meshBasicMaterial color={0x10b981} transparent opacity={0.16} side={THREE.DoubleSide} />
        </mesh>

        {/* 9. Relativistic Plasma Particle Stream Emitter */}
        <points geometry={particleGeometry}>
          <pointsMaterial
            size={0.014}
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
