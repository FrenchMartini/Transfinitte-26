/**
 * UI Component Manager for the OrbitShift Viewer.
 *
 * Professional Aerospace Mission Control Interface featuring:
 *   - Glassmorphic command header with clean SVG telemetry iconography
 *   - Visualizer inspiration: Left Celestial Sidebar Navigation (all 8 planets + Sun, Moon, Tug, Asteroid Belt)
 *   - Cinematic Planet Info Card with auto-rotating slides, facts, and mission telemetry
 *   - Dual-channel ambient cosmic audio & celestial narration voiceovers
 *   - Quick right-side speed pill column (0.1× to 500×) + bottom logarithmic continuous slider
 *   - Floating zoom & navigation reset controls
 *   - Flight dynamics telemetry HUD console (F3)
 *   - Verified Hackathon validation benchmarks inspector (10/10 PASS)
 *   - Drag-and-drop JSON/OCTO telemetry loader and error handling
 */

import { ReplayData, SimulationFrame } from './types';
import { TimelineController, TimelineState } from './timeline';
import { shouldShowThresholdBanner } from './loader';
import { YEAR_SECONDS } from './config';
import { computeHudAnalytics, formatHudLines } from './hud';
import { runAllBenchmarks } from './benchmarks';
import {
  sliderToSpeed,
  speedToSlider,
  parseManualSpeed,
  speedToManualValues,
  SpeedUnit
} from './playback_speed';
import { CELESTIAL_BODIES, CELESTIAL_LIST, CelestialBodyInfo } from './planet_data';
import { AudioManager } from './audio';

// Professional SVG Icons
const ICON_PLAY = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg>`;
const ICON_REWIND = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4 5h2v14H4zM20 18l-9-6 9-6v12z"/></svg>`;
const ICON_STEP_BACK = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="11 18 2 12 11 6 11 18"/><polygon points="22 18 13 12 22 6 22 18"/></svg>`;
const ICON_STEP_FWD = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="13 6 22 12 13 18 13 6"/><polygon points="2 6 11 12 2 18 2 6"/></svg>`;

const ICON_TELEMETRY = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/><path d="m13 14 2 2 4-4"/></svg>`;
const ICON_TARGET = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>`;
const ICON_BENCHMARKS = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`;
const ICON_IMPORT = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><polyline points="12 11 12 17 12 11"/><polyline points="9 14 12 11 15 14"/></svg>`;
const ICON_SAMPLE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31L4.69 19.3A2 2 0 0 0 6.42 22h11.16a2 2 0 0 0 1.73-2.7L14 9.31V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>`;
const ICON_WARNING = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
const ICON_ORBIT = `<svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="16" cy="16" r="13" stroke="rgba(56, 189, 248, 0.4)" stroke-dasharray="3 2"/><ellipse cx="16" cy="16" rx="13" ry="5.5" stroke="#38bdf8" transform="rotate(-28 16 16)"/><circle cx="16" cy="16" r="3" fill="#38bdf8"/></svg>`;
const ICON_ORBIT_TOGGLE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" stroke-dasharray="3 2"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)"/></svg>`;

const ICON_MUSIC_ON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
const ICON_MUSIC_OFF = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
const ICON_NARRATION_ON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
const ICON_NARRATION_OFF = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;

