import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSimStore } from '../../store/sim';
import {
  SCENE_SCALE_AU,
  EARTH_ROTATION_PERIOD_SECONDS,
  MOON_ROTATION_PERIOD_SECONDS,
  MERCURY_ROTATION_PERIOD_SECONDS,
  VENUS_ROTATION_PERIOD_SECONDS,
  MARS_ROTATION_PERIOD_SECONDS,
  JUPITER_ROTATION_PERIOD_SECONDS,
  SATURN_ROTATION_PERIOD_SECONDS,
  URANUS_ROTATION_PERIOD_SECONDS,
  NEPTUNE_ROTATION_PERIOD_SECONDS,
  PHOBOS_ORBIT_PERIOD_SECONDS,
  DEIMOS_ORBIT_PERIOD_SECONDS,
  IO_ORBIT_PERIOD_SECONDS,
  EUROPA_ORBIT_PERIOD_SECONDS,
  GANYMEDE_ORBIT_PERIOD_SECONDS,
  CALLISTO_ORBIT_PERIOD_SECONDS,
  TITAN_ORBIT_PERIOD_SECONDS,
  ENCELADUS_ORBIT_PERIOD_SECONDS,
  TETHYS_ORBIT_PERIOD_SECONDS,
  RHEA_ORBIT_PERIOD_SECONDS,
  TITANIA_ORBIT_PERIOD_SECONDS,
  OBERON_ORBIT_PERIOD_SECONDS,
  TRITON_ORBIT_PERIOD_SECONDS
} from '../../config';
import { eclipticToScene } from '../../coords';
import { BODIES } from '../../data/bodies';
import { getTexture } from '../../utils/textureLoader';
import { activeSimState } from '../../interpolation';
import {
  createSunPlasmaMaterial,
  createSunHotCoreMaterial,
  createSunOuterPlasmaMaterial,
  createSunCoronaMaterial,
  createSunCoronaGlowMaterial
} from '../../shaders/sun_plasma';

const PLANET_CONFIGS = [
  { name: 'Mercury', radius: 0.22, texture: '/textures/mercury.jpeg', defaultColor: 0x94a3b8, period_s: MERCURY_ROTATION_PERIOD_SECONDS, spinRate: 0.12, tiltDeg: 0.03 },
  { name: 'Venus', radius: 0.34, texture: '/textures/venus.jpeg', defaultColor: 0xfde047, period_s: VENUS_ROTATION_PERIOD_SECONDS, spinRate: -0.10, tiltDeg: 177.36 },
  { name: 'Mars', radius: 0.28, texture: '/textures/mars.jpg', defaultColor: 0xc2410c, period_s: MARS_ROTATION_PERIOD_SECONDS, spinRate: 0.28, tiltDeg: 25.19 },
  { name: 'Jupiter', radius: 0.78, texture: '/textures/jupiter.jpg', defaultColor: 0xd97706, period_s: JUPITER_ROTATION_PERIOD_SECONDS, spinRate: 0.55, tiltDeg: 3.13 },
  { name: 'Saturn', radius: 0.65, texture: '/textures/saturn.jpg', defaultColor: 0xeab308, hasRing: true, period_s: SATURN_ROTATION_PERIOD_SECONDS, spinRate: 0.48, tiltDeg: 26.73 },
  { name: 'Uranus', radius: 0.50, texture: '/textures/uranus.jpeg', defaultColor: 0xa5f3fc, hasUranusRing: true, period_s: URANUS_ROTATION_PERIOD_SECONDS, spinRate: -0.55, tiltDeg: 97.77 },
  { name: 'Neptune', radius: 0.48, texture: '/textures/neptune.jpg', defaultColor: 0x38bdf8, period_s: NEPTUNE_ROTATION_PERIOD_SECONDS, spinRate: 0.35, tiltDeg: 28.32 }
];

