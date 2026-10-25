import { create } from 'zustand';
import type { ReplayData, SimulationFrame } from '../types';
import type { HudAnalytics } from '../hud';
import { computeHudAnalytics } from '../hud';
import { YEAR_SECONDS } from '../config';
import mockData from '../mock/replay_mock.json';
import { validateReplayData } from '../loader';
import { audioManager } from '../audio';
import { interpolateFrame, activeSimState } from '../interpolation';

const validation = validateReplayData(mockData);
const initialReplay: ReplayData = validation.data!;
const initialFrame: SimulationFrame = initialReplay.frames[0];
const initialAnalytics: HudAnalytics = computeHudAnalytics(initialFrame);

// Default DPR: 1 on screens with DPR >= 2, min(dpr, 1.5) otherwise. Never above 2.
const getInitialDpr = (): number => {
  if (typeof window === 'undefined') return 1.0;
  const dpr = window.devicePixelRatio || 1;
  return dpr >= 2 ? 1.0 : Math.min(dpr, 1.5);
};

export interface SimState {
  replayData: ReplayData;
  selectedBody: string;
  cameraFocus: string;
  showOrbits: boolean;
  scaleExpanded: boolean;
  activeTab: 'bodies' | 'info' | 'time';
  isPlaying: boolean;
  playbackSpeed: number;
  currentTimeSec: number;
  currentYear: number;
  currentFrame: SimulationFrame;
  hudAnalytics: HudAnalytics;
  optionsOpen: boolean;
  benchmarksOpen: boolean;
  cantingOpen: boolean;
  musicEnabled: boolean;
  narrationEnabled: boolean;
  zoomAction: { type: 'in' | 'out' | 'reset' | null; timestamp: number };
  qualityTier: 1 | 2 | 3;
  dpr: number;
  contextLost: boolean;

  setSelectedBody: (body: string) => void;
  setCameraFocus: (focus: string) => void;
  focusBody: (body: string) => void;
  toggleOrbits: () => void;
  toggleScaleExpanded: () => void;
  setActiveTab: (tab: 'bodies' | 'info' | 'time') => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  seekTimeSec: (timeSec: number) => void;
  updateHudAnalytics: (analytics: HudAnalytics, timeSec: number, currentFrame: SimulationFrame) => void;
  setReplayData: (data: ReplayData) => void;
  setOptionsOpen: (open: boolean) => void;
  setBenchmarksOpen: (open: boolean) => void;
  setCantingOpen: (open: boolean) => void;
  toggleMusic: () => void;
  toggleNarration: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  setQualityTier: (tier: 1 | 2 | 3) => void;
  setDpr: (dpr: number) => void;
  setContextLost: (lost: boolean) => void;
  stepDownTier: () => void;
  stepUpTier: () => void;
}

