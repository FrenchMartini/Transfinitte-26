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
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>Plume Canting & Trim</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className={styles.closeBtn} aria-label="Close" id="btn-close-canting">
                ✕
              </button>
            </Dialog.Close>
          </div>

          <div className={styles.body}>
            <div className={styles.dataRow}>
              <span className={styles.label}>Plume Canting</span>
              <span className="mono">±5.00° (Out-of-Ecliptic)</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.label}>Lunar Clearance</span>
              <span className="mono">&gt; 110,696 km (&gt;3.2× max excursion)</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.label}>Cosine Efficiency</span>
              <span className="mono">99.62% (0.38% loss)</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.label}>In-Ecliptic Yaw Trim</span>
              <span className="mono">8.082° (In-Plane)</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.label}>Photon Push Balance</span>
              <span className="mono">3.336 × 10¹⁶ N</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.label}>Effective Forward Thrust</span>
              <span className="mono">2.326 × 10¹⁷ N</span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
