import {
  MIN_PLAYBACK_SPEED_YEARS_PER_SEC,
  MAX_PLAYBACK_SPEED_YEARS_PER_SEC,
  SPEED_DAY_YEARS_PER_SEC,
  SPEED_WEEK_YEARS_PER_SEC,
  SPEED_MONTH_YEARS_PER_SEC,
  SPEED_YEAR_YEARS_PER_SEC
} from './config';

export type SpeedUnit = 'day' | 'week' | 'month' | 'year';

const speedRatio = MAX_PLAYBACK_SPEED_YEARS_PER_SEC / MIN_PLAYBACK_SPEED_YEARS_PER_SEC;

export interface SpeedPreset {
  label: string;
  speedYearsPerSec: number;
  amount: number;
  unit: SpeedUnit;
}

export const SPEED_PRESETS: SpeedPreset[] = [
  { label: '1 Day/s', speedYearsPerSec: SPEED_DAY_YEARS_PER_SEC, amount: 1, unit: 'day' },
  { label: '1 Week/s', speedYearsPerSec: SPEED_WEEK_YEARS_PER_SEC, amount: 1, unit: 'week' },
  { label: '1 Month/s', speedYearsPerSec: SPEED_MONTH_YEARS_PER_SEC, amount: 1, unit: 'month' },
  { label: '1 Year/s', speedYearsPerSec: SPEED_YEAR_YEARS_PER_SEC, amount: 1, unit: 'year' },
  { label: '10 Yr/s', speedYearsPerSec: 10.0, amount: 10, unit: 'year' },
  { label: '100 Yr/s', speedYearsPerSec: 100.0, amount: 100, unit: 'year' },
];

export function sliderToSpeed(value: number): number {
  const fraction = Math.max(0, Math.min(1, value));
  return MIN_PLAYBACK_SPEED_YEARS_PER_SEC * Math.pow(speedRatio, fraction);
}

export function speedToSlider(speed: number): number {
  const clamped = Math.max(MIN_PLAYBACK_SPEED_YEARS_PER_SEC, Math.min(MAX_PLAYBACK_SPEED_YEARS_PER_SEC, speed));
  return Math.log(clamped / MIN_PLAYBACK_SPEED_YEARS_PER_SEC) / Math.log(speedRatio);
}

export function parseManualSpeed(amount: number, unit: SpeedUnit): number {
  const safeAmount = Math.max(0.0001, isNaN(amount) ? 1 : amount);
  let speedYearsPerSec: number;
  switch (unit) {
    case 'day':
      speedYearsPerSec = safeAmount / 365.25;
      break;
    case 'week':
      speedYearsPerSec = (safeAmount * 7.0) / 365.25;
      break;
    case 'month':
      speedYearsPerSec = safeAmount / 12.0;
      break;
    case 'year':
    default:
      speedYearsPerSec = safeAmount;
      break;
  }
  return Math.max(MIN_PLAYBACK_SPEED_YEARS_PER_SEC, Math.min(MAX_PLAYBACK_SPEED_YEARS_PER_SEC, speedYearsPerSec));
}

export function speedToManualValues(speedYearsPerSec: number): { amount: number; unit: SpeedUnit } {
  const days = speedYearsPerSec * 365.25;
  if (days < 5.5) {
    return { amount: Number(days.toFixed(days >= 1 ? 1 : 2)), unit: 'day' };
  }
  const weeks = days / 7.0;
  if (weeks < 3.8) {
    return { amount: Number(weeks.toFixed(1)), unit: 'week' };
  }
  const months = speedYearsPerSec * 12.0;
  if (months < 11.5) {
    return { amount: Number(months.toFixed(1)), unit: 'month' };
  }
  return {
    amount: Number(speedYearsPerSec.toFixed(speedYearsPerSec >= 10 ? 0 : 2)),
    unit: 'year'
  };
}

export function formatPlaybackSpeed(speed: number): string {
  const { amount, unit } = speedToManualValues(speed);
  if (unit === 'day') {
    return `${amount} ${amount === 1 ? 'day' : 'days'}/s`;
  }
  if (unit === 'week') {
    return `${amount} ${amount === 1 ? 'week' : 'weeks'}/s`;
  }
  if (unit === 'month') {
    return `${amount} ${amount === 1 ? 'month' : 'months'}/s`;
  }
  return `${amount} yr/s`;
}
