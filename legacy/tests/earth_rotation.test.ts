import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SolarSystemView } from '../src/views/solar_system';
import { SimulationFrame } from '../src/types';

// Exercise the real scene updates without requiring a canvas or WebGL context.
function createView(): SolarSystemView {
  return Object.assign(Object.create(SolarSystemView.prototype), {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: { render: vi.fn() },
    controls: { update: vi.fn() },
    bodyMeshes: new Map<string, THREE.Object3D>(),
    currentEarthPos: new THREE.Vector3(),
    framesCache: [],
    pulseTime: 0
  });
}

function updateEarth(view: SolarSystemView, time_s: number): THREE.Object3D {
  const frame: SimulationFrame = {
    time_s,
    step_index: 0,
    bodies: {
      Earth: { x: 1, y: 0, z: 0, vx: 0, vy: 30, vz: 0, mass_kg: 6e24 }
    }
  };
  view.updateBodies(frame, time_s);
  return view.scene.children[0];
}

describe('Earth daily rotation', () => {
  it('turns once every 24 simulated hours without moving its orbital position', () => {
    const view = createView();
    const earth = updateEarth(view, 0);
    const position = earth.position.clone();

    for (const [hours, angle] of [[6, Math.PI / 2], [12, Math.PI], [18, 3 * Math.PI / 2], [24, 0]]) {
      updateEarth(view, hours * 3600);
      expect(earth.rotation.y).toBeCloseTo(angle, 12);
      expect(earth.position.equals(position)).toBe(true);
    }
  });

  it('keeps the same orientation across rendered frames when time is paused', () => {
    const view = createView();
    const earth = updateEarth(view, 6 * 3600);
    const angle = earth.rotation.y;

    view.render();
    view.render();
    expect(earth.rotation.y).toBe(angle);
  });

  it('restores the same orientation after seeking forward and backward across the full replay', () => {
    const view = createView();
    const earth = updateEarth(view, 6 * 3600);

    updateEarth(view, 9566 * 365 * 86400 + 18 * 3600);
    expect(earth.rotation.y).toBeCloseTo(3 * Math.PI / 2, 12);

    updateEarth(view, 6 * 3600);
    expect(earth.rotation.y).toBeCloseTo(Math.PI / 2, 12);
    updateEarth(view, 0);
    expect(earth.rotation.y).toBe(0);
  });
});
