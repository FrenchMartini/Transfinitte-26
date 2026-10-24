import { describe, expect, it } from 'vitest';
import { CELESTIAL_BODIES, CELESTIAL_LIST } from '../src/planet_data';

describe('Celestial Body Astronomy Data', () => {
  it('contains entries for all 12 celestial targets including Earth and Ceres Tug', () => {
    expect(CELESTIAL_LIST).toHaveLength(12);
    for (const name of CELESTIAL_LIST) {
      expect(CELESTIAL_BODIES[name]).toBeDefined();
      expect(CELESTIAL_BODIES[name].name).toBe(name);
      expect(CELESTIAL_BODIES[name].radiusKm).toBeGreaterThan(0);
      expect(CELESTIAL_BODIES[name].fact).toBeTruthy();
    }
  });

  it('maps correct audio narration endpoints for celestial bodies', () => {
    expect(CELESTIAL_BODIES['Sun'].audioUrl).toBe('/audio/sun.mp3');
    expect(CELESTIAL_BODIES['Earth'].audioUrl).toBe('/audio/earth.mp3');
    expect(CELESTIAL_BODIES['Mars'].audioUrl).toBe('/audio/mars.mp3');
    expect(CELESTIAL_BODIES['Jupiter'].audioUrl).toBe('/audio/jupiter.mp3');
    expect(CELESTIAL_BODIES['Saturn'].audioUrl).toBe('/audio/saturn.mp3');
    expect(CELESTIAL_BODIES['Uranus'].audioUrl).toBe('/audio/uranus.mp3');
    expect(CELESTIAL_BODIES['Neptune'].audioUrl).toBe('/audio/neptune.mp3');
  });

  it('correctly marks mission assets', () => {
    expect(CELESTIAL_BODIES['Earth'].isMissionAsset).toBe(true);
    expect(CELESTIAL_BODIES['Tug'].isMissionAsset).toBe(true);
    expect(CELESTIAL_BODIES['Moon'].isMissionAsset).toBe(true);
    expect(CELESTIAL_BODIES['Mars'].isMissionAsset).toBeFalsy();
  });
});
