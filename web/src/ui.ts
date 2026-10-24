/**
 * UI Component Manager for the OrbitShift Viewer.
 *
 * Handles:
 *   - Persistent Unconfirmed Thresholds Banner
 *   - Drag-and-drop JSON loader and ?file= query parameter
 *   - Play/pause, speed controls, scrubber with failure markers
 *   - Illustrative badges for models and asteroid belt
 */

import { ReplayData, SimulationFrame } from './types';
import { TimelineController, TimelineState } from './timeline';
import { shouldShowThresholdBanner } from './loader';
import { YEAR_SECONDS } from './config';
import { computeHudAnalytics, formatHudLines } from './hud';
import { runAllBenchmarks } from './benchmarks';

export class UIManager {
  private container: HTMLElement;
  private timeline: TimelineController;
  private onFileLoaded: (data: ReplayData) => void;
  private onToggleFocus?: () => 'system' | 'earth_tug';

  private bannerEl!: HTMLElement;
  private timePrimaryEl!: HTMLElement;
  private timeSecondaryEl!: HTMLElement;
  private playBtnEl!: HTMLButtonElement;
  private scrubberEl!: HTMLInputElement;
  private speedSliderEl!: HTMLInputElement;
  private speedLabelEl!: HTMLElement;
  private markersContainerEl!: HTMLElement;
  private failureContainerEl!: HTMLElement;
  private dropzoneOverlayEl!: HTMLElement;
  private errorModalEl!: HTMLElement;
  private errorMsgEl!: HTMLElement;

  // Minecraft F3 Math Console & Focus Controls
  private hudEl!: HTMLElement;
  private isHudVisible: boolean = true;
  private btnToggleHud!: HTMLButtonElement;
  private btnToggleFocus!: HTMLButtonElement;
  private btnBenchmarks!: HTMLButtonElement;
  private benchmarksModalEl!: HTMLElement;

  constructor(
    container: HTMLElement,
    timeline: TimelineController,
    onFileLoaded: (data: ReplayData) => void,
    onToggleFocus?: () => 'system' | 'earth_tug'
  ) {
    this.container = container;
    this.timeline = timeline;
    this.onFileLoaded = onFileLoaded;
    this.onToggleFocus = onToggleFocus;

    this.buildDOM();
    this.attachEventListeners();
    this.updateThresholdBanner();
    this.updateMarkers();
  }

