import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useSimStore } from '../../store/sim';
import { exportReplayJson, parseAndValidateReplayFile } from '../../utils/replayIo';
import styles from './Modals.module.css';

export function OptionsModal() {
  const optionsOpen = useSimStore((s) => s.optionsOpen);
  const setOptionsOpen = useSimStore((s) => s.setOptionsOpen);
  const setBenchmarksOpen = useSimStore((s) => s.setBenchmarksOpen);
  const setCantingOpen = useSimStore((s) => s.setCantingOpen);
  const replayData = useSimStore((s) => s.replayData);
  const setReplayData = useSimStore((s) => s.setReplayData);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ioStatus, setIoStatus] = useState<{ message: string; isError: boolean } | null>(null);

  const handleExport = () => {
    try {
      exportReplayJson(replayData);
      setIoStatus({
        message: `Successfully exported ${replayData.frames.length.toLocaleString()} frames (${replayData.meta?.concept || 'D-Orbit'}).`,
        isError: false,
      });
    } catch (err: any) {
      setIoStatus({
        message: `Export failed: ${err.message || String(err)}`,
        isError: true,
      });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await parseAndValidateReplayFile(file);
    if (!result.success || !result.data) {
      setIoStatus({
        message: result.error || 'Failed to import replay file.',
        isError: true,
      });
    } else {
      setReplayData(result.data);
      setIoStatus({
        message: `Successfully loaded ${result.frameCount?.toLocaleString()} frames for ${result.concept} (${result.durationYears?.toFixed(1)} yr).`,
        isError: false,
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog.Root open={optionsOpen} onOpenChange={setOptionsOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
            aria-hidden="true"
            id="modal-replay-file-input"
          />

          <div className={styles.header}>
            <Dialog.Title className={styles.title}>Options & Mission Control</Dialog.Title>
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
                View
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

            <div style={{ margin: '14px 0 8px 0', borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Telemetry Data Exchange (DRAFT v2 Schema)
              </div>
            </div>

            <div className={styles.dataRow}>
              <div>
                <span className={styles.label}>Export Replay JSON</span>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  Download {replayData.frames.length.toLocaleString()} frames ({replayData.meta?.concept || 'D-Orbit'})
                </div>
              </div>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={handleExport}
                title="Download complete replay JSON"
              >
                Export JSON
              </button>
            </div>

            <div className={styles.dataRow}>
              <div>
                <span className={styles.label}>Import Replay JSON</span>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  Upload custom simulation dataset (OCTO_JSON)
                </div>
              </div>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => fileInputRef.current?.click()}
                title="Select and load a simulation JSON replay"
              >
                Import JSON
              </button>
            </div>

            {ioStatus && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius)',
                  backgroundColor: ioStatus.isError ? 'rgba(255, 77, 79, 0.12)' : 'rgba(255, 176, 0, 0.12)',
                  border: `1px solid ${ioStatus.isError ? '#ff4d4f' : 'var(--accent)'}`,
                  color: ioStatus.isError ? '#ff7875' : 'var(--text)',
                  fontSize: '12px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                <span style={{ marginRight: '6px' }}>{ioStatus.isError ? '⚠' : '✓'}</span>
                {ioStatus.message}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
