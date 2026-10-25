import * as Dialog from '@radix-ui/react-dialog';
import { useSimStore } from '../../store/sim';
import styles from './Modals.module.css';

export function OptionsModal() {
  const optionsOpen = useSimStore((s) => s.optionsOpen);
  const setOptionsOpen = useSimStore((s) => s.setOptionsOpen);
  const setBenchmarksOpen = useSimStore((s) => s.setBenchmarksOpen);
  const setCantingOpen = useSimStore((s) => s.setCantingOpen);

  return (
    <Dialog.Root open={optionsOpen} onOpenChange={setOptionsOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>Options</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className={styles.closeBtn} aria-label="Close">✕</button>
            </Dialog.Close>
          </div>

          <div className={styles.body}>
            <div className={styles.dataRow}>
              <span className={styles.label}>Verification Audit</span>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => {
                  setOptionsOpen(false);
                  setBenchmarksOpen(true);
                }}
              >
                View 10/10 PASS
              </button>
            </div>

            <div className={styles.dataRow}>
              <span className={styles.label}>Plume Canting & Trim</span>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => {
                  setOptionsOpen(false);
                  setCantingOpen(true);
                }}
              >
                View Dynamics
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
