/**
 * Timeline playback controller and scrubber synchronization.
 */

import { ReplayData, ConditionRecord } from './types';
import { YEAR_SECONDS, DEFAULT_PLAYBACK_SPEED_YEARS_PER_SEC, MIN_PLAYBACK_SPEED_YEARS_PER_SEC, MAX_PLAYBACK_SPEED_YEARS_PER_SEC } from './config';

export interface TimelineState {
  currentTime_s: number;
  currentYear: number;
  currentFrameIndex: number;
  isPlaying: boolean;
  speedYearsPerSec: number;
  duration_s: number;
}

export class TimelineController {
  private replayData: ReplayData;
  public currentTime_s: number = 0.0;
  public isPlaying: boolean = false;
  public speedYearsPerSec: number = DEFAULT_PLAYBACK_SPEED_YEARS_PER_SEC;
  private lastRafTimestamp: number | null = null;
  private onUpdateCallback?: (state: TimelineState) => void;

  constructor(replayData: ReplayData, onUpdate?: (state: TimelineState) => void) {
    this.replayData = replayData;
    this.onUpdateCallback = onUpdate;
    this.currentTime_s = this.replayData.frames[0]?.time_s ?? 0.0;
  }

  public getState(): TimelineState {
    return {
      currentTime_s: this.currentTime_s,
      currentYear: this.currentYear,
      currentFrameIndex: this.currentFrameIndex,
      isPlaying: this.isPlaying,
      speedYearsPerSec: this.speedYearsPerSec,
      duration_s: this.duration_s
    };
  }

  public get duration_s(): number {
    const frames = this.replayData.frames;
    if (frames.length === 0) return 0;
    return frames[frames.length - 1].time_s;
  }

  public get currentYear(): number {
    return this.currentTime_s / YEAR_SECONDS;
  }

  public get currentFrameIndex(): number {
    const frames = this.replayData.frames;
    if (frames.length === 0) return 0;
    // Approximate index
    const fraction = this.duration_s > 0 ? this.currentTime_s / this.duration_s : 0;
    return Math.min(frames.length - 1, Math.floor(fraction * (frames.length - 1)));
  }

  public play(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastRafTimestamp = null;
    this.notify();
  }

  public pause(): void {
    this.isPlaying = false;
    this.lastRafTimestamp = null;
    this.notify();
  }

  public togglePlay(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public setSpeedYearsPerSec(speed: number): void {
    this.speedYearsPerSec = Math.max(MIN_PLAYBACK_SPEED_YEARS_PER_SEC, Math.min(MAX_PLAYBACK_SPEED_YEARS_PER_SEC, speed));
    this.notify();
  }

  public seekTime_s(time_s: number): void {
    this.currentTime_s = Math.max(0.0, Math.min(this.duration_s, time_s));
    this.notify();
  }

  public seekFraction(fraction: number): void {
    this.seekTime_s(fraction * this.duration_s);
  }

  public tick(rafTimestamp: number): void {
    if (!this.isPlaying) {
      this.lastRafTimestamp = null;
      return;
    }

    if (this.lastRafTimestamp !== null) {
      const dtRealSeconds = (rafTimestamp - this.lastRafTimestamp) / 1000.0;
      // Advance simulation time
      const dtSimSeconds = dtRealSeconds * this.speedYearsPerSec * YEAR_SECONDS;
      this.currentTime_s += dtSimSeconds;

      if (this.currentTime_s >= this.duration_s) {
        this.currentTime_s = this.duration_s;
        this.pause();
      }
    }

    this.lastRafTimestamp = rafTimestamp;
    this.notify();
  }

  public getFailingConditionMarkers(): { condition: ConditionRecord; fraction: number; time_yr: number }[] {
    const conditions = this.replayData.conditions || [];
    const duration = this.duration_s;
    if (duration <= 0) return [];

    const markers: { condition: ConditionRecord; fraction: number; time_yr: number }[] = [];
    for (const cond of conditions) {
      if (cond.status === 'FAIL' && typeof cond.first_failing_time_s === 'number') {
        const fraction = Math.max(0, Math.min(1, cond.first_failing_time_s / duration));
        markers.push({
          condition: cond,
          fraction,
          time_yr: cond.first_failing_time_s / YEAR_SECONDS
        });
      }
    }
    return markers;
  }

  private notify(): void {
    if (this.onUpdateCallback) {
      this.onUpdateCallback({
        currentTime_s: this.currentTime_s,
        currentYear: this.currentYear,
        currentFrameIndex: this.currentFrameIndex,
        isPlaying: this.isPlaying,
        speedYearsPerSec: this.speedYearsPerSec,
        duration_s: this.duration_s
      });
    }
  }
}