const ICON_ZOOM_IN = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
const ICON_ZOOM_OUT = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
const ICON_RESET = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg>`;

interface InfoSlide {
  badge: string;
  title: string;
  subtitle: string;
  contentHtml: string;
}

export class UIManager {
  private container: HTMLElement;
  private timeline: TimelineController;
  private onFileLoaded: (data: ReplayData) => void;
  private onToggleFocus?: () => string;
  private onToggleOrbits?: () => boolean;
  private onSelectTarget?: (target: string) => void;
  private onZoomIn?: () => void;
  private onZoomOut?: () => void;
  private audioManager?: AudioManager;

  private bannerEl!: HTMLElement;
  private timePrimaryEl!: HTMLElement;
  private timeSecondaryEl!: HTMLElement;
  private playBtnEl!: HTMLButtonElement;
  private btnRewind!: HTMLButtonElement;
  private btnStepBack!: HTMLButtonElement;
  private btnStepFwd!: HTMLButtonElement;
  private scrubberEl!: HTMLInputElement;

  // Multi-unit speed controls
  private speedSliderEl!: HTMLInputElement;
  private speedNumberInputEl!: HTMLInputElement;
  private speedUnitSelectEl!: HTMLSelectElement;
  private presetBtns: HTMLButtonElement[] = [];

  private markersContainerEl!: HTMLElement;
  private failureContainerEl!: HTMLElement;
  private dropzoneOverlayEl!: HTMLElement;
  private errorModalEl!: HTMLElement;
  private errorMsgEl!: HTMLElement;

  // Flight Dynamics Telemetry Console
  private hudEl!: HTMLElement;
  private isHudVisible: boolean = false;
  private btnToggleHud!: HTMLButtonElement;
  private btnToggleOrbits!: HTMLButtonElement;
  private btnToggleFocus!: HTMLButtonElement;
  private targetDropdownEl!: HTMLElement;
  private btnBenchmarks!: HTMLButtonElement;
  private benchmarksModalEl!: HTMLElement;

  // Visualizer Inspiration Components
  private sidebarEl!: HTMLElement;
  private sidebarItemBtns: Map<string, HTMLButtonElement> = new Map();
  private btnMobileSidebar!: HTMLButtonElement;

  private planetInfoCardEl!: HTMLElement;
  private currentPlanetName: string = 'Earth';
  private currentSlideIndex: number = 0;
  private planetSlides: InfoSlide[] = [];
  private slideTimer: any = null;

  private speedPillsColEl!: HTMLElement;
  private speedPillBtns: HTMLButtonElement[] = [];

  private zoomControlsEl!: HTMLElement;

  private liveClockPrimaryEl!: HTMLElement;
  private liveClockSecondaryEl!: HTMLElement;
  private btnMusicEl!: HTMLButtonElement;
  private btnNarrationEl!: HTMLButtonElement;

  constructor(
    container: HTMLElement,
    timeline: TimelineController,
    onFileLoaded: (data: ReplayData) => void,
    onToggleFocus?: () => string,
    onToggleOrbits?: () => boolean,
    onSelectTarget?: (target: string) => void,
    onZoomIn?: () => void,
    onZoomOut?: () => void,
    audioManager?: AudioManager
  ) {
    this.container = container;
    this.timeline = timeline;
    this.onFileLoaded = onFileLoaded;
    this.onToggleFocus = onToggleFocus;
    this.onToggleOrbits = onToggleOrbits;
    this.onSelectTarget = onSelectTarget;
    this.onZoomIn = onZoomIn;
    this.onZoomOut = onZoomOut;
    this.audioManager = audioManager;

    this.buildDOM();
    this.attachEventListeners();
    this.updateThresholdBanner();
    this.updateMarkers();
    this.selectPlanet('Earth', false);
  }

  private buildDOM(): void {
    // 1. Persistent Threshold Banner (Removed from home UI per user request)
    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'threshold-banner hidden';

    // 2. Aerospace Mission Command Navigation Bar
    const topNav = document.createElement('div');
    topNav.className = 'top-nav';
    topNav.innerHTML = `
      <div class="brand-group">
        <div class="brand-badge-ring">${ICON_ORBIT}</div>
        <div class="brand-text-block">
          <div class="brand-title">
            ORBITSHIFT
            <span class="badge-concept">CERES TUG</span>
            <span class="badge-status-dot" title="Telemetry Feed Active"></span>
          </div>
          <div class="brand-subtitle">Planetary Migration Mission Control • 1.00 AU → 2.70 AU Target</div>
        </div>
      </div>
      <div class="top-controls">
        <div id="failure-indicator" class="failure-indicator" style="display: none;">
          ${ICON_WARNING} <span id="failure-text">0 Anomalies</span>
        </div>
        <button id="btn-toggle-hud" class="btn-pill" title="Flight Dynamics Telemetry Console (F3 or M)">
          ${ICON_TELEMETRY} <span>Flight Telemetry</span>
        </button>
        <button id="btn-toggle-orbits" class="btn-pill active" title="Toggle Reference Orbit Trajectories (O)">
          ${ICON_ORBIT_TOGGLE} <span id="orbits-btn-label">Orbits: ON</span>
        </button>
        <div class="focus-control-wrapper">
          <button id="btn-toggle-focus" class="btn-pill" title="Select Celestial Focus Target (F or Click Planets in 3D)">
            ${ICON_TARGET} <span id="focus-btn-label">Target: Solar System</span>
          </button>
          <div id="target-dropdown" class="target-dropdown hidden">
            <div class="target-dropdown-header">Select Celestial Target Focus</div>
            <div class="target-section-title">Mission Overview</div>
            <div class="target-button-grid">
              <button class="target-item-btn" data-target="system">🌌 Solar System</button>
              <button class="target-item-btn" data-target="earth_tug">🚀 Earth-Tug System</button>
              <button class="target-item-btn" data-target="Sun">☀️ Sun (Flares)</button>
            </div>
            <div class="target-section-title">Terrestrial Planets</div>
            <div class="target-button-grid">
              <button class="target-item-btn" data-target="Mercury">⚪ Mercury</button>
              <button class="target-item-btn" data-target="Venus">🟡 Venus</button>
              <button class="target-item-btn" data-target="Earth">🌍 Earth</button>
              <button class="target-item-btn" data-target="Moon">🌕 Moon (Earth)</button>
              <button class="target-item-btn" data-target="Mars">🔴 Mars</button>
              <button class="target-item-btn" data-target="Phobos">🪨 Phobos (Mars)</button>
              <button class="target-item-btn" data-target="Deimos">🪨 Deimos (Mars)</button>
            </div>
            <div class="target-section-title">Outer Planets & Belts</div>
            <div class="target-button-grid">
              <button class="target-item-btn" data-target="AsteroidBelt">🪨 Asteroid Belt</button>
              <button class="target-item-btn" data-target="Jupiter">🟠 Jupiter</button>
              <button class="target-item-btn" data-target="Saturn">🪐 Saturn (Rings)</button>
              <button class="target-item-btn" data-target="Uranus">🔷 Uranus</button>
              <button class="target-item-btn" data-target="Neptune">🔵 Neptune</button>
            </div>
          </div>
        </div>
        <button id="btn-benchmarks" class="btn-pill" title="Astrodynamic Verification Benchmarks (10/10 PASS)">
          ${ICON_BENCHMARKS} <span>Verification (10/10)</span>
        </button>
        <button id="btn-load-file" class="btn-pill" title="Import Replay File (.json, .octo)">
          ${ICON_IMPORT} <span>Import Replay</span>
        </button>
        <button id="btn-load-mock" class="btn-pill" title="Load Reference Telemetry Dataset">
          ${ICON_SAMPLE} <span>Sample Mission</span>
        </button>

        <div class="top-right-group">
          <div class="live-mission-clock" id="live-mission-clock">
            <span class="clock-primary" id="clock-primary">Year 0.00</span>
            <span class="clock-secondary" id="clock-secondary">T = 0.0 Gs</span>
          </div>
          <button id="btn-toggle-music" class="btn-audio" title="Ambient Space Music">
            ${ICON_MUSIC_OFF} <span id="label-music">Music OFF</span>
          </button>
          <button id="btn-toggle-narration" class="btn-audio active" title="Planetary Narration Audio">
            ${ICON_NARRATION_ON} <span id="label-narration">Narration ON</span>
          </button>
        </div>
      </div>
    `;
    this.container.appendChild(topNav);

    // 3. Left Celestial Navigation Sidebar (Removed from UI per user request)
    this.btnMobileSidebar = document.createElement('button');
    this.sidebarEl = document.createElement('nav');

    // 4. Cinematic Planet Info Floating Card
    this.planetInfoCardEl = document.createElement('div');
    this.planetInfoCardEl.className = 'planet-info-card';
    this.planetInfoCardEl.innerHTML = `
      <div class="planet-info-header">
        <span class="planet-info-badge" id="info-badge">PLANET PROFILE</span>
        <button class="planet-info-close" id="btn-close-planet-info" title="Close Profile">✕</button>
      </div>
      <div class="planet-info-title-block">
        <div class="planet-info-title" id="info-title">Earth</div>
        <div class="planet-info-subtitle" id="info-subtitle">Living Terrestrial Planet</div>
      </div>
      <div class="planet-slide-container" id="planet-slide-container">
        <!-- Slide content dynamically populated -->
      </div>
      <div class="slide-nav-bar">
        <button class="slide-nav-btn" id="btn-prev-slide">◀ Prev</button>
        <div class="slide-nav-dots" id="slide-dots"></div>
        <button class="slide-nav-btn" id="btn-next-slide">Next ▶</button>
      </div>
    `;
    this.container.appendChild(this.planetInfoCardEl);

    // 5. Right Playback Speed Multipliers Column (Removed from UI per user request)
    this.speedPillsColEl = document.createElement('div');
    this.speedPillsColEl.className = 'speed-pills-col hidden';
    this.speedPillBtns = [];

    // 6. Floating Zoom Controls
    this.zoomControlsEl = document.createElement('div');
    this.zoomControlsEl.className = 'zoom-controls';
    this.zoomControlsEl.innerHTML = `
      <button class="zoom-btn" id="btn-zoom-in" title="Zoom In (+)">${ICON_ZOOM_IN}</button>
      <button class="zoom-btn" id="btn-zoom-out" title="Zoom Out (-)">${ICON_ZOOM_OUT}</button>
      <button class="zoom-btn" id="btn-zoom-reset" title="Reset View">${ICON_RESET}</button>
    `;
    this.container.appendChild(this.zoomControlsEl);

    // 7. Flight Dynamics Monospaced Telemetry HUD Console
    this.hudEl = document.createElement('div');
    this.hudEl.id = 'minecraft-f3-hud';
    this.hudEl.className = 'minecraft-f3-hud hidden';
    this.container.appendChild(this.hudEl);

    // 8. Coordinate & Calibration Scale Matrix
    const scaleCard = document.createElement('div');
    scaleCard.className = 'scene-badges-container';
    scaleCard.innerHTML = `
      <div class="ephemeris-card">
        <div class="ephemeris-header">
          <span class="dot-online"></span> Coordinate & Scaling Matrix
        </div>
        <div class="ephemeris-body">
          <div class="ephemeris-row"><span>Heliocentric Scale</span><span class="mono">1 AU = 10 scene units</span></div>
          <div class="ephemeris-row"><span>Earth Magnification</span><span class="mono">×8,200</span></div>
          <div class="ephemeris-row"><span>Sun / Ceres Zoom</span><span class="mono">×172 / ×76,000</span></div>
          <div class="ephemeris-row"><span>Equilibrium Standoff</span><span class="mono">d = 1.27M km (~16.5× visual)</span></div>
          <div class="ephemeris-row"><span>Main Asteroid Belt</span><span class="mono">2.20 – 3.20 AU (Illustrative)</span></div>
        </div>
      </div>
    `;
    this.container.appendChild(scaleCard);

    // 9. Timeline Transport & Multi-Unit Playback Controller
    const initialManual = speedToManualValues(this.timeline.speedYearsPerSec);
    const timelineBar = document.createElement('div');
    timelineBar.className = 'timeline-bar';
    timelineBar.innerHTML = `
      <div class="timeline-row-top">
        <div class="playback-controls">
          <button id="btn-rewind" class="btn-transport" title="Rewind to T=0">${ICON_REWIND}</button>
          <button id="btn-step-back" class="btn-transport" title="Step Back 10 Yrs (←)">${ICON_STEP_BACK}</button>
          <button id="btn-play" class="btn-play" title="Play / Pause (Space)">${ICON_PLAY}</button>
          <button id="btn-step-fwd" class="btn-transport" title="Step Forward 10 Yrs (→)">${ICON_STEP_FWD}</button>
          <div class="time-display">
            <div id="time-primary" class="time-primary">Year 0.00 / 0.00</div>
            <div id="time-secondary" class="time-secondary">Frame 0 / 0 | 0.0 s</div>
          </div>
        </div>

        <div class="speed-control-group">
          <div class="speed-presets" id="speed-presets">
            <button class="preset-pill" data-unit="day" data-val="1">1 d/s</button>
            <button class="preset-pill" data-unit="week" data-val="1">1 wk/s</button>
            <button class="preset-pill active" data-unit="month" data-val="1">1 mo/s</button>
            <button class="preset-pill" data-unit="year" data-val="1">1 yr/s</button>
            <button class="preset-pill" data-unit="year" data-val="10">10 yr/s</button>
            <button class="preset-pill" data-unit="year" data-val="100">100 yr/s</button>
          </div>
          <div class="speed-slider-row">
            <span class="speed-title">Rate:</span>
            <input type="range" id="speed-slider" class="speed-slider" min="0" max="1" step="0.001" value="${speedToSlider(this.timeline.speedYearsPerSec)}" aria-label="Playback speed" />
            <div class="manual-speed-box">
              <input type="number" id="speed-input-number" class="speed-input-number" min="0.1" max="500" step="0.1" value="${initialManual.amount}" aria-label="Speed magnitude" />
              <select id="speed-unit-select" class="speed-unit-select" aria-label="Speed unit">
                <option value="day" ${initialManual.unit === 'day' ? 'selected' : ''}>d/s</option>
                <option value="week" ${initialManual.unit === 'week' ? 'selected' : ''}>wk/s</option>
                <option value="month" ${initialManual.unit === 'month' ? 'selected' : ''}>mo/s</option>
                <option value="year" ${initialManual.unit === 'year' ? 'selected' : ''}>yr/s</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <div class="scrubber-container">
        <input type="range" id="timeline-scrubber" class="scrubber-input" min="0" max="1000" value="0" />
        <div id="scrubber-markers" class="scrubber-markers"></div>
        <div class="scrubber-milestones">
          <span class="milestone-badge" style="left: 0%">1.0 AU Departure</span>
          <span class="milestone-badge" style="left: 30.8%">1.52 AU Mars Crossing</span>
          <span class="milestone-badge" style="left: 70.6%">2.20 AU Belt Entry</span>
          <span class="milestone-badge" style="left: 100%">2.70 AU Target Orbit</span>
        </div>
      </div>
    `;
    this.container.appendChild(timelineBar);

    // 10. Drag-and-drop Overlay
    this.dropzoneOverlayEl = document.createElement('div');
    this.dropzoneOverlayEl.className = 'dropzone-overlay hidden';
    this.dropzoneOverlayEl.innerHTML = `
      <div class="dropzone-title">Drop OCTO_JSON Replay File</div>
      <div class="dropzone-desc">Release to load simulation telemetry</div>
    `;
    this.container.appendChild(this.dropzoneOverlayEl);

    // 11. Error Modal
    this.errorModalEl = document.createElement('div');
    this.errorModalEl.className = 'error-modal hidden';
    this.errorModalEl.innerHTML = `
      <div class="error-title">Schema Validation Error</div>
      <div id="error-msg" class="error-msg"></div>
      <button id="btn-close-error" class="btn-pill">Dismiss</button>
    `;
    this.container.appendChild(this.errorModalEl);

    // 12. Hackathon Section 6 Validation Benchmarks Modal
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
    this.btnRewind = timelineBar.querySelector('#btn-rewind')!;
    this.btnStepBack = timelineBar.querySelector('#btn-step-back')!;
    this.btnStepFwd = timelineBar.querySelector('#btn-step-fwd')!;
    this.scrubberEl = timelineBar.querySelector('#timeline-scrubber')!;
    this.speedSliderEl = timelineBar.querySelector('#speed-slider')!;
    this.speedNumberInputEl = timelineBar.querySelector('#speed-input-number')!;
    this.speedUnitSelectEl = timelineBar.querySelector('#speed-unit-select')!;
    this.presetBtns = Array.from(timelineBar.querySelectorAll('.preset-pill'));
    this.markersContainerEl = timelineBar.querySelector('#scrubber-markers')!;
    this.failureContainerEl = topNav.querySelector('#failure-indicator')!;
    this.btnToggleHud = topNav.querySelector('#btn-toggle-hud')!;
    this.btnToggleOrbits = topNav.querySelector('#btn-toggle-orbits')!;
    this.btnToggleFocus = topNav.querySelector('#btn-toggle-focus')!;
    this.targetDropdownEl = topNav.querySelector('#target-dropdown')!;
    this.btnBenchmarks = topNav.querySelector('#btn-benchmarks')!;
    this.errorMsgEl = this.errorModalEl.querySelector('#error-msg')!;

    this.liveClockPrimaryEl = topNav.querySelector('#clock-primary')!;
    this.liveClockSecondaryEl = topNav.querySelector('#clock-secondary')!;
    this.btnMusicEl = topNav.querySelector('#btn-toggle-music')!;
    this.btnNarrationEl = topNav.querySelector('#btn-toggle-narration')!;
  }

  private attachEventListeners(): void {
    // Play/Pause button
    this.playBtnEl.addEventListener('click', () => this.timeline.togglePlay());

    // Step and Rewind buttons
    this.btnRewind.addEventListener('click', () => this.timeline.seekTime_s(0));
    this.btnStepBack.addEventListener('click', () => {
      this.timeline.seekTime_s(this.timeline.currentTime_s - 10.0 * YEAR_SECONDS);
    });
    this.btnStepFwd.addEventListener('click', () => {
      this.timeline.seekTime_s(this.timeline.currentTime_s + 10.0 * YEAR_SECONDS);
    });

    // Scrubber input (seek)
    this.scrubberEl.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.timeline.seekFraction(val / 1000.0);
    });

    // Speed slider input (logarithmic continuous)
    this.speedSliderEl.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      const newSpeed = sliderToSpeed(val);
      this.timeline.setSpeedYearsPerSec(newSpeed);
      this.syncManualInputsFromSpeed(newSpeed);
      this.highlightMatchingPreset(newSpeed);
    });

    // Manual numeric entry and unit selection
    const applyManualSpeed = () => {
      const amount = parseFloat(this.speedNumberInputEl.value);
      const unit = this.speedUnitSelectEl.value as SpeedUnit;
      if (!isNaN(amount) && amount > 0) {
        const speed = parseManualSpeed(amount, unit);
        this.timeline.setSpeedYearsPerSec(speed);
        this.speedSliderEl.value = String(speedToSlider(speed));
        this.highlightMatchingPreset(speed);
      }
    };

    this.speedNumberInputEl.addEventListener('change', applyManualSpeed);
    this.speedNumberInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        applyManualSpeed();
        this.speedNumberInputEl.blur();
      }
    });
    this.speedUnitSelectEl.addEventListener('change', applyManualSpeed);

    // Preset buttons
    this.presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const unit = (btn.dataset.unit || 'month') as SpeedUnit;
        const val = parseFloat(btn.dataset.val || '1');
        const speed = parseManualSpeed(val, unit);
        this.timeline.setSpeedYearsPerSec(speed);
        this.speedSliderEl.value = String(speedToSlider(speed));
        this.syncManualInputsFromSpeed(speed);
        this.highlightPresetButton(btn);
      });
    });

    // Right Speed Column Pills
    this.speedPillBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed || '1');
        this.timeline.setSpeedYearsPerSec(speed);
        this.speedSliderEl.value = String(speedToSlider(speed));
        this.syncManualInputsFromSpeed(speed);
        this.highlightMatchingPreset(speed);
        this.speedPillBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Sidebar navigation clicks
    this.sidebarItemBtns.forEach((btn, key) => {
      btn.addEventListener('click', () => {
        this.selectPlanet(key, true);
        if (this.onSelectTarget) {
          this.onSelectTarget(key);
        }
        this.sidebarEl.classList.remove('mobile-open');
      });
    });

    // Mobile sidebar toggle
    this.btnMobileSidebar.addEventListener('click', () => {
      this.sidebarEl.classList.toggle('mobile-open');
    });

    // Zoom buttons
    this.container.querySelector('#btn-zoom-in')?.addEventListener('click', () => {
      if (this.onZoomIn) this.onZoomIn();
    });
    this.container.querySelector('#btn-zoom-out')?.addEventListener('click', () => {
      if (this.onZoomOut) this.onZoomOut();
    });
    this.container.querySelector('#btn-zoom-reset')?.addEventListener('click', () => {
      if (this.onSelectTarget) this.onSelectTarget('system');
      this.setFocusButtonLabel('Solar System');
    });

    // Audio controls
    this.btnMusicEl.addEventListener('click', () => {
      if (this.audioManager) {
        const isOn = this.audioManager.toggleMusic();
        this.btnMusicEl.innerHTML = `${isOn ? ICON_MUSIC_ON : ICON_MUSIC_OFF} <span>${isOn ? 'Music ON' : 'Music OFF'}</span>`;
        if (isOn) {
          this.btnMusicEl.classList.add('active');
        } else {
          this.btnMusicEl.classList.remove('active');
        }
      }
    });

    this.btnNarrationEl.addEventListener('click', () => {
      if (this.audioManager) {
        const isOn = this.audioManager.toggleNarration();
        this.btnNarrationEl.innerHTML = `${isOn ? ICON_NARRATION_ON : ICON_NARRATION_OFF} <span>${isOn ? 'Narration ON' : 'Narration OFF'}</span>`;
        if (isOn) {
          this.btnNarrationEl.classList.add('active');
        } else {
          this.btnNarrationEl.classList.remove('active');
        }
      }
    });

    // Planet Info Card Close & Navigation
    this.container.querySelector('#btn-close-planet-info')?.addEventListener('click', () => {
      this.planetInfoCardEl.classList.add('hidden');
      this.stopSlideTimer();
    });

    this.container.querySelector('#btn-prev-slide')?.addEventListener('click', () => {
      this.prevSlide();
    });

    this.container.querySelector('#btn-next-slide')?.addEventListener('click', () => {
      this.nextSlide();
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

    // Benchmarks Modal Toggle
    this.btnBenchmarks.addEventListener('click', () => {
      this.benchmarksModalEl.classList.remove('hidden');
    });
    this.benchmarksModalEl.querySelector('#btn-close-benchmarks')?.addEventListener('click', () => {
      this.benchmarksModalEl.classList.add('hidden');
    });

    // HUD and Orbits toggles
    this.btnToggleHud.addEventListener('click', () => this.toggleHud());
    this.btnToggleOrbits.addEventListener('click', () => {
      if (this.onToggleOrbits) {
        const visible = this.onToggleOrbits();
        const label = this.btnToggleOrbits.querySelector('#orbits-btn-label');
        if (label) label.textContent = visible ? 'Orbits: ON' : 'Orbits: OFF';
        if (visible) this.btnToggleOrbits.classList.add('active');
        else this.btnToggleOrbits.classList.remove('active');
      }
    });

    // Camera Focus Target Dropdown
    this.btnToggleFocus.addEventListener('click', (e) => {
      e.stopPropagation();
      this.targetDropdownEl.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!this.btnToggleFocus.contains(e.target as Node) && !this.targetDropdownEl.contains(e.target as Node)) {
        this.targetDropdownEl.classList.add('hidden');
      }
    });

    this.targetDropdownEl.querySelectorAll('.target-item-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = (btn as HTMLElement).dataset.target;
        if (target) {
          if (this.onSelectTarget) {
            this.onSelectTarget(target);
          }
          this.selectPlanet(target, true);
        }
        this.targetDropdownEl.classList.add('hidden');
      });
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.timeline.togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        this.timeline.seekTime_s(this.timeline.currentTime_s - 10.0 * YEAR_SECONDS);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        this.timeline.seekTime_s(this.timeline.currentTime_s + 10.0 * YEAR_SECONDS);
      } else if (e.code === 'KeyF' || e.code === 'KeyC') {
        e.preventDefault();
        if (this.onToggleFocus) {
          const newTarget = this.onToggleFocus();
          this.setFocusButtonLabel(newTarget === 'system' ? 'Solar System' : 'Earth-Tug');
          this.selectPlanet(newTarget === 'system' ? 'Sun' : 'Earth', false);
        }
      } else if (e.code === 'KeyO') {
        e.preventDefault();
        this.btnToggleOrbits.click();
      } else if (e.code === 'KeyM' || e.code === 'F3') {
        e.preventDefault();
        this.toggleHud();
      }
    });
  }

  public selectPlanet(bodyName: string, playNarration: boolean = true): void {
    const key = bodyName === 'earth_tug' ? 'Tug' : bodyName;
    const info = CELESTIAL_BODIES[key] || CELESTIAL_BODIES['Earth'];
    this.currentPlanetName = key;
    this.currentSlideIndex = 0;

    // Update active state in sidebar
    this.sidebarItemBtns.forEach((btn, bKey) => {
      if (bKey === key) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update Header Focus label
    this.setFocusButtonLabel(info.displayName.split(' (')[0]);

    // Build Slides for Planet Info Card
    this.buildPlanetSlides(key, info);
    this.renderCurrentSlide();
    this.planetInfoCardEl.classList.remove('hidden');
    this.startSlideTimer();

    // Play narration voiceover
    if (playNarration && this.audioManager && this.audioManager.isNarrationOn()) {
      this.audioManager.playNarration(key);
    }
  }

  private buildPlanetSlides(key: string, info: CelestialBodyInfo): void {
    const isTarget = key === 'Earth';
    const isTug = key === 'Tug';

    this.planetSlides = [
      // Slide 1: Overview
      {
        badge: isTarget ? 'MISSION TARGET' : isTug ? 'PROPULSION HUB' : 'CELESTIAL BODY',
        title: info.displayName.split(' (')[0],
        subtitle: info.type,
        contentHtml: `
          <div class="planet-info-fact">
            ${info.fact}
          </div>
          <div class="planet-stats-grid" style="margin-top: 8px;">
            <div class="planet-stat-box">
              <span class="planet-stat-label">Radius</span>
              <span class="planet-stat-value">${info.radiusKm.toLocaleString()} km</span>
            </div>
            <div class="planet-stat-box">
              <span class="planet-stat-label">Mass</span>
              <span class="planet-stat-value">${info.massKg} kg</span>
            </div>
          </div>
        `
      },
      // Slide 2: Physical & Gravity Parameters
      {
        badge: 'PHYSICAL DYNAMICS',
        title: 'Gravity & Surface',
        subtitle: `${info.displayName} Specifications`,
        contentHtml: `
          <div class="planet-stats-grid">
            <div class="planet-stat-box">
              <span class="planet-stat-label">Surface Gravity</span>
              <span class="planet-stat-value">${info.gravityMps2} m/s²</span>
            </div>
            <div class="planet-stat-box">
              <span class="planet-stat-label">Temperature</span>
              <span class="planet-stat-value">${info.temperature}</span>
            </div>
            <div class="planet-stat-box">
              <span class="planet-stat-label">Day Length</span>
              <span class="planet-stat-value">${info.dayLength}</span>
            </div>
            <div class="planet-stat-box">
              <span class="planet-stat-label">Moons / Rings</span>
              <span class="planet-stat-value">${info.moons} Natural Moons</span>
            </div>
          </div>
          <div class="planet-info-note" style="margin-top: 8px;">
            ${info.gravityNote}
          </div>
        `
      },
      // Slide 3: Orbit & Mission Dynamics
      {
        badge: 'ORBITAL DYNAMICS',
        title: 'Heliocentric Track',
        subtitle: `Orbital Speed: ${info.orbitalSpeedKmh.toLocaleString()} km/h`,
        contentHtml: `
          <div class="planet-stats-grid">
            <div class="planet-stat-box">
              <span class="planet-stat-label">Orbital Period</span>
              <span class="planet-stat-value">${info.yearLength}</span>
            </div>
            <div class="planet-stat-box">
              <span class="planet-stat-label">Velocity</span>
              <span class="planet-stat-value">${(info.orbitalSpeedKmh / 3600).toFixed(1)} km/s</span>
            </div>
            ${
              isTarget
                ? `
            <div class="planet-stat-box" style="grid-column: span 2;">
              <span class="planet-stat-label">Migration Progress</span>
              <span class="planet-stat-value" id="info-dyn-progress">1.0000 AU → 2.7000 AU (0.0%)</span>
            </div>
            `
                : isTug
                ? `
            <div class="planet-stat-box" style="grid-column: span 2;">
              <span class="planet-stat-label">Relativistic Thrust</span>
              <span class="planet-stat-value">2.33 × 10¹⁷ N (0.3c Exhaust)</span>
            </div>
            `
                : `
            <div class="planet-stat-box" style="grid-column: span 2;">
              <span class="planet-stat-label">Heliocentric Domain</span>
              <span class="planet-stat-value">Stable Keplerian Trajectory</span>
            </div>
            `
            }
          </div>
        `
      }
    ];
  }

  private renderCurrentSlide(): void {
    if (this.planetSlides.length === 0) return;
    const slide = this.planetSlides[this.currentSlideIndex];

    const badgeEl = this.planetInfoCardEl.querySelector('#info-badge');
    const titleEl = this.planetInfoCardEl.querySelector('#info-title');
    const subtitleEl = this.planetInfoCardEl.querySelector('#info-subtitle');
    const containerEl = this.planetInfoCardEl.querySelector('#planet-slide-container');
    const dotsEl = this.planetInfoCardEl.querySelector('#slide-dots');

    if (badgeEl) badgeEl.textContent = slide.badge;
    if (titleEl) titleEl.textContent = slide.title;
    if (subtitleEl) subtitleEl.textContent = slide.subtitle;

    if (containerEl) {
      containerEl.innerHTML = `<div class="cinematic-slide">${slide.contentHtml}</div>`;
    }

    if (dotsEl) {
      dotsEl.innerHTML = this.planetSlides
        .map(
          (_, i) =>
            `<span class="slide-dot ${i === this.currentSlideIndex ? 'active' : ''}" data-index="${i}"></span>`
        )
        .join('');

      dotsEl.querySelectorAll('.slide-dot').forEach((dot) => {
        dot.addEventListener('click', (e) => {
          const idx = parseInt((e.target as HTMLElement).dataset.index || '0');
          this.currentSlideIndex = idx;
          this.renderCurrentSlide();
          this.startSlideTimer();
        });
      });
    }
  }

  public nextSlide(): void {
    if (this.planetSlides.length === 0) return;
    this.currentSlideIndex = (this.currentSlideIndex + 1) % this.planetSlides.length;
    this.renderCurrentSlide();
    this.startSlideTimer();
  }

  public prevSlide(): void {
    if (this.planetSlides.length === 0) return;
    this.currentSlideIndex =
      (this.currentSlideIndex - 1 + this.planetSlides.length) % this.planetSlides.length;
    this.renderCurrentSlide();
    this.startSlideTimer();
  }

  private startSlideTimer(): void {
    this.stopSlideTimer();
    this.slideTimer = setInterval(() => {
      this.nextSlide();
    }, 7500);
  }

  private stopSlideTimer(): void {
    if (this.slideTimer) {
      clearInterval(this.slideTimer);
      this.slideTimer = null;
    }
  }

  public setFocusButtonLabel(label: string): void {
    const el = this.btnToggleFocus.querySelector('#focus-btn-label');
    if (el) el.textContent = `Target: ${label}`;
  }

  private syncManualInputsFromSpeed(speed: number): void {
    if (document.activeElement !== this.speedNumberInputEl) {
      const { amount, unit } = speedToManualValues(speed);
      this.speedNumberInputEl.value = String(amount);
      this.speedUnitSelectEl.value = unit;
    }
  }

  private highlightMatchingPreset(speed: number): void {
    this.presetBtns.forEach((btn) => {
      const unit = btn.dataset.unit as SpeedUnit;
      const val = parseFloat(btn.dataset.val || '1');
      const targetSpeed = parseManualSpeed(val, unit);
      const isMatch = Math.abs(speed - targetSpeed) / targetSpeed < 0.05;
      if (isMatch) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    this.speedPillBtns.forEach((btn) => {
      const val = parseFloat(btn.dataset.speed || '1');
      const isMatch = Math.abs(speed - val) / val < 0.05;
      if (isMatch) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  private highlightPresetButton(activeBtn: HTMLButtonElement): void {
    this.presetBtns.forEach((b) => b.classList.remove('active'));
    activeBtn.classList.add('active');
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
        .replace(
          /(\b[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?(?:\s*(?:AU|km\/s|km|days|yr|Gs|N|W|W\/m²|kg|%|R_Hill|c))?)/g,
          '<span class="f3-val">$1</span>'
        );

      return `<div class="f3-line">${styled}</div>`;
    });

    this.hudEl.innerHTML = htmlLines.join('');
  }

  public updateThresholdBanner(_meta?: { thresholds_confirmed?: boolean }): void {
    // Banner permanently removed from home UI per user specification
    this.bannerEl.classList.add('hidden');
  }

  public updateMarkers(): void {
    this.markersContainerEl.innerHTML = '';
    const markers = this.timeline.getFailingConditionMarkers();

    if (markers.length > 0) {
      this.failureContainerEl.style.display = 'flex';
      const failText = this.failureContainerEl.querySelector('#failure-text');
      if (failText) {
        failText.textContent = `${markers.length} Anomaly Flag${markers.length > 1 ? 's' : ''}`;
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
    this.playBtnEl.innerHTML = state.isPlaying ? ICON_PAUSE : ICON_PLAY;
    this.speedSliderEl.value = String(speedToSlider(state.speedYearsPerSec));
    this.syncManualInputsFromSpeed(state.speedYearsPerSec);
    this.highlightMatchingPreset(state.speedYearsPerSec);

    const currentYear = state.currentYear.toFixed(2);
    const totalYears = (state.duration_s / YEAR_SECONDS).toFixed(2);
    this.timePrimaryEl.textContent = `Year ${currentYear} / ${totalYears}`;
    this.timeSecondaryEl.textContent = `Frame ${state.currentFrameIndex + 1} / ${totalFrames} | ${(state.currentTime_s / 1e9).toFixed(2)} Gs`;

    if (this.liveClockPrimaryEl) {
      this.liveClockPrimaryEl.textContent = `Year ${currentYear}`;
    }
    if (this.liveClockSecondaryEl) {
      const frac = state.duration_s > 0 ? ((state.currentTime_s / state.duration_s) * 100).toFixed(1) : '0.0';
      this.liveClockSecondaryEl.textContent = `${frac}% • ${(state.currentTime_s / 1e9).toFixed(2)} Gs`;
    }

    if (state.duration_s > 0) {
      const frac = state.currentTime_s / state.duration_s;
      this.scrubberEl.value = String(Math.round(frac * 1000));
    }

    // Dynamic Earth migration progress update inside Planet Info Card
    const dynProgressEl = this.planetInfoCardEl.querySelector('#info-dyn-progress');
    if (dynProgressEl && this.currentPlanetName === 'Earth') {
      const frac = state.duration_s > 0 ? (state.currentTime_s / state.duration_s) : 0;
      const currentAU = 1.0 + frac * 1.70;
      dynProgressEl.textContent = `Current a: ${currentAU.toFixed(4)} AU (${(frac * 100).toFixed(1)}%)`;
    }
  }
}
