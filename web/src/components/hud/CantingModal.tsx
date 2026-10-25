import * as Dialog from '@radix-ui/react-dialog';
import { useSimStore } from '../../store/sim';
import styles from './Modals.module.css';

export function CantingModal() {
  const cantingOpen = useSimStore((s) => s.cantingOpen);
  const setCantingOpen = useSimStore((s) => s.setCantingOpen);

  return (
    <Dialog.Root open={cantingOpen} onOpenChange={setCantingOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={`${styles.content} ${styles.mediumContent}`}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <span className={styles.headerBadge}>Plume Vectoring &amp; Shielding Architecture</span>
              <Dialog.Title className={styles.title}>Plume Canting &amp; Yaw Trim</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button type="button" className={styles.closeBtn} aria-label="Close" id="btn-close-canting">
                ✕
              </button>
            </Dialog.Close>
          </div>

          <div className={styles.body}>
            <div className={styles.cardSection}>
              <div className={styles.sectionHeading}>Plume Vectoring Geometry</div>
              <div className={styles.dataRow}>
                <span className={styles.label}>Out-of-Ecliptic Cant</span>
                <span className={`${styles.value} mono`}>±5.00° (Two-Cone Symmetrical)</span>
              </div>
              <div className={styles.dataRow}>
                <span className={styles.label}>Lunar Orbit Clearance</span>
                <span className={`${styles.value} ${styles.accentValue} mono`}>&gt; 110,696 km (&gt;3.2× max excursion)</span>
              </div>
              <div className={styles.dataRow}>
                <span className={styles.label}>Cosine Efficiency</span>
                <span className={`${styles.value} mono`}>99.62% (0.38% cant loss)</span>
              </div>
            </div>

            <div className={styles.cardSection}>
              <div className={styles.sectionHeading}>Photon Push &amp; In-Ecliptic Trim</div>
              <div className={styles.dataRow}>
                <span className={styles.label}>In-Ecliptic Yaw Trim</span>
                <span className={`${styles.value} mono`}>8.082° (In-Plane Sunward)</span>
              </div>
              <div className={styles.dataRow}>
                <span className={styles.label}>Photon Push Balance</span>
                <span className={`${styles.value} mono`}>3.336 × 10¹⁶ N</span>
              </div>
              <div className={styles.dataRow}>
                <span className={styles.label}>Effective Forward Thrust</span>
                <span className={`${styles.value} ${styles.accentValue} mono`}>2.326 × 10¹⁷ N</span>
              </div>
            </div>

            <div className={styles.cardSection}>
              <div className={styles.sectionHeading}>Plume Impingement Mitigation</div>
              <div className={styles.schematicBox}>
                <div className={styles.schematicRow}>
                  <span className={styles.schematicLabel}>Exhaust Velocity</span>
                  <span className="mono">0.300c (89,938 km/s, γ = 1.048)</span>
                </div>
                <div className={styles.schematicRow}>
                  <span className={styles.schematicLabel}>Exhaust Architecture</span>
                  <span className="mono">Symmetric dual cones tilt away from orbital plane</span>
                </div>
                <div className={styles.schematicRow}>
                  <span className={styles.schematicLabel}>Atmospheric Sputtering</span>
                  <span className={`${styles.accentValue} mono`}>0.00 kg/s (Zero Plume Impingement)</span>
                </div>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
