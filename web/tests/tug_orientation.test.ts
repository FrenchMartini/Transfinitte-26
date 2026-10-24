import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolarSystemView } from '../src/views/solar_system';
import { eclipticToScene } from '../src/coords';
import { SimulationFrame } from '../src/types';

function createView() {
  // Use real tug geometry and scene transforms without a WebGL context.
  const scene = new THREE.Scene();
  const bodyMeshes = new Map<string, THREE.Object3D>();
  for (const name of ['Earth', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']) {
    const body = new THREE.Object3D();
    bodyMeshes.set(name, body);
    scene.add(body);
  }
  const view = Object.assign(Object.create(SolarSystemView.prototype), {
    scene,
    bodyMeshes,
    currentEarthPos: new THREE.Vector3(),
    towlinePositions: new Float32Array(6),
    framesCache: []
  });
  view.setupTugAndThrusters();
  return {
    view: view as SolarSystemView,
    tug: view.tugGroup as THREE.Group,
    plumes: [view.tugThrusterPlume1, view.tugThrusterPlume2] as THREE.Mesh[]
  };
}

function frameAt(x: number, y: number, withTug = true): SimulationFrame {
  const frame: SimulationFrame = {
    time_s: 0,
    step_index: 0,
    bodies: {
      Earth: { x, y, z: 0, vx: -y, vy: x, vz: 0, mass_kg: 6e24 }
    },
    tug_telemetry: {
      thrust_n: 2e17, tug_earth_distance_m: 1e9, beam_power_w: 1e25,
      beam_directions: [], propellant_spent_kg: 0
    }
  };
  if (withTug) {
    frame.bodies.Tug = { x: x - y * 0.01, y: y + x * 0.01, z: 0,
      vx: -y, vy: x, vz: 0, mass_kg: 9.4e20 };
  }
  return frame;
}

describe('Tug exhaust orientation', () => {
  it.each([[1, 0], [0, 1], [-1, 0], [0, -1]])(
    'keeps the tug ahead of Earth and both plumes aft at orbital position (%s, %s)', (x, y) => {
      const { view, tug, plumes } = createView();
      view.updateBodies(frameAt(x, y), 0);
      view.scene.updateMatrixWorld(true);
      const forward = new THREE.Vector3(...eclipticToScene([-y, x, 0]));
      const earthPosition = new THREE.Vector3(...eclipticToScene([x, y, 0], [0, 0, 0], 10));
      expect(tug.position.clone().sub(earthPosition).dot(forward)).toBeGreaterThan(0);

      for (const plume of plumes) {
        expect(Math.abs(plume.position.y)).toBeLessThan(0.12);
        plume.geometry.computeBoundingBox();
        const flameSize = plume.geometry.boundingBox!.getSize(new THREE.Vector3());
        expect(flameSize.y).toBeLessThan(0.4);
        // Cone geometry extends from the nozzle apex along its local -Y axis.
        const exhaust = new THREE.Vector3(0, -1, 0).transformDirection(plume.matrixWorld);
        expect(exhaust.dot(forward)).toBeLessThan(-0.99);
        const nozzleOffset = plume.getWorldPosition(new THREE.Vector3()).sub(tug.position);
        expect(nozzleOffset.dot(forward)).toBeLessThan(0);
        expect(plume.visible).toBe(true);
      }
      const north = new THREE.Vector3(0, -1, 0).transformDirection(plumes[0].matrixWorld);
      const south = new THREE.Vector3(0, -1, 0).transformDirection(plumes[1].matrixWorld);
      expect(north.y).toBeGreaterThan(0);
      expect(south.y).toBeLessThan(0);
      expect(north.y).toBeCloseTo(-south.y, 12);

      // Include Earth's rendered atmosphere and the largest plume pulse envelope.
      const earthEnvelope = new THREE.Sphere(earthPosition, 0.42);
      for (const plume of plumes) {
        plume.scale.set(1, 1, 1.05);
        view.scene.updateMatrixWorld(true);
        const exhaustEnvelope = new THREE.Box3().setFromObject(plume);
        expect(earthEnvelope.intersectsBox(exhaustEnvelope)).toBe(false);
      }
    }
  );

  it('points exhaust backward when the direction falls back to Earth velocity', () => {
    const { view, plumes } = createView();
    view.updateBodies(frameAt(1, 0, false), 0);
    view.scene.updateMatrixWorld(true);
    const forward = new THREE.Vector3(...eclipticToScene([0, 1, 0]));
    for (const plume of plumes) {
      const exhaust = new THREE.Vector3(0, -1, 0).transformDirection(plume.matrixWorld);
      expect(exhaust.dot(forward)).toBeLessThan(-0.99);
    }
  });
});
