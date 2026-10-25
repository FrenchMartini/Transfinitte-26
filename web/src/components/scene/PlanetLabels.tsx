import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useSimStore } from '../../store/sim';
import { SCENE_SCALE_AU } from '../../config';
import { eclipticToScene } from '../../coords';
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

export function PlanetLabels() {
  const showOrbits = useSimStore((s) => s.showOrbits);
  const cameraFocus = useSimStore((s) => s.cameraFocus);
  const focusBody = useSimStore((s) => s.focusBody);
  const { camera } = useThree();

  const labelPositionsRef = useRef<Record<string, [number, number, number]>>({});
  const labelDistancesRef = useRef<Record<string, number>>({});

  useFrame(() => {
    const currentFrame = useSimStore.getState().currentFrame;
    const currentYear = useSimStore.getState().currentYear;

    // Sun
    labelPositionsRef.current['Sun'] = [0, 2.6, 0];
    labelDistancesRef.current['Sun'] = camera.position.length();

    // Earth
    const earth = currentFrame.bodies['Earth'];
    if (earth) {
      const ePos = eclipticToScene([earth.x, earth.y, earth.z], [0, 0, 0], SCENE_SCALE_AU);
      labelPositionsRef.current['Earth'] = [ePos[0], ePos[1] + 0.8, ePos[2]];
      labelDistancesRef.current['Earth'] = camera.position.distanceTo(new THREE.Vector3(...ePos));

      // Moon
      const moonAngle = currentYear * 13.37 * 2 * Math.PI;
      const moonDist = 1.1;
      const mPos: [number, number, number] = [
        ePos[0] + Math.cos(moonAngle) * moonDist,
        ePos[1] + Math.sin(moonAngle * 0.5) * 0.15 + 0.4,
        ePos[2] + Math.sin(moonAngle) * moonDist
      ];
      labelPositionsRef.current['Moon'] = mPos;
      labelDistancesRef.current['Moon'] = camera.position.distanceTo(new THREE.Vector3(...mPos));

      // Tug
      const vx = earth.vx;
      const vy = earth.vy;
      const vLen = Math.hypot(vx, vy) || 1;
      const tangX = -vy / vLen;
      const tangZ = -vx / vLen;
      const tPos: [number, number, number] = [
        ePos[0] + tangX * 0.95,
        ePos[1] + 0.5,
        ePos[2] + tangZ * 0.95
      ];
      labelPositionsRef.current['Tug'] = tPos;
      labelDistancesRef.current['Tug'] = camera.position.distanceTo(new THREE.Vector3(...tPos));
    }

    // Other planets
    for (const name of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
      const data = BODIES[name];
      if (data) {
        const rScene = data.orbitAu * SCENE_SCALE_AU;
        const theta = (currentYear / data.periodYr) * 2 * Math.PI;
        const pos: [number, number, number] = [
          rScene * Math.cos(theta),
          data.radiusKm > 20000 ? 1.5 : 0.6,
          -rScene * Math.sin(theta)
        ];
        labelPositionsRef.current[name] = pos;
        labelDistancesRef.current[name] = camera.position.distanceTo(new THREE.Vector3(...pos));
      }
    }
  });

  if (!showOrbits) return null;

  return (
    <group>
      {LABELED_BODIES.map((name) => {
        const pos = labelPositionsRef.current[name] ?? [0, 0, 0];
        const dist = labelDistancesRef.current[name] ?? 50;
        const isFocused = cameraFocus === name;

        // Distance fading: Hide if too far, keep focused body visible
        const opacity = isFocused ? 1 : Math.max(0, Math.min(1, 1 - (dist - 30) / 100));
        if (opacity <= 0.05) return null;

        return (
          <Html
            key={name}
            position={pos}
            center
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              userSelect: 'none',
              opacity,
              transition: 'opacity 200ms ease'
            }}
          >
            <div
              onClick={(e) => {
                e.stopPropagation();
                focusBody(name);
              }}
              style={{
                background: 'rgba(10, 11, 13, 0.75)',
                border: isFocused ? '1px solid var(--accent)' : '1px solid var(--line)',
                color: isFocused ? 'var(--accent)' : 'var(--text)',
                padding: '2px 6px',
                borderRadius: 'var(--radius)',
                fontSize: '10px',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                backdropFilter: 'blur(4px)'
              }}
            >
              {name}
            </div>
          </Html>
        );
      })}
    </group>
  );
}
