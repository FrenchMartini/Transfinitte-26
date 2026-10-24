/**
 * OrbitShift 3D Viewer Main Entry Point.
 */

import './style.css';
import { ReplayData } from './types';
import { validateReplayData } from './loader';
import { interpolateFrame } from './interpolation';
import { SolarSystemView } from './views/solar_system';
import { TimelineController, TimelineState } from './timeline';
import { UIManager } from './ui';
import mockData from '../mock/replay_mock.json';

class App {
  private container: HTMLElement;
  private solarSystemView!: SolarSystemView;
  private timeline!: TimelineController;
  private uiManager!: UIManager;
  private replayData!: ReplayData;

  constructor() {
    this.container = document.getElementById('app')!;
    this.init();
  }

  private async init(): Promise<void> {
    const data = await this.loadInitialReplay();
    this.startViewer(data);
  }

  private async loadInitialReplay(): Promise<ReplayData> {
    const urlParams = new URLSearchParams(window.location.search);
    const requestedFile = urlParams.get('file');

    const fileToTry = requestedFile || '/results/replay_ceres_tug.json';

    try {
      const resp = await fetch(fileToTry);
      if (resp.ok) {
        const json = await resp.json();
        const validation = validateReplayData(json);
        if (validation.isValid && validation.data) {
          console.log(`Loaded replay from ${fileToTry} (${validation.data.frames.length} frames).`);
          return validation.data;
        }
      }
    } catch (e) {
      console.warn(`Failed to fetch ${fileToTry}, falling back to mock:`, e);
    }

    console.log('Falling back to built-in mock telemetry.');
    const validation = validateReplayData(mockData);
    return validation.data!;
  }

  private startViewer(data: ReplayData): void {
    this.replayData = data;

    // 1. Dispose any previous viewer on HMR to prevent WebGL context exhaustion
    if ((window as any).__solarSystemView) {
      try {
        (window as any).__solarSystemView.dispose();
      } catch (err) {
        console.warn('Error disposing previous SolarSystemView:', err);
      }
    }

    this.container.innerHTML = '';

    // 2. Initialize Timeline
    this.timeline = new TimelineController(this.replayData, (state: TimelineState) => {
      this.uiManager?.updateTimelineState(state, this.replayData.frames.length);
    });

    // 3. Initialize 3D Solar System View
    const canvasContainer = document.createElement('div');
    canvasContainer.id = 'canvas-container';
    this.container.appendChild(canvasContainer);

    let viewReady = false;
    try {
      this.solarSystemView = new SolarSystemView(canvasContainer);
      (window as any).__solarSystemView = this.solarSystemView;
      this.solarSystemView.setFramesCache(this.replayData.frames);
      viewReady = true;
    } catch (e) {
      console.error('Failed to initialize WebGL SolarSystemView:', e);
      canvasContainer.innerHTML = `
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #f87171; font-family: sans-serif; background: rgba(15, 23, 42, 0.95); padding: 24px 32px; border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.4); max-width: 500px; z-index: 10;">
          <h3 style="margin-top: 0; color: #fca5a5;">3D Graphics Engine Reload Needed</h3>
          <p style="color: #cbd5e1; font-size: 0.85rem; line-height: 1.5;">Browser WebGL context limit was reached or context was lost during development hot reload.</p>
          <button onclick="window.location.reload()" style="background: #38bdf8; color: #0f172a; border: none; padding: 10px 20px; font-weight: 700; border-radius: 6px; cursor: pointer; margin-top: 12px;">Reload Page</button>
        </div>
      `;
    }

    // 4. Initialize UI Manager (ALWAYS created, so UI is NEVER broken!)
    this.uiManager = new UIManager(
      this.container,
      this.timeline,
      (newData: ReplayData) => {
        this.handleNewReplayData(newData);
      },
      () => {
        return this.solarSystemView ? this.solarSystemView.toggleCameraFocus() : 'system';
      },
      () => {
        return this.solarSystemView ? this.solarSystemView.toggleOrbits() : true;
      },
      (target: string) => {
        this.solarSystemView?.setCameraFocus(target);
      }
    );

    if (viewReady && this.solarSystemView) {
      this.solarSystemView.onFocusChange = (_targetName: string, displayName: string) => {
        this.uiManager.setFocusButtonLabel(displayName);
      };
    }

    this.uiManager.updateThresholdBanner(this.replayData.meta);
    this.uiManager.updateMarkers();
    this.uiManager.updateTimelineState(this.timeline.getState(), this.replayData.frames.length);

    // 5. Start Render & Animation Loop
    requestAnimationFrame(this.renderLoop);
  }

  private handleNewReplayData(newData: ReplayData): void {
    const validation = validateReplayData(newData);
    if (!validation.isValid || !validation.data) {
      this.uiManager.showError(`Replay Validation Error:\n${validation.errors.join('\n')}`);
      return;
    }

    this.replayData = validation.data;
    if (this.solarSystemView) {
      this.solarSystemView.setFramesCache(this.replayData.frames);
    }

    this.timeline.pause();
    this.timeline = new TimelineController(this.replayData, (state: TimelineState) => {
      this.uiManager.updateTimelineState(state, this.replayData.frames.length);
    });

    this.uiManager.updateThresholdBanner(this.replayData.meta);
    this.uiManager.updateMarkers();
    this.timeline.seekTime_s(this.replayData.frames[0].time_s);
  }

  private renderLoop = (timestamp: number): void => {
    // 1. Tick timeline playback
    this.timeline.tick(timestamp);

    // 2. Interpolate current frame state
    const currentFrame = interpolateFrame(this.replayData.frames, this.timeline.currentTime_s);

    // 3. Update bodies in 3D scene and dynamic traversed trail
    if (this.solarSystemView) {
      this.solarSystemView.updateBodies(currentFrame, this.timeline.currentTime_s);
    }

    // 4. Update Minecraft F3 HUD math console
    this.uiManager.updateHud(currentFrame);

    // 5. Render Three.js view
    if (this.solarSystemView) {
      this.solarSystemView.render();
    }

    requestAnimationFrame(this.renderLoop);
  };
}

new App();
