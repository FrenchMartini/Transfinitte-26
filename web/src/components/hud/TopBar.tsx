import { useSimStore } from '../../store/sim';
import styles from './TopBar.module.css';

export function TopBar() {
  const showOrbits = useSimStore((s) => s.showOrbits);
  const toggleOrbits = useSimStore((s) => s.toggleOrbits);
  const currentYear = useSimStore((s) => s.currentYear);
  const currentTimeSec = useSimStore((s) => s.currentTimeSec);
  const musicEnabled = useSimStore((s) => s.musicEnabled);
  const narrationEnabled = useSimStore((s) => s.narrationEnabled);
  const toggleMusic = useSimStore((s) => s.toggleMusic);
  const toggleNarration = useSimStore((s) => s.toggleNarration);
  const setOptionsOpen = useSimStore((s) => s.setOptionsOpen);
  const setBenchmarksOpen = useSimStore((s) => s.setBenchmarksOpen);
  const setCantingOpen = useSimStore((s) => s.setCantingOpen);

  return (
    <header className={styles.topBar}>
      <div className={styles.leftSection}>
        <img src="/delta.webp" alt="Delta" className={styles.appLogo} />
        <span className={styles.appTitle}>Far Orbit</span>
        <div style={{ marginLeft: '12px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontSize: 'var(--font-size-label)', color: 'var(--muted)', textTransform: 'uppercase' }}>Mission</span>
          <span className="mono" style={{ fontSize: 'var(--font-size-body)', color: 'var(--text)' }}>
            Year {currentYear.toFixed(2)}
          </span>
          <span className="mono" style={{ fontSize: 'var(--font-size-label)', color: 'var(--muted)' }}>
            ({(currentTimeSec / 1e9).toFixed(1)} Gs)
          </span>
        </div>
      </div>

      <div className={styles.rightSection}>
        <button
          type="button"
          className={`${styles.controlBtn} ${showOrbits ? styles.controlBtnActive : ''}`}
          onClick={toggleOrbits}
          title="Toggle reference orbits (O)"
        >
          Orbits
        </button>

        <button
          type="button"
          className={`${styles.controlBtn} ${musicEnabled ? styles.controlBtnActive : ''}`}
          onClick={toggleMusic}
          title="Toggle ambient background music"
        >
          Music
        </button>

        <button
          type="button"
          className={`${styles.controlBtn} ${narrationEnabled ? styles.controlBtnActive : ''}`}
          onClick={toggleNarration}
          title="Toggle celestial voice narration"
        >
          Narration
        </button>

        <button
          type="button"
          className={styles.controlBtn}
          onClick={() => setCantingOpen(true)}
          title="Plume Canting & Protection Architecture (C)"
        >
          Plumes
        </button>

        <button
          type="button"
          className={styles.controlBtn}
          onClick={() => setBenchmarksOpen(true)}
          title="Astrodynamic Verification Benchmarks"
        >
          Verification
        </button>

        <button
          type="button"
          className={styles.controlBtn}
          onClick={() => setOptionsOpen(true)}
          aria-label="Options"
        >
          Options
        </button>
      </div>
    </header>
  );
}
