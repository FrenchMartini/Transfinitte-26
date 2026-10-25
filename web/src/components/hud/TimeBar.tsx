import { useState, useEffect } from 'react';
import { useSimStore } from '../../store/sim';
import {
  SPEED_PRESETS,
  sliderToSpeed,
  speedToSlider,
  parseManualSpeed,
  speedToManualValues,
  type SpeedUnit
} from '../../playback_speed';
import { YEAR_SECONDS } from '../../config';
import styles from './TimeBar.module.css';

interface TimeBarProps {
  isCollapsed?: boolean;
}

export function TimeBar({ isCollapsed = false }: TimeBarProps) {
  const isPlaying = useSimStore((s) => s.isPlaying);
  const setIsPlaying = useSimStore((s) => s.setIsPlaying);
  const playbackSpeed = useSimStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useSimStore((s) => s.setPlaybackSpeed);
  const currentYear = useSimStore((s) => s.currentYear);
  const currentTimeSec = useSimStore((s) => s.currentTimeSec);
  const seekTimeSec = useSimStore((s) => s.seekTimeSec);
  const toggleBottomPanel = useSimStore((s) => s.toggleBottomPanel);
  const frames = useSimStore((s) => s.replayData.frames);

  const minTime = frames[0].time_s;
  const maxTime = frames[frames.length - 1].time_s;
  const maxYear = maxTime / YEAR_SECONDS;

  // Manual inputs synced with playbackSpeed
  const [manualAmount, setManualAmount] = useState<number>(() => speedToManualValues(playbackSpeed).amount);
  const [manualUnit, setManualUnit] = useState<SpeedUnit>(() => speedToManualValues(playbackSpeed).unit);

  useEffect(() => {
    const { amount, unit } = speedToManualValues(playbackSpeed);
    setManualAmount(amount);
    setManualUnit(unit);
  }, [playbackSpeed]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const newSpeed = sliderToSpeed(val);
    setPlaybackSpeed(newSpeed);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setManualAmount(val);
    if (!isNaN(val) && val > 0) {
      const speed = parseManualSpeed(val, manualUnit);
      setPlaybackSpeed(speed);
    }
  };

  const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newUnit = e.target.value as SpeedUnit;
    setManualUnit(newUnit);
    if (!isNaN(manualAmount) && manualAmount > 0) {
      const speed = parseManualSpeed(manualAmount, newUnit);
      setPlaybackSpeed(speed);
    }
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    seekTimeSec(val);
  };

  const handleRewind = () => {
    seekTimeSec(minTime);
  };

  const handleStepBack = () => {
    const step = 10.0 * YEAR_SECONDS; // 10 years step matching legacy line 624
    seekTimeSec(Math.max(minTime, currentTimeSec - step));
  };

  const handleStepFwd = () => {
    const step = 10.0 * YEAR_SECONDS; // 10 years step matching legacy line 627
    seekTimeSec(Math.min(maxTime, currentTimeSec + step));
  };

  return (
    <footer
      className={`${styles.timeBar} ${isCollapsed ? styles.timeBarCollapsed : ''}`}
      aria-hidden={isCollapsed}
    >
      <div className={styles.topRow}>
        <div className={styles.leftGroup}>
          <button
            type="button"
            className={styles.timeBtn}
            onClick={handleRewind}
            aria-label="Rewind"
            title="Rewind to start"
            id="btn-rewind"
          >
            ⏮
          </button>
          <button
            type="button"
            className={styles.timeBtn}
            onClick={handleStepBack}
            aria-label="Step Back 10 Yrs"
            title="Step Back 10 Yrs (←)"
            id="btn-step-back"
          >
            ◀
          </button>
          <button
            type="button"
            className={`${styles.timeBtn} ${styles.playBtn}`}
            onClick={() => setIsPlaying(!isPlaying)}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title="Play / Pause (Space)"
            id="btn-play"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            className={styles.timeBtn}
            onClick={handleStepFwd}
            aria-label="Step Forward 10 Yrs"
            title="Step Forward 10 Yrs (→)"
            id="btn-step-fwd"
          >
            ▶
          </button>
          <div className={styles.timeDisplay}>
            <div className={`${styles.timePrimary} mono`} id="time-primary">
              Year {currentYear.toFixed(2)} / {maxYear.toFixed(2)}
            </div>
            <div className={`${styles.timeSecondary} mono`} id="time-secondary">
              Frame {Math.min(frames.length, Math.max(1, Math.floor(((currentTimeSec - minTime) / (maxTime - minTime || 1)) * (frames.length - 1)) + 1))} / {frames.length} | {(currentTimeSec / 1e9).toFixed(1)} Gs
            </div>
          </div>
        </div>

        <div className={styles.speedControlGroup}>
          <div className={styles.speedPresets} id="speed-presets">
            {SPEED_PRESETS.map((p) => {
              const isActive = Math.abs(playbackSpeed - p.speedYearsPerSec) / p.speedYearsPerSec < 0.05;
              return (
                <button
                  key={p.label}
                  type="button"
                  className={`${styles.presetPill} ${isActive ? styles.presetPillActive : ''}`}
                  onClick={() => setPlaybackSpeed(p.speedYearsPerSec)}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className={styles.speedSliderRow}>
            <span className={styles.speedTitle}>Rate:</span>
            <input
              type="range"
              id="speed-slider"
              className={styles.speedSlider}
              min="0"
              max="1"
              step="0.001"
              value={speedToSlider(playbackSpeed)}
              onChange={handleSliderChange}
              aria-label="Playback speed"
            />
            <div className={styles.manualSpeedBox}>
              <input
                type="number"
                id="speed-input-number"
                className={`${styles.speedInputNumber} mono`}
                min="0.1"
                max="500"
                step="0.1"
                value={manualAmount}
                onChange={handleAmountChange}
                aria-label="Speed magnitude"
              />
              <select
                id="speed-unit-select"
                className={styles.speedUnitSelect}
                value={manualUnit}
                onChange={handleUnitChange}
                aria-label="Speed unit"
              >
                <option value="day">d/s</option>
                <option value="week">wk/s</option>
                <option value="month">mo/s</option>
                <option value="year">yr/s</option>
              </select>
            </div>
          </div>
        </div>

        <button
          type="button"
          className={styles.collapseTimeBtn}
          onClick={toggleBottomPanel}
          title="Collapse Timeline Bar (T)"
          aria-label="Collapse Bottom Panel"
        >
          ▼
        </button>
      </div>

      <div className={styles.scrubberContainer}>
        <input
          type="range"
          className={styles.scrubberInput}
          id="timeline-scrubber"
          min={minTime}
          max={maxTime}
          value={currentTimeSec}
          onChange={handleScrubberChange}
          aria-label="Timeline Scrubber"
        />
        <div className={styles.scrubberMilestones}>
          <span className={`${styles.milestoneBadge} mono`} style={{ left: '0%' }}>1.0 AU Departure</span>
          <span className={`${styles.milestoneBadge} mono`} style={{ left: '30.8%' }}>1.52 AU Mars Crossing</span>
          <span className={`${styles.milestoneBadge} mono`} style={{ left: '70.6%' }}>2.20 AU Belt Entry</span>
          <span className={`${styles.milestoneBadge} mono`} style={{ left: '100%' }}>2.70 AU Target Orbit</span>
        </div>
      </div>
    </footer>
  );
}
