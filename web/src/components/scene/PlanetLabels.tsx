import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useSimStore } from '../../store/sim';
import { SCENE_SCALE_AU, MOON_ROTATION_PERIOD_SECONDS } from '../../config';
import { eclipticToScene } from '../../coords';
import { activeSimState } from '../../interpolation';
import { BODIES } from '../../data/bodies';

const LABELED_BODIES = [
  'Sun',
  'Mercury',
  'Venus',
  'Earth',
  'Moon',
  'Tug',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune'
];

interface BodyLabelProps {
  name: string;
}

function BodyLabel({ name }: BodyLabelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const labelDivRef = useRef<HTMLDivElement>(null);
  const cameraFocus = useSimStore((s) => s.cameraFocus);
  const focusBody = useSimStore((s) => s.focusBody);
  const isFocused = cameraFocus === name;
  const { camera } = useThree();

  useFrame(() => {
    if (!groupRef.current) return;
    const currentFrame = activeSimState.frame || useSimStore.getState().currentFrame;
    const currentYear = activeSimState.year || useSimStore.getState().currentYear;
    const simTime_s = activeSimState.time_s || useSimStore.getState().currentTimeSec;

    let x = 0;
    let y = 0;
    let z = 0;

    if (name === 'Sun') {
      x = 0;
      y = 2.6;
      z = 0;
    } else if (name === 'Earth') {
      const earth = currentFrame?.bodies?.['Earth'];
      if (earth) {
        const ePos = eclipticToScene([earth.x, earth.y, earth.z], [0, 0, 0], SCENE_SCALE_AU);
        x = ePos[0];
        y = ePos[1] + 0.8;
        z = ePos[2];
      }
    } else if (name === 'Moon') {
      const earth = currentFrame?.bodies?.['Earth'];
      if (earth) {
        const ePos = eclipticToScene([earth.x, earth.y, earth.z], [0, 0, 0], SCENE_SCALE_AU);
        const lunarAngle = (2.0 * Math.PI * simTime_s) / MOON_ROTATION_PERIOD_SECONDS;
        const lunarDist = 0.92;
        x = ePos[0] + Math.cos(lunarAngle) * lunarDist;
        y = ePos[1] + Math.sin(lunarAngle) * 0.089 * lunarDist + 0.4;
        z = ePos[2] + Math.sin(lunarAngle) * lunarDist;
      }
    } else if (name === 'Tug') {
      const earth = currentFrame?.bodies?.['Earth'];
      if (earth) {
        const ePos = eclipticToScene([earth.x, earth.y, earth.z], [0, 0, 0], SCENE_SCALE_AU);
        let dirX = 0;
        let dirY = 0;
        let dirZ = 0;
        const tugData = currentFrame.bodies?.['Tug'];
        if (tugData) {
          const tRaw = eclipticToScene([tugData.x, tugData.y, tugData.z], [0, 0, 0], SCENE_SCALE_AU);
          dirX = tRaw[0] - ePos[0];
          dirY = tRaw[1] - ePos[1];
          dirZ = tRaw[2] - ePos[2];
        }
        const len = Math.hypot(dirX, dirY, dirZ);
        if (len < 1e-4) {
          const vScene = eclipticToScene([earth.vx, earth.vy, earth.vz], [0, 0, 0], 1.0);
          dirX = vScene[0];
          dirY = vScene[1];
          dirZ = vScene[2];
        }
        const norm = Math.hypot(dirX, dirY, dirZ) || 1;
        const standoff = 1.4;
        x = ePos[0] + (dirX / norm) * standoff;
        y = ePos[1] + (dirY / norm) * standoff + 0.5;
        z = ePos[2] + (dirZ / norm) * standoff;
      }
    } else {
      const data = BODIES[name];
      if (data) {
        const rScene = data.orbitAu * SCENE_SCALE_AU;
        const theta = (currentYear / data.periodYr) * 2 * Math.PI;
        x = rScene * Math.cos(theta);
        y = data.radiusKm > 20000 ? 1.5 : 0.6;
        z = -rScene * Math.sin(theta);
      }
    }

    groupRef.current.position.set(x, y, z);

    if (labelDivRef.current) {
      const dist = camera.position.distanceTo(groupRef.current.position);
      const opacity = isFocused ? 1 : Math.max(0, Math.min(1, 1 - (dist - 30) / 100));
      labelDivRef.current.style.opacity = String(opacity);
      labelDivRef.current.style.display = opacity <= 0.04 ? 'none' : 'block';
    }
  });

  return (
    <group ref={groupRef}>
      <Html
        center
        zIndexRange={[15, 0]}
        style={{
          pointerEvents: 'auto',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div
          ref={labelDivRef}
          onClick={(e) => {
            e.stopPropagation();
            focusBody(name);
          }}
          style={{
            background: 'var(--panel)',
            border: isFocused ? '1px solid var(--accent)' : '1px solid var(--line)',
            color: isFocused ? 'var(--accent)' : 'var(--text)',
            padding: '2px 6px',
            borderRadius: 'var(--radius)',
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            transition: 'border-color 150ms ease, color 150ms ease',
          }}
        >
          {name}
        </div>
      </Html>
    </group>
  );
}

export function PlanetLabels() {
  const showOrbits = useSimStore((s) => s.showOrbits);

  if (!showOrbits) return null;

  return (
    <group>
      {LABELED_BODIES.map((name) => (
        <BodyLabel key={name} name={name} />
      ))}
    </group>
  );
}
