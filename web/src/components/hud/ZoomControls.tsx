import { useSimStore } from '../../store/sim';
import styles from './ZoomControls.module.css';

export function ZoomControls() {
  const zoomIn = useSimStore((s) => s.zoomIn);
  const zoomOut = useSimStore((s) => s.zoomOut);
  const resetView = useSimStore((s) => s.resetView);

  return (
    <div className={styles.zoomControls}>
      <button
        type="button"
        id="btn-zoom-in"
        className={styles.zoomBtn}
        onClick={zoomIn}
        title="Zoom In (+)"
        aria-label="Zoom In"
      >
        +
      </button>
      <button
        type="button"
        id="btn-zoom-out"
        className={styles.zoomBtn}
        onClick={zoomOut}
        title="Zoom Out (-)"
        aria-label="Zoom Out"
      >
        −
      </button>
      <button
        type="button"
        id="btn-zoom-reset"
        className={`${styles.zoomBtn} ${styles.zoomBtnReset}`}
        onClick={resetView}
        title="Reset to Solar System View (R)"
        aria-label="Reset View"
      >
        Reset
      </button>
    </div>
  );
}
