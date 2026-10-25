import { useRef, useState } from 'react';
import { useSimStore } from '../../store/sim';
import { exportReplayJson, parseAndValidateReplayFile } from '../../utils/replayIo';
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
  const replayData = useSimStore((s) => s.replayData);
  const setReplayData = useSimStore((s) => s.setReplayData);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastIsError, setToastIsError] = useState(false);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (msg: string, isError = false) => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    setToastIsError(isError);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const handleExport = () => {
    try {
      exportReplayJson(replayData);
      showToast(`Exported ${replayData.frames.length.toLocaleString()} frames as replay JSON`);
    } catch (err: any) {
      showToast(`Export failed: ${err.message || String(err)}`, true);
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await parseAndValidateReplayFile(file);
    if (!result.success || !result.data) {
      showToast(result.error || 'Failed to import replay file', true);
    } else {
      setReplayData(result.data);
      showToast(`Loaded ${result.frameCount?.toLocaleString()} frames (${result.concept})`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <header className={styles.topBar}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleImportFileChange}
        aria-hidden="true"
        id="topbar-replay-file-input"
      />

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
          className={styles.ioBtn}
          onClick={() => fileInputRef.current?.click()}
          title="Import Replay JSON (OCTO_JSON schema)"
          aria-label="Import Replay JSON"
          id="btn-import-replay"
        >
          <span className={styles.ioIcon}>⬇</span>
          <span>Import</span>
        </button>

        <button
          type="button"
          className={styles.ioBtn}
          onClick={handleExport}
          title="Export current simulation dataset to JSON"
          aria-label="Export Replay JSON"
          id="btn-export-replay"
        >
          <span className={styles.ioIcon}>⬆</span>
          <span>Export</span>
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

      {toastMessage && (
        <div className={`${styles.toastBanner} ${toastIsError ? styles.toastBannerError : ''}`}>
          <span>{toastIsError ? '⚠' : '✓'}</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </header>
  );
}