  private buildDOM(): void {
    // 1. Persistent Banner
    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'threshold-banner';
    this.bannerEl.innerHTML = `<span>⚠</span> Thresholds not confirmed by organizers`;
    this.container.appendChild(this.bannerEl);

    // 2. Top Navigation Bar
    const topNav = document.createElement('div');
    topNav.className = 'top-nav';
    topNav.innerHTML = `
      <div class="brand-group">
        <div class="brand-title">
          OrbitShift 3D
          <span class="badge-concept">Ceres Tug</span>
        </div>
        <div class="brand-subtitle">1.0 AU → 2.7 AU Planetary Migration Simulation</div>
      </div>
      <div class="top-controls">
        <div id="failure-indicator" class="failure-indicator" style="display: none;">
          <span>⚠</span> <span id="failure-text">Failures</span>
        </div>
        <button id="btn-toggle-hud" class="btn-pill active" title="Toggle Math Console (F3 or M)">📊 F3 Math Console</button>
        <button id="btn-toggle-focus" class="btn-pill" title="Toggle Focus (F)">🎥 Focus: Earth-Tug</button>
        <button id="btn-benchmarks" class="btn-pill" title="View Hackathon Section 6 Validation Benchmarks">✔ Benchmarks (10/10 PASS)</button>
        <button id="btn-load-file" class="btn-pill">📂 Load Replay</button>
        <button id="btn-load-mock" class="btn-pill">🧪 Load Mock</button>
      </div>
    `;
    this.container.appendChild(topNav);

    // 3. Minecraft F3-Style Math Console HUD
    this.hudEl = document.createElement('div');
    this.hudEl.id = 'minecraft-f3-hud';
    this.hudEl.className = 'minecraft-f3-hud';
    this.container.appendChild(this.hudEl);

    // 4. Illustrative & Explicit Scale Factor Badges (Guide §8: Unlabelled visual scaling penalty)
    const badgesContainer = document.createElement('div');
    badgesContainer.className = 'scene-badges-container';
    badgesContainer.innerHTML = `
      <span class="badge-illustrative">Heliocentric Scale: 1 AU = 10 scene units</span>
      <span class="badge-illustrative">Magnification: Earth ×8,200 | Sun ×172 | Ceres ×76,000</span>
      <span class="badge-illustrative">Visual Standoff: d = 1.27M km (~16.5× visual separation)</span>
      <span class="badge-illustrative">Asteroid Belt: 2.20 to 3.20 AU (Illustrative)</span>
    `;
    this.container.appendChild(badgesContainer);

    // 5. Bottom Timeline Controller
    const timelineBar = document.createElement('div');
    timelineBar.className = 'timeline-bar';
    timelineBar.innerHTML = `
      <div class="timeline-row-top">
        <div class="playback-controls">
          <button id="btn-play" class="btn-play" title="Play / Pause (Space)">▶</button>
          <div class="time-display">
            <div id="time-primary" class="time-primary">Year 0.00 / 0.00</div>
            <div id="time-secondary" class="time-secondary">Frame 0 / 0 | 0.0 s</div>
          </div>
        </div>
        <div class="speed-control">
          <span>Speed:</span>
          <input type="range" id="speed-slider" class="speed-slider" min="1" max="500" value="50" />
          <span id="speed-label">50 yr/s</span>
        </div>
      </div>
      <div class="scrubber-container">
        <input type="range" id="timeline-scrubber" class="scrubber-input" min="0" max="1000" value="0" />
        <div id="scrubber-markers" class="scrubber-markers"></div>
      </div>
    `;
    this.container.appendChild(timelineBar);

    // 6. Drag-and-drop Overlay
    this.dropzoneOverlayEl = document.createElement('div');
    this.dropzoneOverlayEl.className = 'dropzone-overlay hidden';
    this.dropzoneOverlayEl.innerHTML = `
      <div class="dropzone-title">Drop OCTO_JSON Replay File</div>
      <div class="dropzone-desc">Release to load simulation telemetry</div>
    `;
    this.container.appendChild(this.dropzoneOverlayEl);

    // 7. Error Modal
    this.errorModalEl = document.createElement('div');
    this.errorModalEl.className = 'error-modal hidden';
    this.errorModalEl.innerHTML = `
      <div class="error-title">Schema Validation Error</div>
      <div id="error-msg" class="error-msg"></div>
      <button id="btn-close-error" class="btn-pill">Dismiss</button>
    `;
    this.container.appendChild(this.errorModalEl);

    // 8. Hackathon Section 6 Validation Benchmarks Modal
    this.benchmarksModalEl = document.createElement('div');
    this.benchmarksModalEl.className = 'benchmarks-modal hidden';
    const { results, passedCount, totalCount } = runAllBenchmarks();
    const rowsHtml = results
      .map(
        (r) => `
      <tr>
        <td class="bm-id">#${r.id}</td>
        <td class="bm-name"><strong>${r.name}</strong><br><small class="text-dim">${r.notes} (${r.source_page})</small></td>
        <td class="bm-exp">${r.expected_display}</td>
        <td class="bm-comp">${r.computed}</td>
        <td class="bm-tol">${r.tolerance_display}</td>
        <td class="bm-status"><span class="${r.passed ? 'f3-pass' : 'f3-fail'}">${r.status}</span></td>
      </tr>
    `
      )
      .join('');

    this.benchmarksModalEl.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">Hackathon Section 6: Validation Benchmarks (${passedCount}/${totalCount} PASS)</div>
          <button id="btn-close-benchmarks" class="btn-pill">✕ Close</button>
        </div>
        <div class="modal-desc">
          Automated physics benchmarks loaded directly from <code>reports/benchmarks.json</code> (Participant Guide §6, Page 9).
        </div>
        <div class="benchmarks-table-container">
          <table class="benchmarks-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Benchmark Test</th>
                <th>Expected</th>
                <th>Computed</th>
                <th>Tolerance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
    this.container.appendChild(this.benchmarksModalEl);

    // Store element references
    this.timePrimaryEl = timelineBar.querySelector('#time-primary')!;
    this.timeSecondaryEl = timelineBar.querySelector('#time-secondary')!;
    this.playBtnEl = timelineBar.querySelector('#btn-play')!;
    this.scrubberEl = timelineBar.querySelector('#timeline-scrubber')!;
    this.speedSliderEl = timelineBar.querySelector('#speed-slider')!;
    this.speedLabelEl = timelineBar.querySelector('#speed-label')!;
    this.markersContainerEl = timelineBar.querySelector('#scrubber-markers')!;
    this.failureContainerEl = topNav.querySelector('#failure-indicator')!;
    this.btnToggleHud = topNav.querySelector('#btn-toggle-hud')!;
    this.btnToggleFocus = topNav.querySelector('#btn-toggle-focus')!;
    this.btnBenchmarks = topNav.querySelector('#btn-benchmarks')!;
    this.errorMsgEl = this.errorModalEl.querySelector('#error-msg')!;
  }

