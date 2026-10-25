import { useState, useEffect } from 'react';
import { useSimStore } from '../../store/sim';
import { TopBar } from './TopBar';
import { BodiesPanel } from './BodiesPanel';
import { InfoPanel } from './InfoPanel';
import { TimeBar } from './TimeBar';
import { MobileTabBar } from './MobileTabBar';
import { OptionsModal } from './OptionsModal';
import { BenchmarksModal } from './BenchmarksModal';
import { CantingModal } from './CantingModal';
import { ZoomControls } from './ZoomControls';
import { SceneCanvas } from '../scene/SceneCanvas';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import styles from './AppShell.module.css';

export function AppShell() {
  const activeTab = useSimStore((s) => s.activeTab);
  const leftPanelOpen = useSimStore((s) => s.leftPanelOpen);
  const rightPanelOpen = useSimStore((s) => s.rightPanelOpen);
  const bottomPanelOpen = useSimStore((s) => s.bottomPanelOpen);
  const toggleLeftPanel = useSimStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useSimStore((s) => s.toggleRightPanel);
  const toggleBottomPanel = useSimStore((s) => s.toggleBottomPanel);
  const currentYear = useSimStore((s) => s.currentYear);
  const [isMobile, setIsMobile] = useState(false);

  useKeyboardShortcuts();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const shellClasses = [
    styles.appShell,
    !leftPanelOpen ? styles.leftCollapsed : '',
    !rightPanelOpen ? styles.rightCollapsed : '',
    !bottomPanelOpen ? styles.bottomCollapsed : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={shellClasses}>
      <TopBar />

      {!isMobile ? (
        <>
          <BodiesPanel isCollapsed={!leftPanelOpen} />
          <main className={styles.canvasWrapper}>
            <SceneCanvas />
            {!leftPanelOpen && (
              <button
                type="button"
                id="btn-expand-left"
                className={styles.expandLeftTab}
                onClick={toggleLeftPanel}
                title="Expand Celestial Bodies Panel (B)"
                aria-label="Expand Left Panel"
              >
                <span>▶</span>
                <span className={styles.expandTabText}>Bodies</span>
              </button>
            )}
            {!rightPanelOpen && (
              <button
                type="button"
                id="btn-expand-right"
                className={styles.expandRightTab}
                onClick={toggleRightPanel}
                title="Expand Telemetry & Info Panel (I)"
                aria-label="Expand Right Panel"
              >
                <span className={styles.expandTabText}>Telemetry</span>
                <span>◀</span>
              </button>
            )}
            {!bottomPanelOpen && (
              <button
                type="button"
                id="btn-expand-bottom"
                className={styles.expandBottomTab}
                onClick={toggleBottomPanel}
                title="Expand Timeline Controls (T)"
                aria-label="Expand Bottom Panel"
              >
                <span>▲ Timeline</span>
                <span className="mono" style={{ color: 'var(--text)', marginLeft: '6px' }}>
                  Yr {currentYear.toFixed(1)}
                </span>
              </button>
            )}
            <ZoomControls />
          </main>
          <InfoPanel isCollapsed={!rightPanelOpen} />
          <TimeBar isCollapsed={!bottomPanelOpen} />
        </>
      ) : (
        <>
          <main className={styles.canvasWrapper}>
            <SceneCanvas />
            <ZoomControls />
          </main>

          <div className={styles.mobileContentWrapper}>
            {activeTab === 'bodies' && <BodiesPanel />}
            {activeTab === 'info' && <InfoPanel />}
            {activeTab === 'time' && <TimeBar />}
          </div>

          <MobileTabBar />
        </>
      )}

      <OptionsModal />
      <BenchmarksModal />
      <CantingModal />
    </div>
  );
}
