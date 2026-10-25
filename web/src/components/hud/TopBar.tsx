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
  const leftPanelOpen = useSimStore((s) => s.leftPanelOpen);
  const toggleLeftPanel = useSimStore((s) => s.toggleLeftPanel);

  return (
    <header className={styles.topBar}>
      <div className={styles.leftSection}>
        <button
          type="button"
          className={styles.sidebarToggleBtn}
          onClick={toggleLeftPanel}
          title={leftPanelOpen ? "Collapse Bodies Sidebar (B)" : "Expand Bodies Sidebar (B)"}
          aria-label="Toggle Celestial Bodies Sidebar"
        >
          {leftPanelOpen ? '◀' : '▶'}
        </button>
        <img src="/delta.webp" alt="Delta" className={styles.appLogo} />
        <span className={styles.appTitle}>D-Orbit</span>
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
          role="switch"
          aria-checked={musicEnabled}
          className={`${styles.toggleBtn} ${musicEnabled ? styles.toggleBtnActive : ''}`}
          onClick={toggleMusic}
          title="Toggle ambient background music"
        >
          <span className={styles.toggleLabel}>Music</span>
          <span className={styles.toggleTrack}>
            <span className={styles.toggleThumb} />
          </span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={narrationEnabled}
          className={`${styles.toggleBtn} ${narrationEnabled ? styles.toggleBtnActive : ''}`}
          onClick={toggleNarration}
          title="Toggle celestial voice narration"
        >
          <span className={styles.toggleLabel}>Narration</span>
          <span className={styles.toggleTrack}>
            <span className={styles.toggleThumb} />
          </span>
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
