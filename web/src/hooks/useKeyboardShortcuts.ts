import { useEffect } from 'react';
import { useSimStore } from '../store/sim';
import { YEAR_SECONDS } from '../config';

export function useKeyboardShortcuts() {
  const isPlaying = useSimStore((s) => s.isPlaying);
  const setIsPlaying = useSimStore((s) => s.setIsPlaying);
  const currentTimeSec = useSimStore((s) => s.currentTimeSec);
  const seekTimeSec = useSimStore((s) => s.seekTimeSec);
  const toggleOrbits = useSimStore((s) => s.toggleOrbits);
  const setCantingOpen = useSimStore((s) => s.setCantingOpen);
  const cantingOpen = useSimStore((s) => s.cantingOpen);
  const zoomIn = useSimStore((s) => s.zoomIn);
  const zoomOut = useSimStore((s) => s.zoomOut);
  const resetView = useSimStore((s) => s.resetView);
  const focusBody = useSimStore((s) => s.focusBody);
  const cameraFocus = useSimStore((s) => s.cameraFocus);
  const toggleLeftPanel = useSimStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useSimStore((s) => s.toggleRightPanel);
  const toggleBottomPanel = useSimStore((s) => s.toggleBottomPanel);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setIsPlaying(!isPlaying);
          break;
        case 'ArrowLeft':
          if (e.shiftKey || e.altKey) {
            e.preventDefault();
            seekTimeSec(currentTimeSec - 10 * YEAR_SECONDS);
          }
          break;
        case 'ArrowRight':
          if (e.shiftKey || e.altKey) {
            e.preventDefault();
            seekTimeSec(currentTimeSec + 10 * YEAR_SECONDS);
          }
          break;
        case 'BracketLeft':
          e.preventDefault();
          seekTimeSec(currentTimeSec - 10 * YEAR_SECONDS);
          break;
        case 'BracketRight':
          e.preventDefault();
          seekTimeSec(currentTimeSec + 10 * YEAR_SECONDS);
          break;
        case 'KeyO':
          e.preventDefault();
          toggleOrbits();
          break;
        case 'KeyC':
          e.preventDefault();
          setCantingOpen(!cantingOpen);
          break;
        case 'KeyR':
          e.preventDefault();
          resetView();
          break;
        case 'KeyB':
          e.preventDefault();
          toggleLeftPanel();
          break;
        case 'KeyI':
          e.preventDefault();
          toggleRightPanel();
          break;
        case 'KeyT':
          e.preventDefault();
          toggleBottomPanel();
          break;
        case 'Equal':
        case 'NumpadAdd':
          e.preventDefault();
          zoomIn();
          break;
        case 'Minus':
        case 'NumpadSubtract':
          e.preventDefault();
          zoomOut();
          break;
        case 'KeyF':
          e.preventDefault();
          focusBody(cameraFocus === 'Earth' ? 'system' : 'Earth');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isPlaying,
    currentTimeSec,
    cantingOpen,
    cameraFocus,
    setIsPlaying,
    seekTimeSec,
    toggleOrbits,
    setCantingOpen,
    zoomIn,
    zoomOut,
    resetView,
    focusBody,
    toggleLeftPanel,
    toggleRightPanel,
    toggleBottomPanel
  ]);
}