export function Planets() {
  const earthRef = useRef<THREE.Group>(null);
  const earthGlobeRef = useRef<THREE.Mesh>(null);
  const earthCloudsRef = useRef<THREE.Mesh>(null);
  const moonRef = useRef<THREE.Mesh>(null);

  // Mars moons
  const phobosRef = useRef<THREE.Mesh>(null);
  const deimosRef = useRef<THREE.Mesh>(null);

  // Jupiter moons
  const ioRef = useRef<THREE.Mesh>(null);
  const europaRef = useRef<THREE.Mesh>(null);
  const ganymedeRef = useRef<THREE.Mesh>(null);
  const callistoRef = useRef<THREE.Mesh>(null);

  // Saturn moons
  const enceladusRef = useRef<THREE.Mesh>(null);
  const tethysRef = useRef<THREE.Mesh>(null);
  const rheaRef = useRef<THREE.Mesh>(null);
  const titanRef = useRef<THREE.Mesh>(null);

  // Uranus moons
  const titaniaRef = useRef<THREE.Mesh>(null);
  const oberonRef = useRef<THREE.Mesh>(null);

  // Neptune moon
  const tritonRef = useRef<THREE.Mesh>(null);

  const planetRefs = useRef<Record<string, THREE.Group>>({});
  const globeRefs = useRef<Record<string, THREE.Mesh>>({});

  const focusBody = useSimStore((s) => s.focusBody);

  // Textures
  const earthTexture = useMemo(() => getTexture('/textures/earth.jpg'), []);
  const earthCloudsTexture = useMemo(() => getTexture('/textures/earth_clouds.png'), []);
  const moonTexture = useMemo(() => getTexture('/textures/moon.jpg'), []);
  const saturnRingTexture = useMemo(() => getTexture('/textures/saturn_ring.png'), []);

  // Sun Procedural Plasma & Corona Materials (Fiery Orange Sun from legacy)
  const sunMaterials = useMemo(() => {
    return {
      plasma: createSunPlasmaMaterial(),
      hotCore: createSunHotCoreMaterial(),
      outerPlasma: createSunOuterPlasmaMaterial(),
      corona: createSunCoronaMaterial(),
      coronaGlow: createSunCoronaGlowMaterial()
    };
  }, []);

  // Saturn ring geometry with radial UV coordinates (Saturn radius 0.65)
  const saturnRingGeo = useMemo(() => {
    const innerR = 0.65 * 1.25;
    const outerR = 0.65 * 2.38;
    const geo = new THREE.RingGeometry(innerR, outerR, 128, 16);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const r = Math.sqrt(x * x + y * y);
      const u = (r - innerR) / (outerR - innerR);
      uv.setXY(i, u, 0.5);
    }
    uv.needsUpdate = true;
    return geo;
  }, []);

  // Earth Rayleigh scattering atmosphere Fresnel rim shader
  const atmosphereMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        void main() {
          vNormal = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        void main() {
          vec3 sunDir = normalize(-vWorldPosition);
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          float sunDot = dot(vNormal, sunDir);
          float sunFacing = smoothstep(-0.2, 0.4, sunDot);
          float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
          rim = pow(rim, 2.8);
          vec3 atmoColor = vec3(0.35, 0.68, 1.0);
          float alpha = rim * 0.75 * sunFacing;
          gl_FragColor = vec4(atmoColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false
    });
  }, []);

  useFrame((state) => {
    // 1. Animate Sun Procedural Plasma & Corona
    const t = state.clock.getElapsedTime();
    sunMaterials.plasma.uniforms.uTime.value = t;
    sunMaterials.corona.uniforms.uTime.value = t;

    // 2. Read 60 Hz Continuous Sim State (avoids 10 Hz stutter)
    const currentFrame = activeSimState.frame || useSimStore.getState().currentFrame;
    const currentYear = activeSimState.year || useSimStore.getState().currentYear;
    const simTime_s = activeSimState.time_s || useSimStore.getState().currentTimeSec;

    // 3. Earth System: Position, Obliquity & Diurnal Rotation
    const earthData = currentFrame.bodies['Earth'];
    if (earthData && earthRef.current) {
      const pos = eclipticToScene([earthData.x, earthData.y, earthData.z], [0, 0, 0], SCENE_SCALE_AU);
      earthRef.current.position.set(pos[0], pos[1], pos[2]);

      // Diurnal rotation with authentic sidereal day (86,164.1 s)
      const dayPhase_s = ((simTime_s % EARTH_ROTATION_PERIOD_SECONDS) + EARTH_ROTATION_PERIOD_SECONDS) % EARTH_ROTATION_PERIOD_SECONDS;
      const rotAngle = (dayPhase_s / EARTH_ROTATION_PERIOD_SECONDS) * 2 * Math.PI;

      if (earthGlobeRef.current) {
        earthGlobeRef.current.rotation.y = rotAngle;
      }
      if (earthCloudsRef.current) {
        // Clouds easterly super-rotation (+4% faster)
        earthCloudsRef.current.rotation.y = ((dayPhase_s * 1.04) / EARTH_ROTATION_PERIOD_SECONDS) * 2 * Math.PI;
      }

      // Moon position relative to Earth (inclination 5.145 deg, tidally locked spin)
      if (moonRef.current) {
        const lunarAngle = (2.0 * Math.PI * simTime_s) / MOON_ROTATION_PERIOD_SECONDS;
        const lunarDist = 0.92; // visual standoff matching legacy solar_system.ts:2563
        moonRef.current.position.set(
          Math.cos(lunarAngle) * lunarDist,
          Math.sin(lunarAngle) * 0.089 * lunarDist, // 5.14 deg orbital inclination
          Math.sin(lunarAngle) * lunarDist
        );
        moonRef.current.rotation.y = lunarAngle; // Tidally locked
      }
    }

    // 4. Terrestrial & Giant Planets + Their Natural Moons
    const wallTime = state.clock.getElapsedTime();
    for (const p of PLANET_CONFIGS) {
      const grp = planetRefs.current[p.name];
      const globe = globeRefs.current[p.name];
      const data = BODIES[p.name];
      if (grp && data) {
        const rScene = data.orbitAu * SCENE_SCALE_AU;
        const theta = (currentYear / data.periodYr) * 2 * Math.PI;
        grp.position.set(
          rScene * Math.cos(theta),
          0,
          -rScene * Math.sin(theta)
        );
      }

      if (globe) {
        // Physical axial rotation driven by simulation time
        const absPeriod = Math.abs(p.period_s);
        const simPhase = ((simTime_s % absPeriod) + absPeriod) % absPeriod;
        const simAngle = (simPhase / absPeriod) * 2 * Math.PI * (p.period_s >= 0 ? 1 : -1);

        // Ambient continuous rotation so planets visibly spin in real-time
        const ambientAngle = wallTime * p.spinRate;

        // Rotate globe around polar axis
        globe.rotation.y = simAngle + ambientAngle;
      }
    }

    // Martian Moons: Phobos & Deimos
    const marsPos = planetRefs.current['Mars']?.position;
    if (marsPos) {
      if (phobosRef.current) {
        const a = (2.0 * Math.PI * simTime_s) / PHOBOS_ORBIT_PERIOD_SECONDS;
        phobosRef.current.position.set(
          marsPos.x + 0.45 * Math.cos(a),
          marsPos.y + 0.45 * 0.08 * Math.sin(a),
          marsPos.z + 0.45 * Math.sin(a)
        );
        phobosRef.current.rotation.y = a;
      }
      if (deimosRef.current) {
        const a = (2.0 * Math.PI * simTime_s) / DEIMOS_ORBIT_PERIOD_SECONDS;
        deimosRef.current.position.set(
          marsPos.x + 0.72 * Math.cos(a),
          marsPos.y + 0.72 * 0.05 * Math.sin(a),
          marsPos.z + 0.72 * Math.sin(a)
        );
        deimosRef.current.rotation.y = a;
      }
    }

    // Jovian Galilean Moons: Io, Europa, Ganymede, Callisto
    const jupPos = planetRefs.current['Jupiter']?.position;
    if (jupPos) {
      if (ioRef.current) {
        const a = (2.0 * Math.PI * simTime_s) / IO_ORBIT_PERIOD_SECONDS;
        ioRef.current.position.set(jupPos.x + 1.15 * Math.cos(a), jupPos.y + 1.15 * 0.04 * Math.sin(a), jupPos.z + 1.15 * Math.sin(a));
        ioRef.current.rotation.y = a;
      }
      if (europaRef.current) {
        const a = (2.0 * Math.PI * simTime_s) / EUROPA_ORBIT_PERIOD_SECONDS;
        europaRef.current.position.set(jupPos.x + 1.48 * Math.cos(a), jupPos.y + 1.48 * 0.04 * Math.sin(a), jupPos.z + 1.48 * Math.sin(a));
        europaRef.current.rotation.y = a;
      }
      if (ganymedeRef.current) {
        const a = (2.0 * Math.PI * simTime_s) / GANYMEDE_ORBIT_PERIOD_SECONDS;
        ganymedeRef.current.position.set(jupPos.x + 1.92 * Math.cos(a), jupPos.y + 1.92 * 0.03 * Math.sin(a), jupPos.z + 1.92 * Math.sin(a));
        ganymedeRef.current.rotation.y = a;
      }
      if (callistoRef.current) {
        const a = (2.0 * Math.PI * simTime_s) / CALLISTO_ORBIT_PERIOD_SECONDS;
        callistoRef.current.position.set(jupPos.x + 2.45 * Math.cos(a), jupPos.y + 2.45 * 0.03 * Math.sin(a), jupPos.z + 2.45 * Math.sin(a));
        callistoRef.current.rotation.y = a;
      }
    }

    // Saturnian Major Moons: Enceladus, Tethys, Rhea, Titan
    const satPos = planetRefs.current['Saturn']?.position;
    if (satPos) {
      if (enceladusRef.current) {
        const a = (2.0 * Math.PI * simTime_s) / ENCELADUS_ORBIT_PERIOD_SECONDS;
        enceladusRef.current.position.set(satPos.x + 1.28 * Math.cos(a), satPos.y + 1.28 * 0.05 * Math.sin(a), satPos.z + 1.28 * Math.sin(a));
        enceladusRef.current.rotation.y = a;
      }
      if (tethysRef.current) {
        const a = (2.0 * Math.PI * simTime_s) / TETHYS_ORBIT_PERIOD_SECONDS;
        tethysRef.current.position.set(satPos.x + 1.55 * Math.cos(a), satPos.y + 1.55 * 0.04 * Math.sin(a), satPos.z + 1.55 * Math.sin(a));
        tethysRef.current.rotation.y = a;
      }
      if (rheaRef.current) {
        const a = (2.0 * Math.PI * simTime_s) / RHEA_ORBIT_PERIOD_SECONDS;
        rheaRef.current.position.set(satPos.x + 1.86 * Math.cos(a), satPos.y + 1.86 * 0.04 * Math.sin(a), satPos.z + 1.86 * Math.sin(a));
        rheaRef.current.rotation.y = a;
      }
      if (titanRef.current) {
        const a = (2.0 * Math.PI * simTime_s) / TITAN_ORBIT_PERIOD_SECONDS;
        titanRef.current.position.set(satPos.x + 2.45 * Math.cos(a), satPos.y + 2.45 * 0.03 * Math.sin(a), satPos.z + 2.45 * Math.sin(a));
        titanRef.current.rotation.y = a;
      }
    }

    // Uranian Moons: Titania & Oberon
    const uranPos = planetRefs.current['Uranus']?.position;
    if (uranPos) {
      if (titaniaRef.current) {
        const a = (2.0 * Math.PI * simTime_s) / TITANIA_ORBIT_PERIOD_SECONDS;
        titaniaRef.current.position.set(uranPos.x + 0.75 * Math.cos(a), uranPos.y + 0.75 * 0.98 * Math.sin(a), uranPos.z + 0.75 * 0.20 * Math.sin(a));
        titaniaRef.current.rotation.y = a;
      }
      if (oberonRef.current) {
        const a = (2.0 * Math.PI * simTime_s) / OBERON_ORBIT_PERIOD_SECONDS;
        oberonRef.current.position.set(uranPos.x + 1.10 * Math.cos(a), uranPos.y + 1.10 * 0.98 * Math.sin(a), uranPos.z + 1.10 * 0.20 * Math.sin(a));
        oberonRef.current.rotation.y = a;
      }
    }

    // Neptunian Moon: Triton (Retrograde)
    const nepPos = planetRefs.current['Neptune']?.position;
    if (nepPos && tritonRef.current) {
      const a = (2.0 * Math.PI * simTime_s) / TRITON_ORBIT_PERIOD_SECONDS;
      tritonRef.current.position.set(nepPos.x + 0.85 * Math.cos(a), nepPos.y + 0.85 * 0.28 * Math.sin(a), nepPos.z + 0.85 * Math.sin(a));
      tritonRef.current.rotation.y = a;
    }
  });

  return (
    <group>
      {/* 1. CINEMATIC PROCEDURAL FIERY ORANGE SUN (5-Layer Composite matching legacy lines 2077-2110) */}
      <group
        position={[0, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          focusBody('Sun');
        }}
      >
        {/* Core Solar Plasma Surface (radius 1.0) */}
        <mesh material={sunMaterials.plasma}>
          <sphereGeometry args={[1.0, 64, 64]} />
        </mesh>

        {/* Hot Inner Energy Shell (radius 0.822) */}
        <mesh material={sunMaterials.hotCore}>
          <sphereGeometry args={[0.822, 48, 48]} />
        </mesh>

        {/* Outer Rotating Plasma Shell (radius 0.866) */}
        <mesh material={sunMaterials.outerPlasma}>
          <sphereGeometry args={[0.866, 32, 32]} />
        </mesh>

        {/* Dynamic Turbulent Corona (radius 1.110) */}
        <mesh material={sunMaterials.corona}>
          <sphereGeometry args={[1.110, 64, 64]} />
        </mesh>

        {/* Soft Outer Corona Glow (radius 1.165) */}
        <mesh material={sunMaterials.coronaGlow}>
          <sphereGeometry args={[1.165, 48, 48]} />
        </mesh>
      </group>

      {/* 2. EARTH SYSTEM (Base + Obliquity + Clouds + Atmosphere + Moon) */}
      <group
        ref={earthRef}
        onClick={(e) => {
          e.stopPropagation();
          focusBody('Earth');
        }}
      >
        {/* Earth Tilted Axial Sub-Group (23.44 deg obliquity) */}
        <group rotation={[0, 0, THREE.MathUtils.degToRad(23.44)]}>
          {/* Earth Base Surface (radius 0.38 matching legacy line 2144) */}
          <mesh ref={earthGlobeRef} castShadow receiveShadow>
            <sphereGeometry args={[0.38, 64, 64]} />
            <meshStandardMaterial
              map={earthTexture ?? undefined}
              color={earthTexture ? 0xffffff : 0x1d4ed8}
              roughness={0.85}
              metalness={0.05}
            />
          </mesh>

          {/* Earth Clouds Layer (radius 0.384 matching legacy line 2161) */}
          <mesh ref={earthCloudsRef} castShadow={false} receiveShadow>
            <sphereGeometry args={[0.384, 64, 64]} />
            <meshStandardMaterial
              map={earthCloudsTexture ?? undefined}
              color={0xffffff}
              transparent
              opacity={0.45}
              depthWrite={false}
              roughness={0.95}
              metalness={0.0}
            />
          </mesh>
        </group>

        {/* Earth Atmosphere Fresnel Halo (radius 0.408 matching legacy line 2178) */}
        <mesh material={atmosphereMaterial}>
          <sphereGeometry args={[0.408, 48, 48]} />
        </mesh>

        {/* Moon (Luna) (radius 0.11 matching legacy line 2213) */}
        <mesh
          ref={moonRef}
          onClick={(e) => {
            e.stopPropagation();
            focusBody('Moon');
          }}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[0.11, 48, 48]} />
          <meshStandardMaterial
            map={moonTexture ?? undefined}
            color={moonTexture ? 0xffffff : 0x94a3b8}
            roughness={0.92}
            metalness={0.05}
          />
        </mesh>
      </group>

      {/* 3. TERRESTRIAL & GIANT PLANETS */}
      {PLANET_CONFIGS.map((p) => {
        const tex = getTexture(p.texture);
        return (
          <group
            key={p.name}
            ref={(el) => {
              if (el) planetRefs.current[p.name] = el;
            }}
            onClick={(e) => {
              e.stopPropagation();
              focusBody(p.name);
            }}
          >
            {/* Globe with axial tilt */}
            <group rotation={[0, 0, THREE.MathUtils.degToRad(p.tiltDeg)]}>
              <mesh
                ref={(el) => {
                  if (el) globeRefs.current[p.name] = el;
                }}
                castShadow
                receiveShadow
              >
                <sphereGeometry args={[p.radius, 48, 48]} />
                <meshStandardMaterial
                  map={tex ?? undefined}
                  color={tex ? 0xffffff : p.defaultColor}
                  roughness={0.75}
                  metalness={0.05}
                />
              </mesh>

              {/* Uranus Ring System aligned in equatorial plane around polar axis */}
              {p.hasUranusRing && (
                <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={false} receiveShadow>
                  <ringGeometry args={[p.radius * 1.35, p.radius * 1.80, 96]} />
                  <meshStandardMaterial
                    color={0xa5f3fc}
                    side={THREE.DoubleSide}
                    transparent
                    opacity={0.35}
                    depthWrite={false}
                    roughness={0.70}
                    metalness={0.20}
                  />
                </mesh>
              )}
            </group>

            {/* Saturn Ring System (matching legacy line 127 createSaturnRingMesh) */}
            {p.hasRing && (
              <group rotation={[Math.PI / 2 + THREE.MathUtils.degToRad(26.73), 0, 0]}>
                <mesh geometry={saturnRingGeo} castShadow receiveShadow>
                  <meshStandardMaterial
                    map={saturnRingTexture ?? undefined}
                    color={saturnRingTexture ? 0xffffff : 0xd4af37}
                    side={THREE.DoubleSide}
                    transparent
                    opacity={0.96}
                    depthWrite={false}
                    roughness={0.80}
                    metalness={0.05}
                  />
                </mesh>
              </group>
            )}
          </group>
        );
      })}

      {/* 4. NATURAL PLANETARY MOONS */}
      {/* Martian Moons */}
      <mesh ref={phobosRef} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.038, 1]} />
        <meshStandardMaterial color={0x78716c} roughness={0.92} metalness={0.05} />
      </mesh>
      <mesh ref={deimosRef} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.026, 1]} />
        <meshStandardMaterial color={0x8c7e73} roughness={0.90} metalness={0.05} />
      </mesh>

      {/* Jovian Galilean Moons */}
      <mesh ref={ioRef} castShadow receiveShadow>
        <sphereGeometry args={[0.075, 20, 20]} />
        <meshStandardMaterial color={0xf59e0b} roughness={0.80} metalness={0.10} />
      </mesh>
      <mesh ref={europaRef} castShadow receiveShadow>
        <sphereGeometry args={[0.068, 20, 20]} />
        <meshStandardMaterial color={0xf0f9ff} roughness={0.35} metalness={0.05} />
      </mesh>
      <mesh ref={ganymedeRef} castShadow receiveShadow>
        <sphereGeometry args={[0.108, 24, 24]} />
        <meshStandardMaterial color={0x94a3b8} roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh ref={callistoRef} castShadow receiveShadow>
        <sphereGeometry args={[0.095, 20, 20]} />
        <meshStandardMaterial color={0x64748b} roughness={0.90} metalness={0.05} />
      </mesh>

      {/* Saturnian Major Moons */}
      <mesh ref={enceladusRef} castShadow receiveShadow>
        <sphereGeometry args={[0.042, 16, 16]} />
        <meshStandardMaterial color={0xffffff} roughness={0.20} metalness={0.0} />
      </mesh>
      <mesh ref={tethysRef} castShadow receiveShadow>
        <sphereGeometry args={[0.050, 16, 16]} />
        <meshStandardMaterial color={0xe2e8f0} roughness={0.80} metalness={0.05} />
      </mesh>
      <mesh ref={rheaRef} castShadow receiveShadow>
        <sphereGeometry args={[0.062, 20, 20]} />
        <meshStandardMaterial color={0xcbd5e1} roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh ref={titanRef} castShadow receiveShadow>
        <sphereGeometry args={[0.112, 24, 24]} />
        <meshStandardMaterial color={0xf59e0b} roughness={0.70} metalness={0.0} />
      </mesh>

      {/* Uranian Major Moons */}
      <mesh ref={titaniaRef} castShadow receiveShadow>
        <sphereGeometry args={[0.065, 16, 16]} />
        <meshStandardMaterial color={0xcbd5e1} roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh ref={oberonRef} castShadow receiveShadow>
        <sphereGeometry args={[0.060, 16, 16]} />
        <meshStandardMaterial color={0x94a3b8} roughness={0.90} metalness={0.05} />
      </mesh>

      {/* Neptunian Moon: Triton */}
      <mesh ref={tritonRef} castShadow receiveShadow>
        <sphereGeometry args={[0.078, 20, 20]} />
        <meshStandardMaterial color={0xe0f2fe} roughness={0.50} metalness={0.10} />
      </mesh>
    </group>
  );
}