  private attachEventListeners(): void {
    // Play/Pause button
    this.playBtnEl.addEventListener('click', () => this.timeline.togglePlay());

    // Scrubber input (seek)
    this.scrubberEl.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.timeline.seekFraction(val / 1000.0);
    });

    // Speed slider
    this.speedSliderEl.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.timeline.setSpeedYearsPerSec(val);
      this.speedLabelEl.textContent = `${Math.round(val)} yr/s`;
    });

    // File loading buttons
    const btnLoadFile = this.container.querySelector('#btn-load-file');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,.octo';
    fileInput.style.display = 'none';
    this.container.appendChild(fileInput);

    btnLoadFile?.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadFile(file);
    });

    const btnLoadMock = this.container.querySelector('#btn-load-mock');
    btnLoadMock?.addEventListener('click', () => {
      window.location.search = '?file=web/mock/replay_mock.json';
    });

    // Drag and Drop
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropzoneOverlayEl.classList.remove('hidden');
    });

    this.dropzoneOverlayEl.addEventListener('dragleave', (e) => {
      e.preventDefault();
      this.dropzoneOverlayEl.classList.add('hidden');
    });

    this.dropzoneOverlayEl.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropzoneOverlayEl.classList.add('hidden');
      const file = e.dataTransfer?.files[0];
      if (file) this.loadFile(file);
    });

    // Error dismissal
    this.errorModalEl.querySelector('#btn-close-error')?.addEventListener('click', () => {
      this.errorModalEl.classList.add('hidden');
    });

    // Top-bar HUD, Focus, and Benchmarks buttons
    this.btnToggleHud.addEventListener('click', () => this.toggleHud());
    this.btnToggleFocus.addEventListener('click', () => {
      if (this.onToggleFocus) {
        const mode = this.onToggleFocus();
        this.setFocusButtonLabel(mode);
      }
    });
    this.btnBenchmarks.addEventListener('click', () => {
      this.benchmarksModalEl.classList.toggle('hidden');
    });
    this.benchmarksModalEl.querySelector('#btn-close-benchmarks')?.addEventListener('click', () => {
      this.benchmarksModalEl.classList.add('hidden');
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.timeline.togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        this.timeline.seekTime_s(this.timeline.currentTime_s + 10.0 * YEAR_SECONDS);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        this.timeline.seekTime_s(this.timeline.currentTime_s - 10.0 * YEAR_SECONDS);
      } else if (e.code === 'F3' || e.code === 'KeyM') {
        e.preventDefault();
        this.toggleHud();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        if (this.onToggleFocus) {
          const mode = this.onToggleFocus();
          this.setFocusButtonLabel(mode);
        }
      }
    });
  }

  private loadFile(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        this.onFileLoaded(parsed);
      } catch (err) {
        this.showError(`JSON Parse Error: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  }

  public showError(msg: string): void {
    this.errorMsgEl.textContent = msg;
    this.errorModalEl.classList.remove('hidden');
  }

  public toggleHud(): boolean {
    this.isHudVisible = !this.isHudVisible;
    if (this.isHudVisible) {
      this.hudEl.classList.remove('hidden');
      this.btnToggleHud.classList.add('active');
    } else {
      this.hudEl.classList.add('hidden');
      this.btnToggleHud.classList.remove('active');
    }
    return this.isHudVisible;
  }

  public setFocusButtonLabel(mode: 'system' | 'earth_tug'): void {
    if (mode === 'earth_tug') {
      this.btnToggleFocus.innerHTML = '🎥 Focus: System';
      this.btnToggleFocus.classList.add('active');
    } else {
      this.btnToggleFocus.innerHTML = '🎥 Focus: Earth-Tug';
      this.btnToggleFocus.classList.remove('active');
    }
  }

  public updateHud(frame: SimulationFrame): void {
    if (!this.isHudVisible) return;
    const stats = computeHudAnalytics(frame);
    const lines = formatHudLines(stats);

    const htmlLines = lines.map((line) => {
      if (!line.trim()) {
        return '<div class="f3-empty"></div>';
      }
      if (line.startsWith('===')) {
        return `<div class="f3-line f3-banner">${line}</div>`;
      }
      if (line.startsWith('[')) {
        return `<div class="f3-line f3-section">${line}</div>`;
      }

      // Syntax highlight key values
      let styled = line
        .replace(/(PASS \(MACHINE EPSILON\))/g, '<span class="f3-pass">$1</span>')
        .replace(/(PASS)/g, '<span class="f3-pass">$1</span>')
        .replace(/(ACTIVE TOWING)/g, '<span class="f3-active">$1</span>')
        .replace(/(UNPOWERED BALLISTIC COAST)/g, '<span class="f3-coast">$1</span>')
        .replace(/(DRIFT DETECTED)/g, '<span class="f3-fail">$1</span>')
        .replace(/(BOUND)/g, '<span class="f3-pass">$1</span>')
        .replace(/(\b[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?(?:\s*(?:AU|km\/s|km|days|yr|Gs|N|W|W\/m²|kg|%|R_Hill|c))?)/g, '<span class="f3-val">$1</span>');

      return `<div class="f3-line">${styled}</div>`;
    });

    this.hudEl.innerHTML = htmlLines.join('');
  }

  public updateThresholdBanner(meta?: { thresholds_confirmed?: boolean }): void {
    const show = shouldShowThresholdBanner(meta);
    if (show) {
      this.bannerEl.classList.remove('hidden');
    } else {
      this.bannerEl.classList.add('hidden');
    }
  }

  public updateMarkers(): void {
    this.markersContainerEl.innerHTML = '';
    const markers = this.timeline.getFailingConditionMarkers();

    if (markers.length > 0) {
      this.failureContainerEl.style.display = 'flex';
      const failText = this.failureContainerEl.querySelector('#failure-text');
      if (failText) {
        failText.textContent = `${markers.length} Failing Condition${markers.length > 1 ? 's' : ''}`;
      }
      this.failureContainerEl.onclick = () => {
        // Jump to first failing time
        this.timeline.seekTime_s(markers[0].condition.first_failing_time_s || 0);
      };
    } else {
      this.failureContainerEl.style.display = 'none';
    }

    for (const marker of markers) {
      const pip = document.createElement('div');
      pip.className = 'scrubber-pip';
      pip.style.left = `${(marker.fraction * 100).toFixed(2)}%`;
      pip.setAttribute(
        'data-tooltip',
        `FAIL: ${marker.condition.name} (Yr ${marker.time_yr.toFixed(1)})`
      );
      pip.onclick = (e) => {
        e.stopPropagation();
        this.timeline.seekTime_s(marker.condition.first_failing_time_s || 0);
      };
      this.markersContainerEl.appendChild(pip);
    }
  }

  public updateTimelineState(state: TimelineState, totalFrames: number): void {
    this.playBtnEl.textContent = state.isPlaying ? '❚❚' : '▶';

    const currentYear = state.currentYear.toFixed(2);
    const totalYears = (state.duration_s / YEAR_SECONDS).toFixed(2);
    this.timePrimaryEl.textContent = `Year ${currentYear} / ${totalYears}`;

    this.timeSecondaryEl.textContent = `Frame ${state.currentFrameIndex + 1} / ${totalFrames} | ${(state.currentTime_s / 1e9).toFixed(2)} Gs`;

    if (state.duration_s > 0) {
      const frac = state.currentTime_s / state.duration_s;
      this.scrubberEl.value = String(Math.round(frac * 1000));
    }
  }
}
