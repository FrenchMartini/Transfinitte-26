import { describe, expect, it } from 'vitest';
import { TimelineController } from '../src/timeline';
import { ReplayData } from '../src/types';
import { YEAR_SECONDS } from '../src/config';
import mockData from '../mock/replay_mock.json';
import { formatPlaybackSpeed, sliderToSpeed, speedToSlider } from '../src/playback_speed';

function createTimeline(): TimelineController {
  return new TimelineController(mockData as ReplayData);
}

describe('Playback speed', () => {
  it('starts at one simulated month per real second', () => {
    expect(createTimeline().speedYearsPerSec).toBe(1 / 12);
  });

  it('allows one month per second and clamps slower speeds to that minimum', () => {
    const timeline = createTimeline();
    timeline.setSpeedYearsPerSec(1 / 12);
    expect(timeline.speedYearsPerSec).toBe(1 / 12);
    timeline.setSpeedYearsPerSec(0);
    expect(timeline.speedYearsPerSec).toBe(1 / 12);
  });

  it('advances exactly one twelfth of a year in one real second at minimum speed', () => {
    const timeline = createTimeline();
    timeline.setSpeedYearsPerSec(1 / 12);
    const startTime = timeline.currentTime_s;
    timeline.play();
    timeline.tick(1000);
    timeline.tick(2000);
    expect(timeline.currentTime_s - startTime).toBeCloseTo(YEAR_SECONDS / 12, 6);
  });

  it('maps the slider from one month/s to 500 years/s with finer control at the low end', () => {
    expect(sliderToSpeed(0)).toBe(1 / 12);
    expect(sliderToSpeed(1)).toBe(500);
    expect(sliderToSpeed(0.01)).toBeGreaterThan(1 / 12);
    expect(sliderToSpeed(0.01)).toBeLessThan(2 / 12);
    for (const speed of [1 / 12, 0.5, 1, 50, 500]) {
      expect(sliderToSpeed(speedToSlider(speed))).toBeCloseTo(speed, 10);
    }
  });

  it('labels fractional years in months without rounding the minimum to zero years', () => {
    expect(formatPlaybackSpeed(1 / 12)).toBe('1 month/s');
    expect(formatPlaybackSpeed(0.5)).toBe('6 months/s');
    expect(formatPlaybackSpeed(1)).toBe('1 yr/s');
    expect(formatPlaybackSpeed(500)).toBe('500 yr/s');
  });

  it('caps controller speed at the slider maximum', () => {
    const timeline = createTimeline();
    timeline.setSpeedYearsPerSec(1000);
    expect(timeline.speedYearsPerSec).toBe(500);
  });
});
