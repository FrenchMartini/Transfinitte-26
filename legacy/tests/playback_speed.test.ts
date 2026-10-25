import { describe, expect, it } from 'vitest';
import { TimelineController } from '../src/timeline';
import { ReplayData } from '../src/types';
import {
  YEAR_SECONDS,
  MIN_PLAYBACK_SPEED_YEARS_PER_SEC,
  SPEED_DAY_YEARS_PER_SEC,
  SPEED_WEEK_YEARS_PER_SEC,
  SPEED_MONTH_YEARS_PER_SEC,
  SPEED_YEAR_YEARS_PER_SEC
} from '../src/config';
import mockData from '../mock/replay_mock.json';
import {
  formatPlaybackSpeed,
  sliderToSpeed,
  speedToSlider,
  parseManualSpeed,
  speedToManualValues
} from '../src/playback_speed';

function createTimeline(): TimelineController {
  return new TimelineController(mockData as ReplayData);
}

describe('Playback speed', () => {
  it('starts at default speed of one simulated month per real second', () => {
    expect(createTimeline().speedYearsPerSec).toBe(1 / 12);
  });

  it('allows one day per second and clamps slower speeds to that minimum', () => {
    const timeline = createTimeline();
    timeline.setSpeedYearsPerSec(SPEED_DAY_YEARS_PER_SEC);
    expect(timeline.speedYearsPerSec).toBeCloseTo(SPEED_DAY_YEARS_PER_SEC, 8);
    timeline.setSpeedYearsPerSec(0);
    expect(timeline.speedYearsPerSec).toBe(MIN_PLAYBACK_SPEED_YEARS_PER_SEC);
  });

  it('advances exactly one day in one real second at day speed', () => {
    const timeline = createTimeline();
    timeline.setSpeedYearsPerSec(SPEED_DAY_YEARS_PER_SEC);
    const startTime = timeline.currentTime_s;
    timeline.play();
    timeline.tick(1000);
    timeline.tick(2000);
    expect(timeline.currentTime_s - startTime).toBeCloseTo(86400, 1);
  });

  it('advances exactly one twelfth of a year in one real second at month speed', () => {
    const timeline = createTimeline();
    timeline.setSpeedYearsPerSec(SPEED_MONTH_YEARS_PER_SEC);
    const startTime = timeline.currentTime_s;
    timeline.play();
    timeline.tick(1000);
    timeline.tick(2000);
    expect(timeline.currentTime_s - startTime).toBeCloseTo(YEAR_SECONDS / 12, 6);
  });

  it('maps the slider from one day/s to 500 years/s with finer control at the low end', () => {
    expect(sliderToSpeed(0)).toBeCloseTo(MIN_PLAYBACK_SPEED_YEARS_PER_SEC, 8);
    expect(sliderToSpeed(1)).toBe(500);
    for (const speed of [SPEED_DAY_YEARS_PER_SEC, SPEED_WEEK_YEARS_PER_SEC, SPEED_MONTH_YEARS_PER_SEC, 1, 50, 500]) {
      expect(sliderToSpeed(speedToSlider(speed))).toBeCloseTo(speed, 6);
    }
  });

  it('labels speeds from days to weeks, months, and years', () => {
    expect(formatPlaybackSpeed(SPEED_DAY_YEARS_PER_SEC)).toBe('1 day/s');
    expect(formatPlaybackSpeed(SPEED_WEEK_YEARS_PER_SEC)).toBe('1 week/s');
    expect(formatPlaybackSpeed(SPEED_MONTH_YEARS_PER_SEC)).toBe('1 month/s');
    expect(formatPlaybackSpeed(0.5)).toBe('6 months/s');
    expect(formatPlaybackSpeed(SPEED_YEAR_YEARS_PER_SEC)).toBe('1 yr/s');
    expect(formatPlaybackSpeed(500)).toBe('500 yr/s');
  });

  it('parses manual speed inputs across day, week, month, and year units', () => {
    expect(parseManualSpeed(1, 'day')).toBeCloseTo(SPEED_DAY_YEARS_PER_SEC, 8);
    expect(parseManualSpeed(7, 'day')).toBeCloseTo(SPEED_WEEK_YEARS_PER_SEC, 6);
    expect(parseManualSpeed(1, 'week')).toBeCloseTo(SPEED_WEEK_YEARS_PER_SEC, 6);
    expect(parseManualSpeed(1, 'month')).toBeCloseTo(SPEED_MONTH_YEARS_PER_SEC, 6);
    expect(parseManualSpeed(1, 'year')).toBeCloseTo(SPEED_YEAR_YEARS_PER_SEC, 6);
    expect(parseManualSpeed(25, 'year')).toBe(25);
  });

  it('converts speed to manual values and units accurately', () => {
    const dayVal = speedToManualValues(SPEED_DAY_YEARS_PER_SEC);
    expect(dayVal.unit).toBe('day');
    expect(dayVal.amount).toBe(1);

    const weekVal = speedToManualValues(SPEED_WEEK_YEARS_PER_SEC);
    expect(weekVal.unit).toBe('week');
    expect(weekVal.amount).toBe(1);

    const monthVal = speedToManualValues(SPEED_MONTH_YEARS_PER_SEC);
    expect(monthVal.unit).toBe('month');
    expect(monthVal.amount).toBe(1);

    const yearVal = speedToManualValues(10);
    expect(yearVal.unit).toBe('year');
    expect(yearVal.amount).toBe(10);
  });

  it('caps controller speed at the slider maximum', () => {
    const timeline = createTimeline();
    timeline.setSpeedYearsPerSec(1000);
    expect(timeline.speedYearsPerSec).toBe(500);
  });
});
