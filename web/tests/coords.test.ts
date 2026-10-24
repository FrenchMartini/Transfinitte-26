import { describe, it, expect } from 'vitest';
import { eclipticToScene } from '../src/coords';

describe('eclipticToScene coordinate conversion', () => {
  it('converts ecliptic (X, Y, Z) to Three.js Y-up (X, Z, -Y) with default origin', () => {
    // Point at 1 AU along X, 0 along Y, 0 along Z
    const pos: [number, number, number] = [1.0, 0.0, 0.0];
    const scene = eclipticToScene(pos);
    expect(scene).toEqual([1.0, 0.0, 0.0]);

    // Point with Y = 2.0 (in-plane 90 deg) -> maps to scene Z = -2.0
    const posY: [number, number, number] = [0.0, 2.0, 0.0];
    const sceneY = eclipticToScene(posY);
    expect(sceneY).toEqual([0.0, 0.0, -2.0]);

    // Point with Z = 0.5 (out-of-ecliptic North) -> maps to scene Y = +0.5 (UP)
    const posZ: [number, number, number] = [0.0, 0.0, 0.5];
    const sceneZ = eclipticToScene(posZ);
    expect(sceneZ).toEqual([0.0, 0.5, 0.0]);
  });

  it('preserves right-handed coordinate frame chirality', () => {
    // Cross product of unit X and unit Y in ecliptic is unit Z
    // In scene: scene(X) = (1, 0, 0), scene(Y) = (0, 0, -1), scene(Z) = (0, 1, 0)
    // (1, 0, 0) x (0, 1, 0) = (0, 0, 1) which is -scene(Y)
    const pX = eclipticToScene([1, 0, 0]);
    const pY = eclipticToScene([0, 1, 0]);
    const pZ = eclipticToScene([0, 0, 1]);

    // Cross product in scene: pX x pZ = (0*0 - 0*1, 0*0 - 1*0, 1*1 - 0*0) = (0, 0, 1) = -pY
    expect(pX).toEqual([1, 0, 0]);
    expect(pY).toEqual([0, 0, -1]);
    expect(pZ).toEqual([0, 1, 0]);
  });

  it('subtracts floating origin in float64 before converting to scene units', () => {
    const earthPos: [number, number, number] = [1.00000000001, 2.00000000002, 0.00000000003];
    const tugPos: [number, number, number] = [1.00000000005, 2.00000000002, 0.00000000003];
    
    // When origin is Earth, tug should be at (0.00000000004, 0, 0)
    const sceneTug = eclipticToScene(tugPos, earthPos);
    expect(sceneTug[0]).toBeCloseTo(0.00000000004, 12);
    expect(sceneTug[1]).toBeCloseTo(0.0, 12);
    expect(sceneTug[2]).toBeCloseTo(0.0, 12);
  });

  it('applies scale factor correctly', () => {
    const pos: [number, number, number] = [2.0, 3.0, 4.0];
    const scene = eclipticToScene(pos, [0, 0, 0], 10.0);
    expect(scene).toEqual([20.0, 40.0, -30.0]);
  });
});
