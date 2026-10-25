import * as Dialog from '@radix-ui/react-dialog';
import { useSimStore } from '../../store/sim';
import { runAllBenchmarks } from '../../benchmarks';
import styles from './Modals.module.css';

export function BenchmarksModal() {
  const benchmarksOpen = useSimStore((s) => s.benchmarksOpen);
  const setBenchmarksOpen = useSimStore((s) => s.setBenchmarksOpen);

  const { results, passedCount, totalCount } = runAllBenchmarks();

  return (
    <Dialog.Root open={benchmarksOpen} onOpenChange={setBenchmarksOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={`${styles.content} ${styles.wideContent}`}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>
              Verification Benchmarks ({passedCount}/{totalCount} PASS)
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className={styles.closeBtn} aria-label="Close" id="btn-close-benchmarks">
                ✕
              </button>
            </Dialog.Close>
          </div>

          <table className={styles.benchmarkTable}>
            <thead>
              <tr>
                <th>Benchmark</th>
                <th>Expected</th>
                <th>Tolerance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((bm) => (
                <tr key={bm.id}>
                  <td>{bm.name}</td>
                  <td className="mono">{bm.expected_display}</td>
                  <td className="mono">{bm.tolerance_display}</td>
                  <td className={`${styles.passTag} mono`}>{bm.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
