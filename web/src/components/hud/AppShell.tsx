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

  return (
    <div className={styles.appShell}>
      <TopBar />

      {!isMobile ? (
        <>
          <BodiesPanel />
          <main className={styles.canvasWrapper} style={{ position: 'relative' }}>
            <SceneCanvas />
            <ZoomControls />
          </main>
          <InfoPanel />
          <TimeBar />
        </>
      ) : (
        <>
          <main className={styles.canvasWrapper} style={{ position: 'relative' }}>
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
