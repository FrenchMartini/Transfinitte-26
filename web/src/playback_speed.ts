import { MIN_PLAYBACK_SPEED_YEARS_PER_SEC, MAX_PLAYBACK_SPEED_YEARS_PER_SEC } from './config';

const speedRatio = MAX_PLAYBACK_SPEED_YEARS_PER_SEC / MIN_PLAYBACK_SPEED_YEARS_PER_SEC;

export function sliderToSpeed(value: number): number {
  const fraction = Math.max(0, Math.min(1, value));
  return MIN_PLAYBACK_SPEED_YEARS_PER_SEC * Math.pow(speedRatio, fraction);
}

export function speedToSlider(speed: number): number {
  const clamped = Math.max(MIN_PLAYBACK_SPEED_YEARS_PER_SEC, Math.min(MAX_PLAYBACK_SPEED_YEARS_PER_SEC, speed));
  return Math.log(clamped / MIN_PLAYBACK_SPEED_YEARS_PER_SEC) / Math.log(speedRatio);
}

export function formatPlaybackSpeed(speed: number): string {
  if (speed < 1) {
    const months = Number((speed * 12).toFixed(2));
    return `${months} ${months === 1 ? 'month' : 'months'}/s`;
  }
  return `${Number(speed.toFixed(2))} yr/s`;
}