export const useSimStore = create<SimState>((set, get) => ({
  replayData: initialReplay,
  selectedBody: 'Earth',
  cameraFocus: 'Earth',
  showOrbits: true,
  scaleExpanded: false,
  activeTab: 'bodies',
  isPlaying: false,
  playbackSpeed: 10,
  currentTimeSec: initialFrame.time_s,
  currentYear: initialFrame.time_s / YEAR_SECONDS,
  currentFrame: initialFrame,
  hudAnalytics: initialAnalytics,
  optionsOpen: false,
  benchmarksOpen: false,
  cantingOpen: false,
  musicEnabled: false,
  narrationEnabled: true,
  zoomAction: { type: null, timestamp: 0 },
  qualityTier: 3,
  dpr: getInitialDpr(),
  contextLost: false,

  setSelectedBody: (body: string) => {
    get().focusBody(body);
  },

  setCameraFocus: (focus: string) => {
    get().focusBody(focus);
  },

  focusBody: (body: string) => {
    const targetFocus = body;
    const selected = body === 'system' ? 'Earth' : body;
    set({ cameraFocus: targetFocus, selectedBody: selected });
    audioManager.playNarration(body);
  },

  toggleOrbits: () => {
    set((state) => ({ showOrbits: !state.showOrbits }));
  },

  toggleScaleExpanded: () => {
    set((state) => ({ scaleExpanded: !state.scaleExpanded }));
  },

  setActiveTab: (tab: 'bodies' | 'info' | 'time') => {
    set({ activeTab: tab });
  },

  setIsPlaying: (playing: boolean) => {
    set({ isPlaying: playing });
  },

  setPlaybackSpeed: (speed: number) => {
    set({ playbackSpeed: speed });
  },

  seekTimeSec: (timeSec: number) => {
    const replay = get().replayData;
    const clamped = Math.max(
      replay.frames[0].time_s,
      Math.min(replay.frames[replay.frames.length - 1].time_s, timeSec)
    );
    const interpolated = interpolateFrame(replay.frames, clamped);
    const analytics = computeHudAnalytics(interpolated);
    activeSimState.time_s = clamped;
    activeSimState.year = clamped / YEAR_SECONDS;
    activeSimState.frame = interpolated;
    set({
      currentTimeSec: clamped,
      currentYear: clamped / YEAR_SECONDS,
      currentFrame: interpolated,
      hudAnalytics: analytics
    });
  },

  updateHudAnalytics: (analytics: HudAnalytics, timeSec: number, currentFrame: SimulationFrame) => {
    set({
      hudAnalytics: analytics,
      currentTimeSec: timeSec,
      currentYear: timeSec / YEAR_SECONDS,
      currentFrame
    });
  },

  setReplayData: (data: ReplayData) => {
    const firstFrame = data.frames[0];
    const analytics = computeHudAnalytics(firstFrame);
    activeSimState.time_s = firstFrame.time_s;
    activeSimState.year = firstFrame.time_s / YEAR_SECONDS;
    activeSimState.frame = firstFrame;
    set({
      replayData: data,
      currentTimeSec: firstFrame.time_s,
      currentYear: firstFrame.time_s / YEAR_SECONDS,
      currentFrame: firstFrame,
      hudAnalytics: analytics,
      isPlaying: false
    });
  },

  setOptionsOpen: (open: boolean) => set({ optionsOpen: open }),
  setBenchmarksOpen: (open: boolean) => set({ benchmarksOpen: open }),
  setCantingOpen: (open: boolean) => set({ cantingOpen: open }),

  toggleMusic: () => {
    const enabled = audioManager.toggleMusic();
    set({ musicEnabled: enabled });
  },

  toggleNarration: () => {
    const enabled = audioManager.toggleNarration();
    set({ narrationEnabled: enabled });
  },

  zoomIn: () => set({ zoomAction: { type: 'in', timestamp: Date.now() } }),
  zoomOut: () => set({ zoomAction: { type: 'out', timestamp: Date.now() } }),
  resetView: () => {
    get().focusBody('system');
    set({ zoomAction: { type: 'reset', timestamp: Date.now() } });
  },

  setQualityTier: (tier: 1 | 2 | 3) => set({ qualityTier: tier }),
  setDpr: (dpr: number) => set({ dpr: Math.max(0.75, Math.min(2.0, dpr)) }),
  setContextLost: (lost: boolean) => set({ contextLost: lost }),

  stepDownTier: () => {
    const current = get().qualityTier;
    if (current > 1) {
      const nextTier = (current - 1) as 1 | 2;
      const nextDpr = nextTier === 2 ? 0.85 : 0.75;
      set({ qualityTier: nextTier, dpr: nextDpr });
    }
  },

  stepUpTier: () => {
    const current = get().qualityTier;
    if (current < 3) {
      const nextTier = (current + 1) as 2 | 3;
      const nextDpr = nextTier === 3 ? getInitialDpr() : 0.85;
      set({ qualityTier: nextTier, dpr: nextDpr });
    }
  }
}));

if (typeof window !== 'undefined') {
  (window as any).__simStore = useSimStore;
}
