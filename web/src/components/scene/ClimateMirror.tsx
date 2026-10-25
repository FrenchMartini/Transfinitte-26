import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSimStore } from '../../store/sim';
import { SCENE_SCALE_AU } from '../../config';
import { eclipticToScene } from '../../coords';
import { activeSimState } from '../../interpolation';

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

  const l2EarthshineBeamRef = useRef<THREE.Mesh>(null);
  const l2NightCausticRef = useRef<THREE.Mesh>(null);

  const focusBody = useSimStore((s) => s.focusBody);

  const { l1FlyerGeo, l1Offsets } = useMemo(() => {
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

    const flyerGeo = new THREE.CircleGeometry(hexR * 0.98, 32);

    return { l1FlyerGeo: flyerGeo, l1Offsets: offsets };
  }, []);

  const { l1CenterBeamGeo, l1PolarBeamGeo, l1NorthCausticGeo, l1SubsolarCausticGeo } = useMemo(() => {
    const center = new THREE.CylinderGeometry(0.28, 0.16, 0.87, 48, 1, true);
    center.translate(0, 0.435, 0);
    center.rotateX(Math.PI / 2);

    const polar = new THREE.CylinderGeometry(0.10, 0.06, 1.251, 48, 1, true);
    polar.translate(0, 1.251 * 0.5, 0);
    polar.rotateX(Math.PI / 2);

    const northC = new THREE.CircleGeometry(0.10, 48);
    const subsolarC = new THREE.CircleGeometry(0.28, 48);

    return {
      l1CenterBeamGeo: center,
      l1PolarBeamGeo: polar,
      l1NorthCausticGeo: northC,
      l1SubsolarCausticGeo: subsolarC
    };
  }, []);

  const { l2FlyerGeo, l2Offsets, l2BeamGeo, l2CausticGeo } = useMemo(() => {
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

    const flyerGeo = new THREE.CircleGeometry(l2HexR * 0.98, 32);

    const bGeo = new THREE.CylinderGeometry(0.36, 0.58, 0.87, 48, 1, true);
    bGeo.translate(0, 0.435, 0);
    bGeo.rotateX(Math.PI / 2);

    const cGeo = new THREE.CircleGeometry(0.36, 48);

    return {
      l2FlyerGeo: flyerGeo,
      l2Offsets: offsets,
      l2BeamGeo: bGeo,
      l2CausticGeo: cGeo
    };
  }, []);

  const bypassSheathGeo = useMemo(() => {
    const sheath = new THREE.CylinderGeometry(0.58, 0.26, 2.50, 48, 1, true);
    sheath.rotateX(Math.PI / 2);
    return sheath;
  }, []);

  useFrame((state) => {
    const currentFrame = activeSimState.frame || useSimStore.getState().currentFrame;
    const earth = currentFrame.bodies['Earth'];
    if (!earth || !l1GroupRef.current || !l2GroupRef.current || !bypassGroupRef.current) return;

    const earthScene = eclipticToScene([earth.x, earth.y, earth.z], [0, 0, 0], SCENE_SCALE_AU);
    const sunToEarth = new THREE.Vector3(...earthScene);
    const distEarth = sunToEarth.length();
    if (distEarth < 0.1) return;

    const sunDir = sunToEarth.clone().normalize();
    const r_au = Math.hypot(earth.x, earth.y) || 1.0;
    const d_l = Math.max(1.10, Math.min(1.50, 1.25 * Math.pow(r_au, 1.0 / 3.0)));

    const sceneUp = new THREE.Vector3(0, 1, 0);
    let lateralAxis = new THREE.Vector3().crossVectors(sceneUp, sunDir).normalize();
    if (lateralAxis.lengthSq() < 0.01) lateralAxis = new THREE.Vector3(1, 0, 0);
    const orthogonalUp = new THREE.Vector3().crossVectors(sunDir, lateralAxis).normalize();

    const l1Pos = sunToEarth.clone().addScaledVector(sunDir, -d_l);
    l1GroupRef.current.position.copy(l1Pos);
    const rotMatL1 = new THREE.Matrix4().makeBasis(lateralAxis, orthogonalUp, sunDir);
    l1GroupRef.current.setRotationFromMatrix(rotMatL1);

    const l2Pos = sunToEarth.clone().addScaledVector(sunDir, d_l);
    l2GroupRef.current.position.copy(l2Pos);
    const rotMatL2 = new THREE.Matrix4().makeBasis(lateralAxis.clone().negate(), orthogonalUp, sunDir.clone().negate());
    l2GroupRef.current.setRotationFromMatrix(rotMatL2);

    bypassGroupRef.current.position.copy(sunToEarth);
    const rotMatBypass = new THREE.Matrix4().makeBasis(lateralAxis, orthogonalUp, sunDir);
    bypassGroupRef.current.setRotationFromMatrix(rotMatBypass);
    bypassGroupRef.current.scale.set(d_l / 1.25, d_l / 1.25, d_l / 1.25);

    const time = state.clock.getElapsedTime();
    const boostFraction = Math.max(0.15, Math.min(1.0, (r_au - 1.0) / 1.70));
    const zScale = (d_l - 0.38) / 0.87;
    const pulse = 0.98 + 0.02 * Math.sin(time * 1.5);

    if (l1SunbeamRef.current) {
      l1SunbeamRef.current.scale.set(pulse, pulse, zScale);
      (l1SunbeamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.06 * boostFraction;
    }

    const pPulse1 = 0.98 + 0.02 * Math.sin(time * 1.8);
    const pPulse2 = 0.98 + 0.02 * Math.cos(time * 1.8);
    if (l1NorthPolarBeamRef.current) {
      l1NorthPolarBeamRef.current.scale.set(pPulse1, pPulse1, zScale);
      (l1NorthPolarBeamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.06 + 0.05 * boostFraction;
    }
    if (l1SouthPolarBeamRef.current) {
      l1SouthPolarBeamRef.current.scale.set(pPulse2, pPulse2, zScale);
      (l1SouthPolarBeamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.06 + 0.05 * boostFraction;
    }

    if (l1SubsolarCausticRef.current) {
      l1SubsolarCausticRef.current.position.set(0, 0, d_l - 0.375);
      (l1SubsolarCausticRef.current.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.06 * boostFraction;
    }
    if (l1NorthCausticRef.current) {
      l1NorthCausticRef.current.position.set(0, 0.36, d_l - 0.08);
      (l1NorthCausticRef.current.material as THREE.MeshBasicMaterial).opacity = 0.09 + 0.06 * boostFraction;
    }
    if (l1SouthCausticRef.current) {
      l1SouthCausticRef.current.position.set(0, -0.36, d_l - 0.08);
      (l1SouthCausticRef.current.material as THREE.MeshBasicMaterial).opacity = 0.09 + 0.06 * boostFraction;
    }

    if (l2EarthshineBeamRef.current) {
      l2EarthshineBeamRef.current.scale.set(pulse, pulse, zScale);
      (l2EarthshineBeamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.06 + 0.05 * boostFraction;
    }
    if (l2NightCausticRef.current) {
      l2NightCausticRef.current.position.set(0, 0, d_l - 0.375);
      (l2NightCausticRef.current.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.05 * boostFraction;
    }
  });

  return (
    <>
      {/* 1. L1 Day-Side Concentrating Swarm */}
      <group
        ref={l1GroupRef}
        onClick={(e) => {
          e.stopPropagation();
          focusBody('Earth');
        }}
      >
        {/* Specular Gossamer Collector Disks */}
        {l1Offsets.map(([ox, oy], idx) => (
          <mesh key={`l1-flyer-${idx}`} position={[ox, oy, 0]} geometry={l1FlyerGeo}>
            <meshStandardMaterial
              color={0xfffbeb}
              metalness={0.92}
              roughness={0.12}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}

        {/* Central Gimbal Nodes */}
        {l1Offsets.map(([ox, oy], idx) => (
          <mesh key={`l1-gimbal-${idx}`} position={[ox, oy, 0.002]}>
            <sphereGeometry args={[0.042 * 0.14, 16, 16]} />
            <meshStandardMaterial color={0x475569} metalness={0.85} roughness={0.25} />
          </mesh>
        ))}

        {/* Perimeter Guide Ring */}
        <mesh>
          <ringGeometry args={[0.24, 0.245, 48]} />
          <meshBasicMaterial color={0xf59e0b} side={THREE.DoubleSide} transparent opacity={0.16} />
        </mesh>

        {/* Central Day-Side Sunbeam */}
        <mesh ref={l1SunbeamRef} geometry={l1CenterBeamGeo}>
          <meshBasicMaterial
            color={0xfff3c4}
            transparent
            opacity={0.10}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* Sub-solar Caustics Illumination Disk */}
        <mesh ref={l1SubsolarCausticRef} geometry={l1SubsolarCausticGeo} position={[0, 0, 0.87]}>
          <meshBasicMaterial
            color={0xffe082}
            transparent
            opacity={0.10}
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
            color={0xffecc0}
            transparent
            opacity={0.08}
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
            color={0xfff8db}
            transparent
            opacity={0.12}
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
            color={0xffecc0}
            transparent
            opacity={0.08}
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
            color={0xfff8db}
            transparent
            opacity={0.12}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* 2. L2 Night-Side Concentrator */}
      <group
        ref={l2GroupRef}
        onClick={(e) => {
          e.stopPropagation();
          focusBody('Earth');
        }}
      >
        {/* Parabolic Gold Collector Disks */}
        {l2Offsets.map(([ox, oy, oz], idx) => (
          <mesh key={`l2-flyer-${idx}`} position={[ox, oy, oz]} geometry={l2FlyerGeo}>
            <meshStandardMaterial
              color={0xfef08a}
              metalness={0.92}
              roughness={0.12}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}

        {/* Central Gimbal Nodes */}
        {l2Offsets.map(([ox, oy, oz], idx) => (
          <mesh key={`l2-gimbal-${idx}`} position={[ox, oy, oz + 0.002]}>
            <sphereGeometry args={[0.082 * 0.14, 16, 16]} />
            <meshStandardMaterial color={0x475569} metalness={0.85} roughness={0.25} />
          </mesh>
        ))}

        {/* Statite Perimeter Ring */}
        <mesh position={[0, 0, 0.06]}>
          <ringGeometry args={[0.56, 0.57, 64]} />
          <meshBasicMaterial color={0x38bdf8} side={THREE.DoubleSide} transparent opacity={0.15} />
        </mesh>

        {/* Converging Reverse Earthshine Focus Beam */}
        <mesh ref={l2EarthshineBeamRef} geometry={l2BeamGeo}>
          <meshBasicMaterial
            color={0xfcd34d}
            transparent
            opacity={0.08}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* Nocturnal Caustic Glow Cap */}
        <mesh ref={l2NightCausticRef} geometry={l2CausticGeo} position={[0, 0, 0.87]}>
          <meshBasicMaterial
            color={0xf59e0b}
            transparent
            opacity={0.10}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* 3. Bypass Solar Transfer Corridor */}
      <group ref={bypassGroupRef}>
        <mesh geometry={bypassSheathGeo}>
          <meshBasicMaterial
            color={0xfef3c7}
            transparent
            opacity={0.035}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  );
}
