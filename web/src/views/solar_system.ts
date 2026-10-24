/**
 * Three.js Solar-System View in Astronomical Units (AU).
 *
 * Implements:
 *   - Sun, Earth, Tug, Mars, and Jupiter
 *   - Earth spiral orbit trail drawn ONLY for the path Earth has traversed up to current time t
 *   - Smooth orbital trajectory curves (no triangular chords cutting across the Sun)
 *   - Target orbit ring at 2.7 AU, Mars-orbit crossing at 1.52 AU, Belt entry at 2.2 AU, Jupiter orbit at 5.20 AU
 *   - Instanced Asteroid Belt particles (2.2 to 3.2 AU, deterministic PRNG seed) labelled illustrative
 *   - Procedural starfield, point-light illumination from the Sun, and logarithmic depth buffer
 *   - Floating origin support to eliminate precision jitter
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SimulationFrame } from '../types';
import { eclipticToScene } from '../coords';
import { interpolateFrame } from '../interpolation';
import { createDeepSpaceMaterial } from '../shaders/deep_space';
import {
  createSunPlasmaMaterial,
  createSunHotCoreMaterial,
  createSunOuterPlasmaMaterial,
  createSunCoronaMaterial,
  createSunCoronaGlowMaterial
} from '../shaders/sun_plasma';
import {
  SCENE_SCALE_AU,
  TARGET_ORBIT_AU,
  MARS_ORBIT_AU,
  ASTEROID_BELT_INNER_AU,
  ASTEROID_BELT_OUTER_AU,
  CERES_SEMI_MAJOR_AXIS_AU,
  EARTH_ROTATION_PERIOD_SECONDS,
  MERCURY_ROTATION_PERIOD_SECONDS,
  VENUS_ROTATION_PERIOD_SECONDS,
  MOON_ROTATION_PERIOD_SECONDS,
  MARS_ROTATION_PERIOD_SECONDS,
  JUPITER_ROTATION_PERIOD_SECONDS,
  SATURN_ROTATION_PERIOD_SECONDS,
  SUN_ROTATION_PERIOD_SECONDS,
  YEAR_SECONDS,
  PHOBOS_ORBIT_PERIOD_SECONDS,
  DEIMOS_ORBIT_PERIOD_SECONDS,
  IO_ORBIT_PERIOD_SECONDS,
  EUROPA_ORBIT_PERIOD_SECONDS,
  GANYMEDE_ORBIT_PERIOD_SECONDS,
  CALLISTO_ORBIT_PERIOD_SECONDS,
  TITAN_ORBIT_PERIOD_SECONDS,
  ENCELADUS_ORBIT_PERIOD_SECONDS,
  TETHYS_ORBIT_PERIOD_SECONDS,
  RHEA_ORBIT_PERIOD_SECONDS,
  URANUS_ORBIT_AU,
  NEPTUNE_ORBIT_AU,
  URANUS_PERIOD_YR,
  NEPTUNE_PERIOD_YR,
  URANUS_ROTATION_PERIOD_SECONDS,
  NEPTUNE_ROTATION_PERIOD_SECONDS,
  TITANIA_ORBIT_PERIOD_SECONDS,
  OBERON_ORBIT_PERIOD_SECONDS,
  TRITON_ORBIT_PERIOD_SECONDS
} from '../config';

const MERCURY_ORBIT_AU = 0.387;
const MERCURY_PERIOD_YR = 0.2408;

const VENUS_ORBIT_AU = 0.723;
const VENUS_PERIOD_YR = 0.6152;

const MARS_PERIOD_YR = 1.8808;

const JUPITER_ORBIT_AU = 5.204;
const JUPITER_PERIOD_YR = 11.862;

const SATURN_ORBIT_AU = 9.582;
const SATURN_PERIOD_YR = 29.457;

const URANUS_ORBIT_AU = 19.191;
const URANUS_PERIOD_YR = 84.01;
const URANUS_ROTATION_PERIOD_SECONDS = -17.24 * 3600;

const NEPTUNE_ORBIT_AU = 30.07;
const NEPTUNE_PERIOD_YR = 164.79;
const NEPTUNE_ROTATION_PERIOD_SECONDS = 16.11 * 3600;

const MAX_TRAIL_POINTS = 3000;

// Deterministic PRNG (Mulberry32) for reproducible asteroid belt generation
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const textureLoader = typeof document !== 'undefined' ? new THREE.TextureLoader() : null;
const textureCache = new Map<string, THREE.Texture>();

function loadTexture(url: string, fallbackTexture: THREE.Texture | null = null): THREE.Texture | null {
  if (!textureLoader || typeof document === 'undefined') return fallbackTexture;
  if (textureCache.has(url)) return textureCache.get(url)!;
  try {
    const tex = textureLoader.load(
      url,
      (loadedTex) => {
        loadedTex.colorSpace = THREE.SRGBColorSpace;
        loadedTex.generateMipmaps = true;
        loadedTex.minFilter = THREE.LinearMipmapLinearFilter;
        loadedTex.magFilter = THREE.LinearFilter;
        loadedTex.needsUpdate = true;
      },
      undefined,
      (err) => {
        console.warn('Failed to load texture:', url, err);
      }
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(url, tex);
    return tex;
  } catch {
    return fallbackTexture;
  }
}

function createSaturnRingMesh(saturnRadius: number = 0.65): THREE.Mesh {
  const innerR = saturnRadius * 1.25;
  const outerR = saturnRadius * 2.38;
  const ringGeo = new THREE.RingGeometry(innerR, outerR, 128, 16);

  // Remap UV coordinates radially so u represents radial distance across the ring
  const pos = ringGeo.attributes.position;
  const uv = ringGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.sqrt(x * x + y * y);
    const u = (r - innerR) / (outerR - innerR);
    uv.setXY(i, u, 0.5);
  }
  uv.needsUpdate = true;

  const ringTex = loadTexture('/textures/saturn_ring.png');
  if (ringTex) {
    ringTex.wrapS = THREE.ClampToEdgeWrapping;
    ringTex.wrapT = THREE.ClampToEdgeWrapping;
  }

  const ringMat = new THREE.MeshStandardMaterial({
    ...(ringTex ? { map: ringTex } : { color: 0xd4af37 }),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.96,
    roughness: 0.80,
    metalness: 0.05,
    depthTest: true,
    depthWrite: false
  });

  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.name = 'saturnRing';
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.castShadow = true;
  ringMesh.receiveShadow = true;
  return ringMesh;
}

function createUranusRingMesh(uranusRadius: number = 0.45): THREE.Mesh {
  const innerR = uranusRadius * 1.40;
  const outerR = uranusRadius * 1.85;
  const ringGeo = new THREE.RingGeometry(innerR, outerR, 96, 4);

  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xa5f3fc,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.28,
    roughness: 0.70,
    metalness: 0.20,
    depthTest: true,
    depthWrite: false
  });

  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.name = 'uranusRing';
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.castShadow = false;
  ringMesh.receiveShadow = true;
  return ringMesh;
}

function createMarsTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Martian rust-red gradient
  const baseGrad = ctx.createLinearGradient(0, 0, 0, 256);
  baseGrad.addColorStop(0.0, '#a33917');
  baseGrad.addColorStop(0.5, '#c95125');
  baseGrad.addColorStop(1.0, '#a33917');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 512, 256);
  // Dark volcanic basalt maria (Syrtis Major, Acidalia Planitia)
  const prng = mulberry32(888);
  ctx.fillStyle = 'rgba(70, 22, 10, 0.45)';
  for (let i = 0; i < 30; i++) {
    const cx = prng() * 512;
    const cy = 50 + prng() * 156;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 25 + prng() * 55, 12 + prng() * 28, prng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Brilliant North & South Polar Ice Caps
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.ellipse(256, 6, 80, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(256, 250, 65, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createJupiterTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const bands = [
    { pos: 0.00, color: '#f5ede3' },
    { pos: 0.10, color: '#c49a6c' },
    { pos: 0.20, color: '#ecdcc8' },
    { pos: 0.32, color: '#9c5333' },
    { pos: 0.44, color: '#f7ede2' },
    { pos: 0.52, color: '#e8af67' },
    { pos: 0.60, color: '#8b3d22' },
    { pos: 0.70, color: '#f2e7d5' },
    { pos: 0.80, color: '#b06d48' },
    { pos: 0.90, color: '#e2d5c3' },
    { pos: 1.00, color: '#c29a75' }
  ];

  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  bands.forEach((b) => gradient.addColorStop(b.pos, b.color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 256);

  // Subtle turbulent cloud noise bands
  const prng = mulberry32(101);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let y = 8; y < 248; y += 4) {
    ctx.fillRect(0, y, 512, 2 + prng() * 3);
  }
  ctx.fillStyle = 'rgba(80, 30, 15, 0.09)';
  for (let y = 14; y < 242; y += 6) {
    ctx.fillRect(0, y, 512, 2 + prng() * 3);
  }

  // Great Red Spot in the South Tropical Zone
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(320, 158, 26, 15, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#b84328';
  ctx.fill();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createUranusTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Pale cyan aquamarine gradient with delicate atmospheric haze
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#70d6d1');
  grad.addColorStop(0.25, '#88e5df');
  grad.addColorStop(0.5, '#a5f3fc');
  grad.addColorStop(0.75, '#88e5df');
  grad.addColorStop(1.0, '#70d6d1');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Subtle zonal banded streaks
  const prng = mulberry32(777);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let y = 10; y < 246; y += 8) {
    ctx.fillRect(0, y, 512, 2 + prng() * 4);
  }

  // Polar methane haze cap
  ctx.fillStyle = 'rgba(224, 254, 254, 0.25)';
  ctx.beginPath();
  ctx.ellipse(256, 12, 140, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createNeptuneTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Deep azure cobalt blue gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#1e3a8a');
  grad.addColorStop(0.3, '#2563eb');
  grad.addColorStop(0.6, '#1d4ed8');
  grad.addColorStop(1.0, '#1e3a8a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // High-altitude supersonic white methane cirrus cloud streaks
  const prng = mulberry32(999);
  ctx.fillStyle = 'rgba(224, 242, 254, 0.45)';
  for (let i = 0; i < 22; i++) {
    const cx = prng() * 512;
    const cy = 40 + prng() * 180;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 35 + prng() * 65, 3 + prng() * 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Great Dark Spot in the Southern Hemisphere
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(290, 160, 22, 13, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.60)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createSunPhotosphereTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Luminous radial/spherical convection gradient (deep incandescent orange to radiant white-gold)
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#d94b00');
  grad.addColorStop(0.15, '#ff8000');
  grad.addColorStop(0.5, '#ffd159');
  grad.addColorStop(0.85, '#ff8000');
  grad.addColorStop(1.0, '#d94b00');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // High-frequency convective granulation cells
  const prng = mulberry32(555);
  ctx.fillStyle = 'rgba(255, 245, 180, 0.20)';
  for (let i = 0; i < 600; i++) {
    const cx = prng() * 1024;
    const cy = prng() * 512;
    const r = 3 + prng() * 12;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Active region magnetic sunspot clusters (Northern & Southern active bands)
  const sunspotBands = [185, 325];
  for (const bandY of sunspotBands) {
    for (let s = 0; s < 7; s++) {
      const cx = (s * 150 + 60 + prng() * 50) % 1024;
      const cy = bandY + (prng() - 0.5) * 45;
      // Penumbra halo
      ctx.fillStyle = 'rgba(168, 65, 14, 0.75)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 14 + prng() * 10, 8 + prng() * 6, prng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      // Umbra core
      ctx.fillStyle = '#220800';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 6 + prng() * 4, 3.5 + prng() * 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export class SolarSystemView {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;

  private bodyMeshes: Map<string, THREE.Object3D> = new Map();
  private asteroidBeltMesh: THREE.InstancedMesh | null = null;
  private ceresMarker: THREE.Mesh | null = null;
  private cosmicNebulaPoints: THREE.Points | null = null;
  private deepSpaceMesh: THREE.Mesh | null = null;
  // Sun Visual Layers (Matching akshuvo101/3d-solar-system-visualizer)
  private sunCoreMesh: THREE.Mesh | null = null;
  private sunPlasmaMaterial: THREE.ShaderMaterial | null = null;
  private sunHotCoreMesh: THREE.Mesh | null = null;
  private sunOuterMesh: THREE.Mesh | null = null;
  private sunCoronaMaterial: THREE.ShaderMaterial | null = null;
  private sunCoronaGlowMaterial: THREE.ShaderMaterial | null = null;

  // Luminous Orbit Trajectories Group (Toggleable)
  public orbitsGroup: THREE.Group = new THREE.Group();

  // Prominent Ceres Tug & Thrusters
  private tugGroup: THREE.Group | null = null;
  private tugThrusterPlume1: THREE.Mesh | null = null;
  private tugThrusterPlume2: THREE.Mesh | null = null;
  private tugTowline: THREE.Line | null = null;
  private towlineGeometry: THREE.BufferGeometry | null = null;
  private towlinePositions: Float32Array = new Float32Array(6);

  // Automated Mining Rig & Plasma Conversion Plant (Enabler E2)
  private quarryAsteroidMesh: THREE.Mesh | null = null;
  private miningRigGroup: THREE.Group | null = null;
  private miningDrillHead1: THREE.Mesh | null = null;
  private miningDrillHead2: THREE.Mesh | null = null;
  private plasmaReactorCore: THREE.Mesh | null = null;
  private miningLaserBeam: THREE.Mesh | null = null;
  private miningLaserGlow: THREE.Mesh | null = null;
  private storageSilos: THREE.Group | null = null;

  // Relativistic Plasma Particle Exhaust Streams (Dual canted 0.3c streams)
  private plasmaParticles: THREE.Points | null = null;
  private plasmaPositions: Float32Array | null = null;
  private plasmaColors: Float32Array | null = null;
  private plasmaVelocities: Float32Array | null = null;
  private plasmaLifetimes: Float32Array | null = null;
  private plasmaMaxLifetimes: Float32Array | null = null;
  private readonly PLASMA_PARTICLE_COUNT: number = 800;

  // Extended Out-of-Ecliptic Plume Cones (θ = ±5.0°) & Clearance Envelope
  private tugExtendedPlume1: THREE.Mesh | null = null;
  private tugExtendedPlume2: THREE.Mesh | null = null;
  private plumeClearanceEnvelope: THREE.Group | null = null;

  // Dual-Lagrange Hexagonal Heating Swarms & Statite Architecture (Enabler E3)
  private mirrorGroup: THREE.Group | null = null;
  private mirrorMesh: THREE.Mesh | null = null;
  private mirrorSunbeam: THREE.Mesh | null = null;
  private currentL1Pos: THREE.Vector3 = new THREE.Vector3(9.35, 0, 0);

  private l1HexFlyers: THREE.Mesh[] = [];
  private l1ElectrochromicRims: THREE.Mesh[] = [];
  private l1NorthPolarBeam: THREE.Mesh | null = null;
  private l1SouthPolarBeam: THREE.Mesh | null = null;
  private l1RayLines: THREE.LineSegments | null = null;
  private l1NorthCaustic: THREE.Mesh | null = null;
  private l1SouthCaustic: THREE.Mesh | null = null;
  private l1SubsolarCaustic: THREE.Mesh | null = null;

  // L2 Night-Side Giant Fixed Hexagonal Concentrator (Anti-Hypercane Reverse Earthshine)
  private l2SwarmGroup: THREE.Group | null = null;
  private l2HexFlyers: THREE.Mesh[] = [];
  private l2ElectrochromicRims: THREE.Mesh[] = [];
  private l2ReverseEarthshineBeam: THREE.Mesh | null = null;
  private l2RayLines: THREE.LineSegments | null = null;
  private l2NightCaustic: THREE.Mesh | null = null;
  private currentL2Pos: THREE.Vector3 = new THREE.Vector3(11.25, 0, 0);

  // Bypass Solar Transfer Corridor (Rays flowing from L1 past Earth to Giant L2 Mirror)
  private bypassBeamsGroup: THREE.Group | null = null;
  private bypassSheath: THREE.Mesh | null = null;
  private bypassRayLines: THREE.LineSegments | null = null;

  // Dynamic Camera Focus & Interactive Raycasting Selection
  private cameraFocus: string = 'system';
  private currentEarthPos: THREE.Vector3 = new THREE.Vector3(10, 0, 0);
  private isThrustingActive: boolean = false;
  private pulseTime: number = 0;
  private currentBeamZScale: number = 1.0;
  private currentBypassScale: number = 1.0;

  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private pointer: THREE.Vector2 = new THREE.Vector2();
  public onFocusChange?: (targetName: string, displayName: string) => void;
  public onBodySelected?: (bodyName: string) => void;

  // Dynamic Traversed Trail (drawn only behind Earth as it traverses)
  private trailLine: THREE.Line | null = null;
  private trailPositions: Float32Array;
  private trailColors: Float32Array;
  private trailGeometry: THREE.BufferGeometry;
  private framesCache: SimulationFrame[] = [];

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();

    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 4000);
    this.camera.position.set(0, 72, 72); // Comfortable framing showing all planets out to Jupiter/Saturn

    let renderer: THREE.WebGLRenderer | null = null;
    const configs: THREE.WebGLRendererParameters[] = [
      { antialias: true, logarithmicDepthBuffer: false, powerPreference: 'default' },
      { antialias: false, logarithmicDepthBuffer: false }
    ];

    for (const cfg of configs) {
      try {
        renderer = new THREE.WebGLRenderer(cfg);
        break;
      } catch (err) {
        console.warn('WebGL config attempt failed:', cfg, err);
      }
    }

    if (!renderer) {
      throw new Error('WebGL is not available or context limit exceeded.');
    }
    this.renderer = renderer;

    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL context lost, awaiting restoration...');
    });

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 2500;

    // Initialize dynamic trail buffers
    this.trailPositions = new Float32Array(MAX_TRAIL_POINTS * 3);
    this.trailColors = new Float32Array(MAX_TRAIL_POINTS * 3);
    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeometry.setAttribute('color', new THREE.BufferAttribute(this.trailColors, 3));
    this.trailGeometry.setDrawRange(0, 0); // Initially empty!

    const trailMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      linewidth: 2
    });
    this.trailLine = new THREE.Line(this.trailGeometry, trailMaterial);
    this.scene.add(this.trailLine);

    this.setupLighting();
    this.setupStarfield();
    this.setupReferenceRings();
    this.setupAsteroidBelt();
    this.setupTugAndThrusters();
    this.setupClimateMirror();
    this.setupPointerInteractions();

    window.addEventListener('resize', this.onWindowResize);
  }

  private onWindowResize = () => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;
    this.camera.aspect = parent.clientWidth / parent.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(parent.clientWidth, parent.clientHeight);
  };

  private setupLighting(): void {
    // 1. Physically authentic deep-space ambient fill (22% starlight fill)
    // Ensures that the hemisphere facing away from the Sun is naturally in night shadow,
    // while terrain and atmospheric silhouettes remain discernible without black voids.
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.22);
    this.scene.add(ambientLight);

    // 2. Primary omnidirectional solar point light radiating radially from Sun at (0, 0, 0)
    // Powers daytime illumination on the sun-facing side of all planetary bodies.
    const sunLight = new THREE.PointLight(0xfff8ea, 18.0, 0, 0.0);
    sunLight.position.set(0, 0, 0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.bias = -0.0002;
    sunLight.shadow.radius = 2;
    this.scene.add(sunLight);
  }

  private setupStarfield(): void {
    const starCount = 3500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const prng = mulberry32(1337);

    for (let i = 0; i < starCount; i++) {
      const u = prng();
      const v = prng();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const radius = 800.0 + prng() * 450.0;

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      const starType = prng();
      if (starType > 0.8) {
        colors[i * 3] = 0.8; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 1.0;
      } else if (starType > 0.4) {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 1.0; colors[i * 3 + 2] = 1.0;
      } else {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 0.7;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.8,
      vertexColors: true,
      sizeAttenuation: false,
      transparent: false,
      depthTest: true,
      depthWrite: false
    });

    const starfield = new THREE.Points(geometry, material);
    starfield.renderOrder = -10;
    this.scene.add(starfield);

    // Deep space luminous cosmic nebula clouds
    const nebulaCount = 1200;
    const nebGeo = new THREE.BufferGeometry();
    const nebPos = new Float32Array(nebulaCount * 3);
    const nebCol = new Float32Array(nebulaCount * 3);

    for (let i = 0; i < nebulaCount; i++) {
      const u = prng();
      const v = prng();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const radius = 600.0 + prng() * 300.0;

      nebPos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      nebPos[i * 3 + 1] = radius * Math.cos(phi);
      nebPos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      const t = prng();
      if (t > 0.65) {
        nebCol[i * 3] = 0.38; nebCol[i * 3 + 1] = 0.35; nebCol[i * 3 + 2] = 0.95; // Indigo-violet
      } else if (t > 0.35) {
        nebCol[i * 3] = 0.05; nebCol[i * 3 + 1] = 0.65; nebCol[i * 3 + 2] = 0.85; // Deep cyan
      } else {
        nebCol[i * 3] = 0.75; nebCol[i * 3 + 1] = 0.20; nebCol[i * 3 + 2] = 0.85; // Cosmic magenta
      }
    }

    nebGeo.setAttribute('position', new THREE.BufferAttribute(nebPos, 3));
    nebGeo.setAttribute('color', new THREE.BufferAttribute(nebCol, 3));

    const nebMat = new THREE.PointsMaterial({
      size: 4.5,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false
    });

    this.cosmicNebulaPoints = new THREE.Points(nebGeo, nebMat);
    this.cosmicNebulaPoints.renderOrder = -9;
    this.scene.add(this.cosmicNebulaPoints);

    // Procedural deep space cosmic nebula background sphere
    try {
      const deepSpaceGeo = new THREE.SphereGeometry(2500, 32, 32);
      const deepSpaceMat = createDeepSpaceMaterial();
      this.deepSpaceMesh = new THREE.Mesh(deepSpaceGeo, deepSpaceMat);
      this.scene.add(this.deepSpaceMesh);
    } catch (e) {
      console.warn('Deep space procedural shader fallback:', e);
    }
  }

  /**
   * Sets up click listener with raycasting to select any planet or moon in the 3D scene.
   */
  private setupPointerInteractions(): void {
    if (!this.renderer || !this.renderer.domElement) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e: PointerEvent) => {
      startX = e.clientX;
      startY = e.clientY;
      startTime = performance.now();
    });

    dom.addEventListener('pointerup', (e: PointerEvent) => {
      const elapsed = performance.now() - startTime;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Only treat as intentional click if the user didn't orbit/drag the view
      if (dist < 6 && elapsed < 350) {
        this.handlePointerClick(e.clientX, e.clientY);
      }
    });
  }

  private handlePointerClick(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const candidates: THREE.Object3D[] = [];
    for (const [_, mesh] of this.bodyMeshes.entries()) {
      candidates.push(mesh);
    }
    if (this.tugGroup) {
      candidates.push(this.tugGroup);
    }

    const intersects = this.raycaster.intersectObjects(candidates, true);
    if (intersects.length > 0) {
      const hit = intersects[0];
      let targetName: string | null = null;

      let curr: THREE.Object3D | null = hit.object;
      while (curr) {
        if (curr === this.tugGroup) {
          targetName = 'earth_tug';
          break;
        }
        for (const [name, mesh] of this.bodyMeshes.entries()) {
          if (curr === mesh) {
            targetName = name;
            break;
          }
        }
        if (targetName) break;
        curr = curr.parent;
      }

      if (targetName) {
        this.setCameraFocus(targetName);
        if (this.onBodySelected) this.onBodySelected(targetName);
        return;
      }
    }

    // Proximity fallback for distant bodies: check ray distance to body center
    let bestName: string | null = null;
    let bestDistToRay = Infinity;

    for (const [name, mesh] of this.bodyMeshes.entries()) {
      const pos = mesh.position;
      const camDist = this.camera.position.distanceTo(pos);
      const clickTolerance = Math.max(0.6, camDist * 0.035);
      const distToRay = this.raycaster.ray.distanceToPoint(pos);
      if (distToRay < clickTolerance && distToRay < bestDistToRay) {
        bestDistToRay = distToRay;
        bestName = name;
      }
    }

    if (bestName) {
      this.setCameraFocus(bestName);
    }
  }

  /**
   * Creates a thin, elegant, continuous orbit ring with reduced width and subtle opacity.
   */
  private createLuminousOrbitRing(
    radiusAU: number,
    colorHex: number,
    opacity: number = 0.28,
    widthScene: number = 0.015
  ): THREE.Group {
    const group = new THREE.Group();
    const rScene = radiusAU * SCENE_SCALE_AU;
    const segments = 256;

    const innerR = Math.max(0.05, rScene - widthScene);
    const outerR = rScene + widthScene;
    const ringGeo = new THREE.RingGeometry(innerR, outerR, segments);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: opacity,
      depthTest: true,
      depthWrite: false
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.renderOrder = 0;
    ringMesh.rotation.x = Math.PI / 2; // Lie flat in X-Z ecliptic plane
    group.add(ringMesh);

    return group;
  }

  private setupReferenceRings(): void {
    this.orbitsGroup.clear();

    // 1. Mercury Orbit (0.387 AU) - Thin subtle silver-grey ribbon
    const mercuryRing = this.createLuminousOrbitRing(MERCURY_ORBIT_AU, 0x94a3b8, 0.22, 0.012);
    this.orbitsGroup.add(mercuryRing);

    // 2. Venus Orbit (0.723 AU) - Thin creamy gold ribbon
    const venusRing = this.createLuminousOrbitRing(VENUS_ORBIT_AU, 0xfde047, 0.24, 0.014);
    this.orbitsGroup.add(venusRing);

    // 3. Earth Initial Reference Orbit (1.00 AU) - Continuous subtle Azure ribbon
    const earthInitRing = this.createLuminousOrbitRing(1.0, 0x38bdf8, 0.28, 0.016);
    this.orbitsGroup.add(earthInitRing);

    // 4. Mars Crossing (1.524 AU) - Continuous solid coral-orange ribbon
    const marsRing = this.createLuminousOrbitRing(MARS_ORBIT_AU, 0xf97316, 0.30, 0.016);
    this.orbitsGroup.add(marsRing);

    // 5. Asteroid Belt Entry (2.20 AU) - Continuous solid golden-amber ribbon
    const beltEntryRing = this.createLuminousOrbitRing(ASTEROID_BELT_INNER_AU, 0xfbbf24, 0.30, 0.018);
    this.orbitsGroup.add(beltEntryRing);

    // 6. Target Orbit (2.70 AU) - Radiant electric cyan destination ribbon
    const targetRing = this.createLuminousOrbitRing(TARGET_ORBIT_AU, 0x00f0ff, 0.50, 0.022);
    this.orbitsGroup.add(targetRing);

    // 7. Jupiter Orbit (5.204 AU) - Continuous solid warm bronze ribbon
    const jupiterRing = this.createLuminousOrbitRing(JUPITER_ORBIT_AU, 0xd97706, 0.30, 0.020);
    this.orbitsGroup.add(jupiterRing);

    // 8. Saturn Orbit (9.582 AU) - Continuous solid golden-ochre ribbon
    const saturnRing = this.createLuminousOrbitRing(SATURN_ORBIT_AU, 0xeab308, 0.26, 0.022);
    this.orbitsGroup.add(saturnRing);

    // 9. Uranus Orbit (19.191 AU) - Continuous solid cyan-teal ribbon
    const uranusRing = this.createLuminousOrbitRing(URANUS_ORBIT_AU, 0x2dd4bf, 0.24, 0.024);
    this.orbitsGroup.add(uranusRing);

    // 10. Neptune Orbit (30.07 AU) - Continuous solid deep azure ribbon
    const neptuneRing = this.createLuminousOrbitRing(NEPTUNE_ORBIT_AU, 0x3b82f6, 0.22, 0.026);
    this.orbitsGroup.add(neptuneRing);

    this.scene.add(this.orbitsGroup);
  }

  private setupAsteroidBelt(): void {
    const asteroidCount = 2500;
    const prng = mulberry32(42);
    const geometry = new THREE.DodecahedronGeometry(0.04, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0x887766,
      roughness: 0.9,
      metalness: 0.1
    });

    this.asteroidBeltMesh = new THREE.InstancedMesh(geometry, material, asteroidCount);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < asteroidCount; i++) {
      const r_min_sq = ASTEROID_BELT_INNER_AU * ASTEROID_BELT_INNER_AU;
      const r_max_sq = ASTEROID_BELT_OUTER_AU * ASTEROID_BELT_OUTER_AU;
      const r_au = Math.sqrt(r_min_sq + prng() * (r_max_sq - r_min_sq));
      const theta = prng() * Math.PI * 2;
      const z_au = (prng() - 0.5) * 0.18;

      const scenePos = eclipticToScene([r_au * Math.cos(theta), r_au * Math.sin(theta), z_au], [0, 0, 0], SCENE_SCALE_AU);

      dummy.position.set(scenePos[0], scenePos[1], scenePos[2]);
      dummy.rotation.set(prng() * Math.PI, prng() * Math.PI, prng() * Math.PI);
      const scale = 0.5 + prng() * 1.5;
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();

      this.asteroidBeltMesh.setMatrixAt(i, dummy.matrix);
    }

    this.asteroidBeltMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.asteroidBeltMesh);

    // Marked Ceres native location point with glowing beacon ring
    const ceresGeom = new THREE.SphereGeometry(0.14, 16, 16);
    const ceresMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    this.ceresMarker = new THREE.Mesh(ceresGeom, ceresMat);
    const ceresPos = eclipticToScene([CERES_SEMI_MAJOR_AXIS_AU, 0, 0], [0, 0, 0], SCENE_SCALE_AU);
    this.ceresMarker.position.set(ceresPos[0], ceresPos[1], ceresPos[2]);

    const ceresBeaconGeo = new THREE.RingGeometry(0.22, 0.28, 24);
    const ceresBeaconMat = new THREE.MeshBasicMaterial({
      color: 0xffca28,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      depthWrite: false
    });
    const ceresBeacon = new THREE.Mesh(ceresBeaconGeo, ceresBeaconMat);
    ceresBeacon.rotation.x = Math.PI / 2;
    this.ceresMarker.add(ceresBeacon);

    this.scene.add(this.ceresMarker);
  }

  private setupTugAndThrusters(): void {
    this.tugGroup = new THREE.Group();

    // 1. Ceres Asteroid Body (Dwarf Planet Gravity Tractor)
    const ceresGeo = new THREE.DodecahedronGeometry(0.24, 1);
    const pos = ceresGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const noise = 1.0 + 0.12 * Math.sin(vx * 12.0) * Math.cos(vy * 10.0);
      pos.setXYZ(i, vx * noise, vy * noise, vz * noise);
    }
    ceresGeo.computeVertexNormals();

    const ceresMat = new THREE.MeshStandardMaterial({
      color: 0x6e6659, // Carbonaceous chondrite
      roughness: 0.85,
      metalness: 0.15,
      flatShading: true
    });
    const ceresMesh = new THREE.Mesh(ceresGeo, ceresMat);
    this.tugGroup.add(ceresMesh);

    // 2. Automated Industrial Asteroid Mining & Plasma Conversion Plant (Enabler E2)
    // High-tech modular extraction rig: mechanical rotary core drills, hydraulic excavator jaws,
    // laser ablation turrets, and an RF plasma arc ionization reactor converting rock into 0.3c propellant.
    this.miningRigGroup = new THREE.Group();
    this.miningRigGroup.position.set(-0.42, 0.04, 0.02);

    // Main heavy industrial rig chassis
    const rigChassisGeo = new THREE.CylinderGeometry(0.10, 0.12, 0.18, 8);
    const rigChassisMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Industrial slate gunmetal
      metalness: 0.90,
      roughness: 0.25
    });
    const rigChassis = new THREE.Mesh(rigChassisGeo, rigChassisMat);
    rigChassis.rotation.z = Math.PI / 2;
    this.miningRigGroup.add(rigChassis);

    // Industrial armor ribs & hazard warning collars
    const collarGeo = new THREE.CylinderGeometry(0.122, 0.122, 0.035, 8);
    const collarMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Industrial hazard amber
      metalness: 0.70,
      roughness: 0.30
    });
    const collar1 = new THREE.Mesh(collarGeo, collarMat);
    collar1.rotation.z = Math.PI / 2;
    collar1.position.set(0.04, 0, 0);
    this.miningRigGroup.add(collar1);

    const collar2 = new THREE.Mesh(collarGeo, collarMat);
    collar2.rotation.z = Math.PI / 2;
    collar2.position.set(-0.04, 0, 0);
    this.miningRigGroup.add(collar2);

    // Radiator heat-sink fins on the mining plant (dissipating vaporization waste heat)
    const radGeo = new THREE.BoxGeometry(0.006, 0.15, 0.18);
    const radMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.85,
      roughness: 0.35
    });
    const radTop = new THREE.Mesh(radGeo, radMat);
    radTop.position.set(0, 0.12, 0);
    this.miningRigGroup.add(radTop);

    const radBottom = new THREE.Mesh(radGeo, radMat);
    radBottom.position.set(0, -0.12, 0);
    this.miningRigGroup.add(radBottom);

    // High-pressure cryogenic buffer vessels (spheres and cylinders)
    const tankGeo = new THREE.SphereGeometry(0.028, 12, 12);
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Thermal gold foil
      metalness: 0.95,
      roughness: 0.15
    });
    for (let t = 0; t < 4; t++) {
      const tank = new THREE.Mesh(tankGeo, tankMat);
      const angle = (t * Math.PI) / 2;
      tank.position.set(0.02, 0.08 * Math.cos(angle), 0.08 * Math.sin(angle));
      this.miningRigGroup.add(tank);
    }

    // Heavy Excavator Clamping Jaws / Piston Booms holding the mined rock
    const jawMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.90,
      roughness: 0.20
    });
    for (let j = 0; j < 4; j++) {
      const jawAngle = (j * Math.PI) / 2 + Math.PI / 4;
      const armGeo = new THREE.BoxGeometry(0.014, 0.08, 0.014);
      const arm = new THREE.Mesh(armGeo, jawMat);
      arm.position.set(-0.10, 0.09 * Math.cos(jawAngle), 0.09 * Math.sin(jawAngle));
      arm.rotation.z = -Math.PI / 6;
      this.miningRigGroup.add(arm);

      // Hydraulic piston cylinder
      const pistonGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.06, 6);
      const piston = new THREE.Mesh(pistonGeo, jawMat);
      piston.position.set(-0.06, 0.07 * Math.cos(jawAngle), 0.07 * Math.sin(jawAngle));
      piston.rotation.z = -Math.PI / 6;
      this.miningRigGroup.add(piston);
    }

    // Internal Feedstock Mineral Core being bored and ground into plasma
    // Shrinks over 9,516 years as mass is extracted and converted
    const quarryGeo = new THREE.DodecahedronGeometry(0.095, 2);
    const qpos = quarryGeo.attributes.position;
    for (let i = 0; i < qpos.count; i++) {
      const qx = qpos.getX(i);
      const qy = qpos.getY(i);
      const qz = qpos.getZ(i);
      const qnoise = 1.0 + 0.12 * Math.sin(qx * 14.0) * Math.cos(qy * 12.0);
      qpos.setXYZ(i, qx * qnoise, qy * qnoise, qz * qnoise);
    }
    quarryGeo.computeVertexNormals();

    const quarryMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Carbonaceous chondrite rock & volatile ice
      roughness: 0.90,
      metalness: 0.18,
      flatShading: true
    });
    this.quarryAsteroidMesh = new THREE.Mesh(quarryGeo, quarryMat);
    this.quarryAsteroidMesh.position.set(-0.13, 0, 0); // Nestled inside the drilling jaws
    this.miningRigGroup.add(this.quarryAsteroidMesh);

    // Primary High-Torque Tungsten-Carbide Rotary Core Drill Auger
    const drillGeo = new THREE.ConeGeometry(0.038, 0.11, 8);
    drillGeo.translate(0, 0.055, 0);
    const drillMat = new THREE.MeshStandardMaterial({
      color: 0x64748b, // Tungsten carbide
      metalness: 0.95,
      roughness: 0.15
    });
    this.miningDrillHead1 = new THREE.Mesh(drillGeo, drillMat);
    this.miningDrillHead1.rotation.z = Math.PI / 2; // Pointed into the rock core (-X)
    this.miningDrillHead1.position.set(-0.04, 0.02, 0.01);
    this.miningRigGroup.add(this.miningDrillHead1);

    // Secondary Articulated Rotary Boring Bit
    const drill2Geo = new THREE.ConeGeometry(0.025, 0.08, 6);
    drill2Geo.translate(0, 0.04, 0);
    this.miningDrillHead2 = new THREE.Mesh(drill2Geo, drillMat);
    this.miningDrillHead2.rotation.z = Math.PI / 2 + 0.20;
    this.miningDrillHead2.position.set(-0.04, -0.025, -0.015);
    this.miningRigGroup.add(this.miningDrillHead2);

    // Active Rotary Rock-Crushing & Micronization Hopper
    const millGeo = new THREE.CylinderGeometry(0.040, 0.040, 0.07, 12);
    const millMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.25
    });
    const rockMill = new THREE.Mesh(millGeo, millMat);
    rockMill.rotation.z = Math.PI / 2;
    rockMill.position.set(0.02, 0, 0);
    this.miningRigGroup.add(rockMill);

    // Flash Vaporization & RF Plasma Arc Ionization Generator Core
    const plasmaCoreGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.065, 12);
    const plasmaCoreMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    this.plasmaReactorCore = new THREE.Mesh(plasmaCoreGeo, plasmaCoreMat);
    this.plasmaReactorCore.rotation.z = Math.PI / 2;
    this.plasmaReactorCore.position.set(0.08, 0, 0);
    this.miningRigGroup.add(this.plasmaReactorCore);

    // RF Induction Magnetic Confinement Rings around the plasma core
    for (let r = 0; r < 3; r++) {
      const ringGeo = new THREE.TorusGeometry(0.038, 0.005, 8, 16);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.95, roughness: 0.15 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(0.06 + r * 0.02, 0, 0);
      this.miningRigGroup.add(ring);
    }

    this.tugGroup.add(this.miningRigGroup);

    // 3. Heavy-Duty Multi-Pipe Gantry Bridge (Transferring structural load & ionized plasma to Ceres)
    const bridgeTrussGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.42, 8);
    const bridgeTrussMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.88,
      roughness: 0.20
    });
    const bridgeTruss = new THREE.Mesh(bridgeTrussGeo, bridgeTrussMat);
    bridgeTruss.rotation.z = Math.PI / 2;
    bridgeTruss.position.set(-0.21, 0.04, 0.02);
    this.tugGroup.add(bridgeTruss);

    // Dual Insulated High-Pressure Plasma Conduits running along the bridge
    const pipeGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.42, 8);
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9, // Glowing plasma conduit
      metalness: 0.90,
      roughness: 0.10
    });
    const pipe1 = new THREE.Mesh(pipeGeo, pipeMat);
    pipe1.rotation.z = Math.PI / 2;
    pipe1.position.set(-0.21, 0.06, 0.035);
    this.tugGroup.add(pipe1);

    const pipe2 = new THREE.Mesh(pipeGeo, pipeMat);
    pipe2.rotation.z = Math.PI / 2;
    pipe2.position.set(-0.21, 0.02, 0.005);
    this.tugGroup.add(pipe2);

    // Cross-struts on the bridge
    for (let b = 0; b < 4; b++) {
      const strutGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.08, 4);
      const strut = new THREE.Mesh(strutGeo, bridgeTrussMat);
      strut.position.set(-0.09 - b * 0.08, 0.04, 0.02);
      strut.rotation.x = Math.PI / 4;
      this.tugGroup.add(strut);
    }

    // 4. Automated Laser Ablation Emitter Turret & Active Beam
    const drillTurretGeo = new THREE.CylinderGeometry(0.020, 0.025, 0.05, 8);
    const drillTurretMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.90,
      roughness: 0.20
    });
    const drillTurret = new THREE.Mesh(drillTurretGeo, drillTurretMat);
    drillTurret.rotation.z = -Math.PI / 2;
    drillTurret.position.set(-0.48, 0.08, 0.05);
    this.tugGroup.add(drillTurret);

    // Active Laser Beam
    const beamGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.09, 8);
    beamGeo.translate(0, 0.045, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.85
    });
    this.miningLaserBeam = new THREE.Mesh(beamGeo, beamMat);
    this.miningLaserBeam.rotation.z = Math.PI / 2;
    this.miningLaserBeam.position.set(-0.48, 0.08, 0.05);
    this.tugGroup.add(this.miningLaserBeam);

    // Laser Excavation Flare / Vaporization Point
    const flareGeo = new THREE.SphereGeometry(0.018, 8, 8);
    const flareMat = new THREE.MeshBasicMaterial({
      color: 0x66ffdd,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    this.miningLaserGlow = new THREE.Mesh(flareGeo, flareMat);
    this.miningLaserGlow.position.set(-0.55, 0.04, 0.02);
    this.tugGroup.add(this.miningLaserGlow);

    // 5. Reaction Mass Storage Silos / Pressurized Hoppers (Enabler E2)
    this.storageSilos = new THREE.Group();
    const siloGeo = new THREE.CylinderGeometry(0.030, 0.030, 0.11, 12);
    const siloMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Aerospace thermal gold foil
      metalness: 0.92,
      roughness: 0.15
    });
    for (let s = 0; s < 3; s++) {
      const silo = new THREE.Mesh(siloGeo, siloMat);
      silo.rotation.x = Math.PI / 2;
      silo.position.set(-0.11 - s * 0.065, 0.08, 0.06);
      this.storageSilos.add(silo);

      // Cryogenic neon level indicator
      const gaugeGeo = new THREE.PlaneGeometry(0.007, 0.08);
      const gaugeMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });
      const gauge = new THREE.Mesh(gaugeGeo, gaugeMat);
      gauge.position.set(-0.11 - s * 0.065, 0.112, 0.06);
      gauge.rotation.x = -Math.PI / 2;
      this.storageSilos.add(gauge);
    }
    this.tugGroup.add(this.storageSilos);

    // 6. Flash Vaporization Chamber (Superheated Injection Core at 3,000 K)
    const vaporGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.09, 12);
    const vaporMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: 0xff3300,
      emissiveIntensity: 0.85,
      metalness: 0.6,
      roughness: 0.25
    });
    const vaporChamber = new THREE.Mesh(vaporGeo, vaporMat);
    vaporChamber.rotation.x = Math.PI / 2;
    vaporChamber.position.set(0, 0, 0.16);
    this.tugGroup.add(vaporChamber);

    // RF Induction Coils around chamber
    for (let c = 0; c < 2; c++) {
      const coilGeo = new THREE.TorusGeometry(0.072, 0.006, 8, 20);
      const coilMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.9, roughness: 0.2 });
      const coil = new THREE.Mesh(coilGeo, coilMat);
      coil.position.set(0, 0, 0.13 + c * 0.05);
      this.tugGroup.add(coil);
    }

    // 7. Central engine gantry & heat shield
    const gantryGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.16, 8);
    const gantryMat = new THREE.MeshStandardMaterial({
      color: 0x8892b0,
      metalness: 0.8,
      roughness: 0.2
    });
    const gantryMesh = new THREE.Mesh(gantryGeo, gantryMat);
    gantryMesh.rotation.x = Math.PI / 2;
    gantryMesh.position.set(0, 0, 0.20);
    this.tugGroup.add(gantryMesh);

    const shieldGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.02, 16);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      metalness: 0.95,
      roughness: 0.1
    });
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldMesh.rotation.x = Math.PI / 2;
    shieldMesh.position.set(0, 0, 0.28);
    this.tugGroup.add(shieldMesh);

    // 8. Dual Canted Relativistic Thrusters (Nozzles + Exhaust Plumes)
    const cantAngleRad = THREE.MathUtils.degToRad(5.0);

    const nozzleGeo = new THREE.ConeGeometry(0.05, 0.14, 12, 1, true);
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.9,
      roughness: 0.2
    });

    const nozzle1 = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle1.rotation.x = -Math.PI / 2 - cantAngleRad;
    nozzle1.position.set(0, 0.09, 0.35);
    this.tugGroup.add(nozzle1);

    const nozzle2 = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle2.rotation.x = -Math.PI / 2 + cantAngleRad;
    nozzle2.position.set(0, -0.09, 0.35);
    this.tugGroup.add(nozzle2);

    // Short illustrative flames
    const plumeGeo = new THREE.ConeGeometry(0.04, 0.32, 16, 1, true);
    plumeGeo.translate(0, -0.16, 0);

    const plumeMat1 = new THREE.MeshBasicMaterial({
      color: 0x00d4ea,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const plumeMat2 = new THREE.MeshBasicMaterial({
      color: 0x00d4ea,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    this.tugThrusterPlume1 = new THREE.Mesh(plumeGeo, plumeMat1);
    this.tugThrusterPlume1.rotation.x = -Math.PI / 2 - cantAngleRad;
    this.tugThrusterPlume1.position.set(0, 0.09, 0.42);
    this.tugGroup.add(this.tugThrusterPlume1);

    this.tugThrusterPlume2 = new THREE.Mesh(plumeGeo.clone(), plumeMat2);
    this.tugThrusterPlume2.rotation.x = -Math.PI / 2 + cantAngleRad;
    this.tugThrusterPlume2.position.set(0, -0.09, 0.42);
    this.tugGroup.add(this.tugThrusterPlume2);

    // Extended Out-of-Ecliptic Bi-Conical Plume Corridors (passing safely above/below Earth)
    // NOTE ON 3D VISUAL SCALING & INTENSITY:
    // Plume geometry uses a refined, sleek collimated cone (radius 0.11, length 3.2) with soft
    // translucent ion glow (opacity 0.075) to prevent visually overpowering the scene while
    // maintaining physical fidelity to the out-of-ecliptic bypass corridor.
    const visualCantAngleRad = THREE.MathUtils.degToRad(28.0);
    const extPlumeGeo = new THREE.ConeGeometry(0.11, 3.2, 16, 1, true);
    extPlumeGeo.translate(0, -1.6, 0); // apex at nozzle mouth, expanding backward past Earth into deep space
    const extPlumeMat1 = new THREE.MeshBasicMaterial({
      color: 0x00b4d8,
      transparent: true,
      opacity: 0.075,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const extPlumeMat2 = new THREE.MeshBasicMaterial({
      color: 0x00b4d8,
      transparent: true,
      opacity: 0.075,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.tugExtendedPlume1 = new THREE.Mesh(extPlumeGeo, extPlumeMat1);
    this.tugExtendedPlume1.rotation.x = -Math.PI / 2 - visualCantAngleRad;
    this.tugExtendedPlume1.position.set(0, 0.09, 0.42);
    this.tugGroup.add(this.tugExtendedPlume1);

    this.tugExtendedPlume2 = new THREE.Mesh(extPlumeGeo.clone(), extPlumeMat2);
    this.tugExtendedPlume2.rotation.x = -Math.PI / 2 + visualCantAngleRad;
    this.tugExtendedPlume2.position.set(0, -0.09, 0.42);
    this.tugGroup.add(this.tugExtendedPlume2);

    // Plume Safe Biosphere Clearance Envelope (visualizing the ±110,696 km safety corridor)
    this.plumeClearanceEnvelope = new THREE.Group();

    // 1. Out-of-ecliptic clearance rings at Earth encounter plane (Z = 1.40, Y = ±0.61)
    const clearRingGeo = new THREE.RingGeometry(0.10, 0.12, 32);
    const clearRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide
    });
    const ringNorth = new THREE.Mesh(clearRingGeo, clearRingMat);
    ringNorth.position.set(0, 0.61, 1.40);
    this.plumeClearanceEnvelope.add(ringNorth);

    const ringSouth = new THREE.Mesh(clearRingGeo, clearRingMat);
    ringSouth.position.set(0, -0.61, 1.40);
    this.plumeClearanceEnvelope.add(ringSouth);

    // 2. Out-of-ecliptic corridor trajectory lines (connecting nozzles through rings to deep space)
    const corridorMat = new THREE.LineDashedMaterial({
      color: 0x00b4d8,
      dashSize: 0.12,
      gapSize: 0.08,
      transparent: true,
      opacity: 0.12
    });

    const northPts = [
      new THREE.Vector3(0, 0.09, 0.42),
      new THREE.Vector3(0, 0.61, 1.40),
      new THREE.Vector3(0, 1.25, 2.60)
    ];
    const northGeo = new THREE.BufferGeometry().setFromPoints(northPts);
    const northLine = new THREE.Line(northGeo, corridorMat);
    northLine.computeLineDistances();
    this.plumeClearanceEnvelope.add(northLine);

    const southPts = [
      new THREE.Vector3(0, -0.09, 0.42),
      new THREE.Vector3(0, -0.61, 1.40),
      new THREE.Vector3(0, -1.25, 2.60)
    ];
    const southGeo = new THREE.BufferGeometry().setFromPoints(southPts);
    const southLine = new THREE.Line(southGeo, corridorMat);
    southLine.computeLineDistances();
    this.plumeClearanceEnvelope.add(southLine);

    // 3. Biosphere Protection Shield Perimeter Ring around Earth (Z = 1.40, radius 0.44)
    const shieldRingGeo = new THREE.RingGeometry(0.44, 0.455, 48);
    const shieldRingMat = new THREE.MeshBasicMaterial({
      color: 0x10b981, // Emerald safety green
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide
    });
    const shieldRing = new THREE.Mesh(shieldRingGeo, shieldRingMat);
    shieldRing.rotation.x = Math.PI / 2;
    shieldRing.position.set(0, 0, 1.40);
    this.plumeClearanceEnvelope.add(shieldRing);

    this.tugGroup.add(this.plumeClearanceEnvelope);

    // 9. Relativistic Plasma Particle Stream System (Twin Canted Cones @ 0.3c)
    const count = this.PLASMA_PARTICLE_COUNT;
    this.plasmaPositions = new Float32Array(count * 3);
    this.plasmaColors = new Float32Array(count * 3);
    this.plasmaVelocities = new Float32Array(count * 3);
    this.plasmaLifetimes = new Float32Array(count);
    this.plasmaMaxLifetimes = new Float32Array(count);

    const sinCant = Math.sin(visualCantAngleRad);
    const cosCant = Math.cos(visualCantAngleRad);

    for (let i = 0; i < count; i++) {
      const isNorth = i % 2 === 0;
      const nozzleY = isNorth ? 0.09 : -0.09;
      const cantSign = isNorth ? 1.0 : -1.0;
      this.plasmaMaxLifetimes[i] = 0.65 + Math.random() * 0.35;
      this.plasmaLifetimes[i] = Math.random() * this.plasmaMaxLifetimes[i];
      const speed = 3.6 + Math.random() * 1.0;

      this.plasmaVelocities[i * 3 + 0] = (Math.random() - 0.5) * 0.04;
      this.plasmaVelocities[i * 3 + 1] = cantSign * sinCant * speed + (Math.random() - 0.5) * 0.02;
      this.plasmaVelocities[i * 3 + 2] = cosCant * speed;

      const currentLife = this.plasmaLifetimes[i];
      this.plasmaPositions[i * 3 + 0] = (Math.random() - 0.5) * 0.02 + this.plasmaVelocities[i * 3 + 0] * currentLife;
      this.plasmaPositions[i * 3 + 1] = nozzleY + (Math.random() - 0.5) * 0.02 + this.plasmaVelocities[i * 3 + 1] * currentLife;
      this.plasmaPositions[i * 3 + 2] = 0.42 + this.plasmaVelocities[i * 3 + 2] * currentLife;

      // Safe biosphere check: If initial particle is in Earth envelope, deflect it
      const pX = this.plasmaPositions[i * 3 + 0];
      const pY = this.plasmaPositions[i * 3 + 1];
      const pZ = this.plasmaPositions[i * 3 + 2] - 1.40;
      if (pX * pX + pY * pY + pZ * pZ < 0.48 * 0.48) {
        this.plasmaPositions[i * 3 + 1] = cantSign * 0.58;
      }

      const progress = currentLife / this.plasmaMaxLifetimes[i];
      if (progress < 0.25) {
        this.plasmaColors[i * 3 + 0] = 0.35;
        this.plasmaColors[i * 3 + 1] = 0.65;
        this.plasmaColors[i * 3 + 2] = 0.85;
      } else if (progress < 0.65) {
        this.plasmaColors[i * 3 + 0] = 0.0;
        this.plasmaColors[i * 3 + 1] = 0.45;
        this.plasmaColors[i * 3 + 2] = 0.70;
      } else {
        this.plasmaColors[i * 3 + 0] = 0.15 * (1.0 - progress);
        this.plasmaColors[i * 3 + 1] = 0.05 * (1.0 - progress);
        this.plasmaColors[i * 3 + 2] = 0.35 * (1.0 - progress);
      }
    }

    const plasmaGeo = new THREE.BufferGeometry();
    plasmaGeo.setAttribute('position', new THREE.BufferAttribute(this.plasmaPositions, 3));
    plasmaGeo.setAttribute('color', new THREE.BufferAttribute(this.plasmaColors, 3));

    const plasmaMat = new THREE.PointsMaterial({
      size: 0.016,
      vertexColors: true,
      transparent: true,
      opacity: 0.40,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.plasmaParticles = new THREE.Points(plasmaGeo, plasmaMat);
    this.tugGroup.add(this.plasmaParticles);

    // 10. Reticle Ring Marker around Ceres Tug (makes it easily identifiable)
    const ringGeo = new THREE.RingGeometry(0.40, 0.44, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    this.tugGroup.add(ringMesh);

    this.tugGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    this.scene.add(this.tugGroup);

    // 11. Gravitational Towline (Earth to Ceres Tug)
    this.towlineGeometry = new THREE.BufferGeometry();
    this.towlineGeometry.setAttribute('position', new THREE.BufferAttribute(this.towlinePositions, 3));
    const towlineMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
      linewidth: 2
    });
    this.tugTowline = new THREE.Line(this.towlineGeometry, towlineMat);
    this.scene.add(this.tugTowline);
  }

  private setupClimateMirror(): void {
    // =========================================================================
    // 1. L1 DAY-SIDE CONCENTRATING HEXAGONAL SWARM (Statite Levitation)
    // =========================================================================
    // Tessellation of 19 autonomous kilometer-scale hexagonal flyers (1 center + 6 ring-1 + 12 ring-2)
    // equipped with electrochromic edges for solar sailboat tacking against photon pressure.
    this.mirrorGroup = new THREE.Group();
    this.l1HexFlyers = [];
    this.l1ElectrochromicRims = [];

    const hexR = 0.042; // individual hexagonal flyer radius
    const hexSpacing = hexR * Math.sqrt(3); // exact gapless interlocking tessellation distance

    // Calculate 19 interlocking hexagon centers (Axial honeycomb coordinates)
    const l1HexOffsets: [number, number][] = [
      [0, 0], // Center flyer
    ];
    // Ring 1 (6 flyers)
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + Math.PI / 6;
      l1HexOffsets.push([hexSpacing * Math.cos(angle), hexSpacing * Math.sin(angle)]);
    }
    // Ring 2 (12 flyers: 6 corners + 6 edges)
    for (let i = 0; i < 6; i++) {
      const angleCorner = (i * Math.PI) / 3 + Math.PI / 6;
      const cornerX = 2 * hexSpacing * Math.cos(angleCorner);
      const cornerY = 2 * hexSpacing * Math.sin(angleCorner);
      l1HexOffsets.push([cornerX, cornerY]);

      const nextCornerAngle = ((i + 1) * Math.PI) / 3 + Math.PI / 6;
      const midX = (cornerX + 2 * hexSpacing * Math.cos(nextCornerAngle)) * 0.5;
      const midY = (cornerY + 2 * hexSpacing * Math.sin(nextCornerAngle)) * 0.5;
      l1HexOffsets.push([midX, midY]);
    }

    const hexFlyerGeo = new THREE.CircleGeometry(hexR * 0.98, 6);
    const hexFlyerMat = new THREE.MeshStandardMaterial({
      color: 0xfffbeb, // High-reflectivity specular gold-platinum gossamer membrane
      metalness: 0.96,
      roughness: 0.05,
      side: THREE.DoubleSide
    });

    const rimGeo = new THREE.RingGeometry(hexR * 0.88, hexR, 6);
    const rimMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, // Cyan electrochromic edge panel for solar sailboat tacking
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });

    const gimbalNodeGeo = new THREE.SphereGeometry(hexR * 0.16, 8, 8);
    const gimbalNodeMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.8,
      roughness: 0.2
    });

    l1HexOffsets.forEach(([ox, oy], idx) => {
      const flyer = new THREE.Mesh(hexFlyerGeo, hexFlyerMat.clone());
      flyer.position.set(ox, oy, 0);

      const rim = new THREE.Mesh(rimGeo, rimMat.clone());
      rim.position.set(ox, oy, 0.001);
      this.l1ElectrochromicRims.push(rim);

      const gimbal = new THREE.Mesh(gimbalNodeGeo, gimbalNodeMat);
      gimbal.position.set(ox, oy, 0.003);

      this.mirrorGroup!.add(flyer);
      this.mirrorGroup!.add(rim);
      this.mirrorGroup!.add(gimbal);
      this.l1HexFlyers.push(flyer);
      if (idx === 0) this.mirrorMesh = flyer;
    });

    // Virtual formation flying laser metrology grid (inter-flyer lines)
    const laserLinePositions: number[] = [];
    for (let i = 0; i < l1HexOffsets.length; i++) {
      for (let j = i + 1; j < l1HexOffsets.length; j++) {
        const dx = l1HexOffsets[i][0] - l1HexOffsets[j][0];
        const dy = l1HexOffsets[i][1] - l1HexOffsets[j][1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < hexSpacing * 1.15) {
          laserLinePositions.push(
            l1HexOffsets[i][0], l1HexOffsets[i][1], 0.002,
            l1HexOffsets[j][0], l1HexOffsets[j][1], 0.002
          );
        }
      }
    }
    const laserGeo = new THREE.BufferGeometry();
    laserGeo.setAttribute('position', new THREE.Float32BufferAttribute(laserLinePositions, 3));
    const laserMat = new THREE.LineBasicMaterial({
      color: 0x10b981, // Emerald laser metrology alignment beams
      transparent: true,
      opacity: 0.55
    });
    const laserMesh = new THREE.LineSegments(laserGeo, laserMat);
    this.mirrorGroup.add(laserMesh);

    // Glowing amber statite perimeter beacon ring
    const beaconGeo = new THREE.RingGeometry(0.24, 0.26, 32);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.70
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    this.mirrorGroup.add(beacon);

    // -------------------------------------------------------------------------
    // DYNAMIC TARGETED HEATING BEAMS (Poles & Terminators - Prevents Ocean Boiling)
    // -------------------------------------------------------------------------
    // Exact Ray-Tracing Optics (Nominal Earth center at z = 1.25, surface at z = 0.87):
    // 1. Central Day-Side Sunbeam (flushing against Earth's day surface at z = 0.87)
    // Cylinder: bottom (at L1) radius 0.16, top (at Earth surface) radius 0.28, height = 0.87
    const centerBeamGeo = new THREE.CylinderGeometry(0.28, 0.16, 0.87, 24, 1, true);
    centerBeamGeo.translate(0, 0.435, 0); // bottom at y=0, top at y=0.87
    centerBeamGeo.rotateX(Math.PI / 2); // bottom at z=0, top at z=0.87 (touching Earth)
    const centerBeamMat = new THREE.MeshBasicMaterial({
      color: 0xffe082,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.mirrorSunbeam = new THREE.Mesh(centerBeamGeo, centerBeamMat);
    this.mirrorGroup.add(this.mirrorSunbeam);

    // Sub-solar Day Surface Caustics Illumination Disk (on Earth's day hemisphere at z = 0.87)
    const subsolarCausticGeo = new THREE.CircleGeometry(0.28, 24);
    const subsolarCausticMat = new THREE.MeshBasicMaterial({
      color: 0xffd54f,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.l1SubsolarCaustic = new THREE.Mesh(subsolarCausticGeo, subsolarCausticMat);
    this.l1SubsolarCaustic.position.set(0, 0, 0.87);
    this.mirrorGroup.add(this.l1SubsolarCaustic);

    // 2. North Polar Concentrator Corridor (Gimbaled toward Arctic circle at y = +0.36, z = 1.22)
    // Vector from (0, 0.08, 0) to (0, 0.36, 1.22): dy = 0.28, dz = 1.22 -> length = 1.251, angle = -0.2255 rad (-12.92 deg)
    const polarBeamGeo = new THREE.CylinderGeometry(0.10, 0.06, 1.251, 20, 1, true);
    polarBeamGeo.translate(0, 1.251 * 0.5, 0);
    polarBeamGeo.rotateX(Math.PI / 2);

    const beamMatNorth = new THREE.MeshBasicMaterial({
      color: 0xffd54f, // Warm solar amber-gold
      transparent: true,
      opacity: 0.40,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.l1NorthPolarBeam = new THREE.Mesh(polarBeamGeo, beamMatNorth);
    this.l1NorthPolarBeam.position.set(0, 0.08, 0);
    this.l1NorthPolarBeam.rotation.x = -0.2255;
    this.mirrorGroup.add(this.l1NorthPolarBeam);

    // Arctic North Polar Caustic Focal Spot (at y = 0.36, z = 1.22)
    const northCausticGeo = new THREE.CircleGeometry(0.10, 20);
    const northCausticMat = new THREE.MeshBasicMaterial({
      color: 0xfffbeb,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.l1NorthCaustic = new THREE.Mesh(northCausticGeo, northCausticMat);
    this.l1NorthCaustic.position.set(0, 0.36, 1.22);
    this.l1NorthCaustic.rotation.x = -0.2255;
    this.mirrorGroup.add(this.l1NorthCaustic);

    // 3. South Polar Concentrator Corridor (Gimbaled toward Antarctic circle at y = -0.36, z = 1.22)
    const beamMatSouth = beamMatNorth.clone();
    this.l1SouthPolarBeam = new THREE.Mesh(polarBeamGeo, beamMatSouth);
    this.l1SouthPolarBeam.position.set(0, -0.08, 0);
    this.l1SouthPolarBeam.rotation.x = 0.2255;
    this.mirrorGroup.add(this.l1SouthPolarBeam);

    // Antarctic South Polar Caustic Focal Spot (at y = -0.36, z = 1.22)
    const southCausticMat = northCausticMat.clone();
    this.l1SouthCaustic = new THREE.Mesh(northCausticGeo, southCausticMat);
    this.l1SouthCaustic.position.set(0, -0.36, 1.22);
    this.l1SouthCaustic.rotation.x = 0.2255;
    this.mirrorGroup.add(this.l1SouthCaustic);

    // 4. Ray-Traced Photon Lines from L1 Flyers directly striking Earth
    const l1RayPositions: number[] = [];
    const northFlyers = l1HexOffsets.filter(([_, oy]) => oy > 0.03);
    northFlyers.forEach(([ox, oy], k) => {
      const angle = (k / northFlyers.length) * Math.PI * 2;
      const targetX = 0.08 * Math.cos(angle);
      const targetY = 0.36 + 0.05 * Math.sin(angle);
      const targetZ = 1.22;
      l1RayPositions.push(ox, oy, 0.003, targetX, targetY, targetZ);
    });
    const southFlyers = l1HexOffsets.filter(([_, oy]) => oy < -0.03);
    southFlyers.forEach(([ox, oy], k) => {
      const angle = (k / southFlyers.length) * Math.PI * 2;
      const targetX = 0.08 * Math.cos(angle);
      const targetY = -0.36 + 0.05 * Math.sin(angle);
      const targetZ = 1.22;
      l1RayPositions.push(ox, oy, 0.003, targetX, targetY, targetZ);
    });
    const leftFlyers = l1HexOffsets.filter(([ox, _]) => ox < -0.04);
    leftFlyers.forEach(([ox, oy], k) => {
      const ty = (k - 1) * 0.14;
      l1RayPositions.push(ox, oy, 0.003, -0.38, ty, 1.25);
    });
    const rightFlyers = l1HexOffsets.filter(([ox, _]) => ox > 0.04);
    rightFlyers.forEach(([ox, oy], k) => {
      const ty = (k - 1) * 0.14;
      l1RayPositions.push(ox, oy, 0.003, 0.38, ty, 1.25);
    });
    const centerFlyers = l1HexOffsets.filter(([ox, oy]) => Math.sqrt(ox * ox + oy * oy) < 0.05);
    centerFlyers.forEach(([ox, oy], k) => {
      const a = (k * Math.PI) / 3;
      l1RayPositions.push(ox, oy, 0.003, 0.15 * Math.cos(a), 0.15 * Math.sin(a), 0.87);
    });

    const l1RayGeo = new THREE.BufferGeometry();
    l1RayGeo.setAttribute('position', new THREE.Float32BufferAttribute(l1RayPositions, 3));
    const l1RayMat = new THREE.LineBasicMaterial({
      color: 0xfef08a, // Brilliant laser gold photon rays
      transparent: true,
      opacity: 0.75
    });
    this.l1RayLines = new THREE.LineSegments(l1RayGeo, l1RayMat);
    this.mirrorGroup.add(this.l1RayLines);

    this.scene.add(this.mirrorGroup);

    // =========================================================================
    // 2. L2 NIGHT-SIDE GIANT FIXED HEXAGONAL CONCENTRATOR (Anti-Hypercane Reverse Earthshine)
    // =========================================================================
    // Stationed at the Sun-Earth L2 collinear Lagrange point along the Sun-Earth axis.
    // Built as a colossal, gapless 37-tile hexagonal honeycomb array (significantly larger than L1 and Earth)
    // that intercepts the wide cylinder of bypass sunlight streaming past Earth
    // and focuses it backward onto the dark hemisphere, completely eliminating supersonic hyper-canes.
    this.l2SwarmGroup = new THREE.Group();
    this.l2HexFlyers = [];
    this.l2ElectrochromicRims = [];

    const l2HexR = 0.082; // Large hexagonal flyer radius (produces total diameter > 1.2 scene units)
    const l2HexSpacing = l2HexR * Math.sqrt(3);

    // 37 Interlocking Hexagons in Axial Honeycomb (Center + 3 full concentric rings)
    const l2HexOffsets: [number, number][] = [];
    for (let q = -3; q <= 3; q++) {
      const r1 = Math.max(-3, -q - 3);
      const r2 = Math.min(3, -q + 3);
      for (let r = r1; r <= r2; r++) {
        const x = l2HexSpacing * (q + r / 2);
        const y = l2HexR * 1.5 * r;
        l2HexOffsets.push([x, y]);
      }
    }

    const l2FlyerGeo = new THREE.CircleGeometry(l2HexR * 0.98, 6);
    const l2FlyerMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a, // High-specular reflective gold mirror
      emissive: 0x92400e, // Brilliant golden emissive luster so dish is radiant on both sides
      emissiveIntensity: 0.45,
      metalness: 0.96,
      roughness: 0.05,
      side: THREE.DoubleSide
    });
    const l2RimGeo = new THREE.RingGeometry(l2HexR * 0.88, l2HexR, 6);
    const l2RimMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, // Cyan electrochromic edge panel for solar tacking
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const l2GimbalGeo = new THREE.SphereGeometry(l2HexR * 0.16, 8, 8);
    const l2GimbalMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.8,
      roughness: 0.2
    });

    // Parabolic dish curvature: Outer flyers curve slightly toward Earth
    const maxDist = 3 * l2HexSpacing;
    l2HexOffsets.forEach(([ox, oy]) => {
      const dist = Math.sqrt(ox * ox + oy * oy);
      const dishZ = 0.06 * Math.pow(dist / maxDist, 2);

      const flyer = new THREE.Mesh(l2FlyerGeo, l2FlyerMat.clone());
      flyer.position.set(ox, oy, dishZ);

      const rim = new THREE.Mesh(l2RimGeo, l2RimMat.clone());
      rim.position.set(ox, oy, dishZ + 0.001);

      const gimbal = new THREE.Mesh(l2GimbalGeo, l2GimbalMat);
      gimbal.position.set(ox, oy, dishZ + 0.003);

      this.l2SwarmGroup!.add(flyer);
      this.l2SwarmGroup!.add(rim);
      this.l2SwarmGroup!.add(gimbal);
      this.l2HexFlyers.push(flyer);
      this.l2ElectrochromicRims.push(rim);
    });

    // L2 Virtual formation flying laser metrology grid connecting all 37 flyers
    const l2LaserPositions: number[] = [];
    for (let i = 0; i < l2HexOffsets.length; i++) {
      for (let j = i + 1; j < l2HexOffsets.length; j++) {
        const dx = l2HexOffsets[i][0] - l2HexOffsets[j][0];
        const dy = l2HexOffsets[i][1] - l2HexOffsets[j][1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < l2HexSpacing * 1.15) {
          const z1 = 0.06 * Math.pow(Math.sqrt(l2HexOffsets[i][0] ** 2 + l2HexOffsets[i][1] ** 2) / maxDist, 2);
          const z2 = 0.06 * Math.pow(Math.sqrt(l2HexOffsets[j][0] ** 2 + l2HexOffsets[j][1] ** 2) / maxDist, 2);
          l2LaserPositions.push(
            l2HexOffsets[i][0], l2HexOffsets[i][1], z1 + 0.002,
            l2HexOffsets[j][0], l2HexOffsets[j][1], z2 + 0.002
          );
        }
      }
    }
    const l2LaserGeo = new THREE.BufferGeometry();
    l2LaserGeo.setAttribute('position', new THREE.Float32BufferAttribute(l2LaserPositions, 3));
    const l2LaserMat = new THREE.LineBasicMaterial({
      color: 0x10b981, // Emerald laser metrology grid
      transparent: true,
      opacity: 0.55
    });
    const l2LaserMesh = new THREE.LineSegments(l2LaserGeo, l2LaserMat);
    this.l2SwarmGroup.add(l2LaserMesh);

    // Giant perimeter beacon ring
    const l2BeaconGeo = new THREE.RingGeometry(0.56, 0.60, 48);
    const l2BeaconMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, // Cyan statite control ring
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });
    const l2Beacon = new THREE.Mesh(l2BeaconGeo, l2BeaconMat);
    l2Beacon.position.set(0, 0, 0.06);
    this.l2SwarmGroup.add(l2Beacon);

    // Giant Reverse Earthshine Focus Beam:
    // Starts WIDE at giant L2 parabolic dish (z = 0, R = 0.58) and CONVERGES to Earth's night side (z = 0.87, R = 0.36)
    const l2BeamGeo = new THREE.CylinderGeometry(0.36, 0.58, 0.87, 32, 1, true);
    l2BeamGeo.translate(0, 0.435, 0); // bottom at y=0 (R=0.58), top at y=0.87 (R=0.36)
    l2BeamGeo.rotateX(Math.PI / 2); // bottom at z=0 (at dish), top at z=0.87 (flush against Earth night hemisphere)
    const l2BeamMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b, // Warm amber reverse Earthshine illumination
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.l2ReverseEarthshineBeam = new THREE.Mesh(l2BeamGeo, l2BeamMat);
    this.l2SwarmGroup.add(this.l2ReverseEarthshineBeam);

    // Reverse Earthshine Nocturnal Caustics Glow Cap (on Earth's night hemisphere at z = 0.87)
    const l2NightCausticGeo = new THREE.CircleGeometry(0.36, 32);
    const l2NightCausticMat = new THREE.MeshBasicMaterial({
      color: 0xd97706,
      transparent: true,
      opacity: 0.40,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.l2NightCaustic = new THREE.Mesh(l2NightCausticGeo, l2NightCausticMat);
    this.l2NightCaustic.position.set(0, 0, 0.87);
    this.l2SwarmGroup.add(this.l2NightCaustic);

    // Ray-Traced Reverse Earthshine Photon Lines (from outer & intermediate L2 tiles to Earth's night side)
    const l2RayPositions: number[] = [];
    const outerL2Tiles = l2HexOffsets.filter(([ox, oy]) => Math.sqrt(ox * ox + oy * oy) > 0.25);
    outerL2Tiles.forEach(([ox, oy], k) => {
      const dist = Math.sqrt(ox * ox + oy * oy);
      const dishZ = 0.06 * Math.pow(dist / maxDist, 2);
      const angle = (k / outerL2Tiles.length) * Math.PI * 2;
      const targetX = 0.34 * Math.cos(angle);
      const targetY = 0.34 * Math.sin(angle);
      const targetZ = 0.87;
      l2RayPositions.push(ox, oy, dishZ + 0.003, targetX, targetY, targetZ);
    });
    const innerL2Tiles = l2HexOffsets.filter(([ox, oy]) => Math.sqrt(ox * ox + oy * oy) <= 0.15);
    innerL2Tiles.forEach(([ox, oy]) => {
      l2RayPositions.push(ox, oy, 0.003, 0, 0, 0.87);
    });

    const l2RayGeo = new THREE.BufferGeometry();
    l2RayGeo.setAttribute('position', new THREE.Float32BufferAttribute(l2RayPositions, 3));
    const l2RayMat = new THREE.LineBasicMaterial({
      color: 0xfbbf24, // Bright amber photon lines
      transparent: true,
      opacity: 0.70
    });
    this.l2RayLines = new THREE.LineSegments(l2RayGeo, l2RayMat);
    this.l2SwarmGroup.add(this.l2RayLines);

    this.scene.add(this.l2SwarmGroup);

    // =========================================================================
    // 3. BYPASS SOLAR TRANSFER CORRIDOR (L1 Day Lens -> around Earth -> Giant L2 Mirror)
    // =========================================================================
    // A visible sheath and glowing ray corridors demonstrating the sunlight from L1
    // passing safely around Earth's perimeter and being captured by the giant L2 mirror.
    this.bypassBeamsGroup = new THREE.Group();

    // Expanding bypass sheath: Starts at L1 (z = -1.25, R = 0.26), widens past Earth (z = 0, R = 0.48), reaches L2 (z = +1.25, R = 0.58)
    // CylinderGeometry: top (at +y) radius 0.58, bottom (at -y) radius 0.26, height 2.50
    // After rotateX(PI/2): -y -> -z = -1.25 (at L1, R=0.26), +y -> +z = +1.25 (at L2, R=0.58)
    const sheathGeo = new THREE.CylinderGeometry(0.58, 0.26, 2.50, 32, 1, true);
    sheathGeo.rotateX(Math.PI / 2); // Along local Z axis (Sun-Earth axis)
    const sheathMat = new THREE.MeshBasicMaterial({
      color: 0xffd54f, // Solar golden-amber
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.bypassSheath = new THREE.Mesh(sheathGeo, sheathMat);
    this.bypassBeamsGroup.add(this.bypassSheath);

    // 12 Longitudinal Bypass Laser Raylines linking L1 perimeter to Giant L2 perimeter
    const bypassRayPositions: number[] = [];
    const numRays = 12;
    for (let i = 0; i < numRays; i++) {
      const a = (i / numRays) * Math.PI * 2;
      const x1 = 0.25 * Math.cos(a);
      const y1 = 0.25 * Math.sin(a);
      const z1 = -1.25; // At L1

      const xMid = 0.48 * Math.cos(a);
      const yMid = 0.48 * Math.sin(a);
      const zMid = 0.0; // Waist clearing Earth

      const x2 = 0.57 * Math.cos(a);
      const y2 = 0.57 * Math.sin(a);
      const z2 = 1.25; // At L2

      bypassRayPositions.push(x1, y1, z1, xMid, yMid, zMid);
      bypassRayPositions.push(xMid, yMid, zMid, x2, y2, z2);
    }
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute('position', new THREE.Float32BufferAttribute(bypassRayPositions, 3));
    const rayMat = new THREE.LineBasicMaterial({
      color: 0xfbbf24, // Bright amber photon transfer corridors
      transparent: true,
      opacity: 0.65
    });
    this.bypassRayLines = new THREE.LineSegments(rayGeo, rayMat);
    this.bypassBeamsGroup.add(this.bypassRayLines);

    this.scene.add(this.bypassBeamsGroup);
  }

  public setFramesCache(frames: SimulationFrame[]): void {
    this.framesCache = frames;
  }

  /**
   * Update the traversed trajectory trail so it cleanly tracks Earth's traversed orbital path.
   * Uses smooth orbital sampling over Earth's recent traversed revolutions (up to 2 full orbits),
   * preventing straight chord cuts across the Sun while showing the exact path Earth has traversed.
   */
  public updateTraversedTrail(currentTime_s: number): void {
    if (!this.framesCache || this.framesCache.length === 0) return;

    const t0 = this.framesCache[0].time_s;
    if (currentTime_s <= t0) {
      this.trailGeometry.setDrawRange(0, 0);
      return;
    }

    // Traversed trail duration: from start up to 2 full orbits (2 * 4.5 years max)
    // to keep the visualizer crystal clear without chord clutter
    const maxTrailDuration_s = 3.0 * YEAR_SECONDS * Math.pow(TARGET_ORBIT_AU, 1.5); // ~13.3 years max wake
    const trailDuration_s = Math.min(currentTime_s - t0, maxTrailDuration_s);
    const trailStart_s = currentTime_s - trailDuration_s;

    const numPoints = 256; // 256 smooth points along the traversed arc

    const posAttr = this.trailGeometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.trailGeometry.getAttribute('color') as THREE.BufferAttribute;

    const color = new THREE.Color();

    for (let k = 0; k < numPoints; k++) {
      const tau = trailStart_s + (k / (numPoints - 1)) * trailDuration_s;
      const interpolated = interpolateFrame(this.framesCache, tau);
      const earth = interpolated.bodies['Earth'];
      if (!earth) continue;

      const scenePos = eclipticToScene([earth.x, earth.y, earth.z], [0, 0, 0], SCENE_SCALE_AU);
      this.trailPositions[k * 3] = scenePos[0];
      this.trailPositions[k * 3 + 1] = scenePos[1];
      this.trailPositions[k * 3 + 2] = scenePos[2];

      // Semi-major axis color gradient: 1.0 AU (blue) -> 2.7 AU (gold)
      const r = Math.sqrt(earth.x * earth.x + earth.y * earth.y);
      const frac = Math.max(0, Math.min(1, (r - 1.0) / (TARGET_ORBIT_AU - 1.0)));

      // Fade trail opacity / brightness toward the tail
      const tailFade = 0.3 + 0.7 * (k / (numPoints - 1));

      if (frac < 0.5) {
        const t = frac * 2.0;
        color.setRGB((0.1 + t * 0.0) * tailFade, (0.4 + t * 0.5) * tailFade, (1.0 - t * 0.4) * tailFade);
      } else {
        const t = (frac - 0.5) * 2.0;
        color.setRGB((0.1 + t * 0.9) * tailFade, (0.9 - t * 0.1) * tailFade, (0.6 - t * 0.5) * tailFade);
      }

      this.trailColors[k * 3] = color.r;
      this.trailColors[k * 3 + 1] = color.g;
      this.trailColors[k * 3 + 2] = color.b;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.trailGeometry.setDrawRange(0, numPoints);
  }

  private getOrCreateBodyMesh(name: string): THREE.Object3D {
    let mesh = this.bodyMeshes.get(name);
    if (mesh) return mesh;

    let geometry: THREE.BufferGeometry;

    if (name === 'Sun') {
      const sunGroup = new THREE.Group();

      // 1. Core Solar Plasma Surface (exact 3D FBM + active magnetic regions from reference repo)
      geometry = new THREE.SphereGeometry(1.0, 64, 64);
      this.sunPlasmaMaterial = createSunPlasmaMaterial();
      this.sunCoreMesh = new THREE.Mesh(geometry, this.sunPlasmaMaterial);
      this.sunCoreMesh.name = 'sunCore';
      this.sunCoreMesh.renderOrder = 1;
      sunGroup.add(this.sunCoreMesh);

      // 2. Hot Inner Energy Shell (radius 4.48 / 5.45 = 0.822)
      const hotCoreGeo = new THREE.SphereGeometry(0.822, 48, 48);
      const hotCoreMat = createSunHotCoreMaterial();
      this.sunHotCoreMesh = new THREE.Mesh(hotCoreGeo, hotCoreMat);
      this.sunHotCoreMesh.name = 'sunHotCore';
      sunGroup.add(this.sunHotCoreMesh);

      // 3. Outer Plasma Shell (radius 4.72 / 5.45 = 0.866)
      const outerGeo = new THREE.SphereGeometry(0.866, 32, 32);
      const outerMat = createSunOuterPlasmaMaterial();
      this.sunOuterMesh = new THREE.Mesh(outerGeo, outerMat);
      this.sunOuterMesh.name = 'sunOuter';
      sunGroup.add(this.sunOuterMesh);

      // 4. Dynamic Turbulent Corona (radius 6.05 / 5.45 = 1.110)
      const coronaGeo = new THREE.SphereGeometry(1.110, 64, 64);
      this.sunCoronaMaterial = createSunCoronaMaterial();
      const coronaMesh = new THREE.Mesh(coronaGeo, this.sunCoronaMaterial);
      coronaMesh.name = 'sunCorona';
      sunGroup.add(coronaMesh);

      // 5. Soft Outer Corona Glow (radius 6.35 / 5.45 = 1.165)
      const coronaGlowGeo = new THREE.SphereGeometry(1.165, 48, 48);
      this.sunCoronaGlowMaterial = createSunCoronaGlowMaterial();
      const coronaGlowMesh = new THREE.Mesh(coronaGlowGeo, this.sunCoronaGlowMaterial);
      coronaGlowMesh.name = 'sunCoronaGlow';
      sunGroup.add(coronaGlowMesh);

      mesh = sunGroup;
    } else if (name === 'Mercury') {
      geometry = new THREE.SphereGeometry(0.22, 48, 48);
      const tex = loadTexture('/textures/mercury.jpeg');
      const material = new THREE.MeshStandardMaterial({
        ...(tex ? { map: tex } : {}),
        color: tex ? 0xffffff : 0x94a3b8,
        roughness: 0.90,
        metalness: 0.05
      });
      material.transparent = false;
      material.depthTest = true;
      material.depthWrite = true;
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Venus') {
      geometry = new THREE.SphereGeometry(0.34, 48, 48);
      const tex = loadTexture('/textures/venus.jpeg');
      const material = new THREE.MeshStandardMaterial({
        ...(tex ? { map: tex } : {}),
        color: tex ? 0xffffff : 0xfde047,
        roughness: 0.82,
        metalness: 0.0
      });
      material.transparent = false;
      material.depthTest = true;
      material.depthWrite = true;
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Earth') {
      geometry = new THREE.SphereGeometry(0.38, 64, 64);
      const tex = loadTexture('/textures/earth.jpg');
      const material = new THREE.MeshStandardMaterial({
        ...(tex ? { map: tex } : {}),
        color: tex ? 0xffffff : 0x1d4ed8,
        roughness: 0.85,
        metalness: 0.05
      });
      material.transparent = false;
      material.depthTest = true;
      material.depthWrite = true;
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Atmospheric Clouds Layer: Lit by Sun on day side, dark on night side!
      const cloudsTex = loadTexture('/textures/earth_clouds.png');
      const cloudsGeo = new THREE.SphereGeometry(0.384, 64, 64);
      const cloudsMat = new THREE.MeshStandardMaterial({
        ...(cloudsTex ? { map: cloudsTex } : {}),
        color: 0xffffff,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        roughness: 0.95,
        metalness: 0.0
      });
      const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
      cloudsMesh.name = 'earthClouds';
      cloudsMesh.castShadow = false;
      cloudsMesh.receiveShadow = true;
      mesh.add(cloudsMesh);

      // Rayleigh Atmospheric Scattering Blue Halo: Only visible on sun-facing limb, dark on night side!
      const atmoGeo = new THREE.SphereGeometry(0.408, 48, 48);
      const atmoMat = new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vWorldPosition;
          void main() {
            vNormal = normalize(mat3(modelMatrix) * normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPosition = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          varying vec3 vWorldPosition;
          void main() {
            vec3 sunDir = normalize(-vWorldPosition);
            vec3 viewDir = normalize(cameraPosition - vWorldPosition);
            float sunDot = dot(vNormal, sunDir);
            float sunFacing = smoothstep(-0.15, 0.35, sunDot);
            float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
            rim = pow(rim, 2.8);
            vec3 atmoColor = vec3(0.35, 0.68, 1.0);
            float alpha = rim * 0.70 * sunFacing;
            gl_FragColor = vec4(atmoColor, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false
      });
      const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
      mesh.add(atmoMesh);
    } else if (name === 'Moon') {
      geometry = new THREE.SphereGeometry(0.11, 48, 48);
      const tex = loadTexture('/textures/moon.jpg');
      const material = new THREE.MeshStandardMaterial({
        ...(tex ? { map: tex } : {}),
        color: tex ? 0xffffff : 0x94a3b8,
        roughness: 0.92,
        metalness: 0.05
      });
      material.transparent = false;
      material.depthTest = true;
      material.depthWrite = true;
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Mars') {
      geometry = new THREE.SphereGeometry(0.28, 48, 48);
      const tex = loadTexture('/textures/mars.jpg');
      const material = new THREE.MeshStandardMaterial({
        ...(tex ? { map: tex } : {}),
        color: tex ? 0xffffff : 0xc2410c,
        roughness: 0.85,
        metalness: 0.05
      });
      material.transparent = false;
      material.depthTest = true;
      material.depthWrite = true;
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Phobos') {
      geometry = new THREE.DodecahedronGeometry(0.038, 1);
      const material = new THREE.MeshStandardMaterial({
        color: 0x78716c,
        roughness: 0.92,
        metalness: 0.05,
        flatShading: true
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Deimos') {
      geometry = new THREE.DodecahedronGeometry(0.026, 1);
      const material = new THREE.MeshStandardMaterial({
        color: 0x8c7e73,
        roughness: 0.90,
        metalness: 0.05,
        flatShading: true
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Jupiter') {
      geometry = new THREE.SphereGeometry(0.78, 64, 64);
      const tex = loadTexture('/textures/jupiter.jpg');
      const material = new THREE.MeshStandardMaterial({
        ...(tex ? { map: tex } : {}),
        color: tex ? 0xffffff : 0xd97706,
        roughness: 0.70,
        metalness: 0.0
      });
      material.transparent = false;
      material.depthTest = true;
      material.depthWrite = true;
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Io') {
      geometry = new THREE.SphereGeometry(0.075, 24, 24);
      const material = new THREE.MeshStandardMaterial({
        color: 0xf59e0b, // Sulfur yellow-orange volcanic crust
        roughness: 0.80,
        metalness: 0.1
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Europa') {
      geometry = new THREE.SphereGeometry(0.068, 24, 24);
      const material = new THREE.MeshStandardMaterial({
        color: 0xf0f9ff, // Smooth brilliant water-ice crust
        roughness: 0.35,
        metalness: 0.05
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Ganymede') {
      geometry = new THREE.SphereGeometry(0.108, 28, 28);
      const material = new THREE.MeshStandardMaterial({
        color: 0x94a3b8, // Dark silicate and grooved ice terrain
        roughness: 0.85,
        metalness: 0.05
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Callisto') {
      geometry = new THREE.SphereGeometry(0.095, 24, 24);
      const material = new THREE.MeshStandardMaterial({
        color: 0x64748b, // Ancient heavily cratered dark ice
        roughness: 0.90,
        metalness: 0.05
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Saturn') {
      const saturnGroup = new THREE.Group();

      const globeGeo = new THREE.SphereGeometry(0.65, 64, 64);
      const saturnTex = loadTexture('/textures/saturn.jpg');
      const globeMat = new THREE.MeshStandardMaterial({
        ...(saturnTex ? { map: saturnTex } : {}),
        color: saturnTex ? 0xffffff : 0xeab308,
        roughness: 0.75,
        metalness: 0.05
      });
      globeMat.transparent = false;
      globeMat.depthTest = true;
      globeMat.depthWrite = true;
      const globeMesh = new THREE.Mesh(globeGeo, globeMat);
      globeMesh.name = 'saturnGlobe';
      globeMesh.castShadow = true;
      globeMesh.receiveShadow = true;
      saturnGroup.add(globeMesh);

      // Photorealistic Saturnian Ring with radial Cassini division & Encke gap
      const ringMesh = createSaturnRingMesh(0.65);
      saturnGroup.add(ringMesh);

      // Saturn authentic axial tilt: 26.73 degrees
      saturnGroup.rotation.z = THREE.MathUtils.degToRad(26.73);

      mesh = saturnGroup;
    } else if (name === 'Enceladus') {
      geometry = new THREE.SphereGeometry(0.042, 20, 20);
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff, // Pure reflective fresh snow/ice (albedo 0.99)
        roughness: 0.20,
        metalness: 0.0
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Tethys') {
      geometry = new THREE.SphereGeometry(0.050, 20, 20);
      const material = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.80,
        metalness: 0.05
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Rhea') {
      geometry = new THREE.SphereGeometry(0.062, 24, 24);
      const material = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.85,
        metalness: 0.05
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Titan') {
      geometry = new THREE.SphereGeometry(0.112, 28, 28);
      const material = new THREE.MeshStandardMaterial({
        color: 0xf59e0b, // Dense amber-orange photochemical nitrogen haze
        roughness: 0.70,
        metalness: 0.0
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else if (name === 'Uranus') {
      const uranusGroup = new THREE.Group();
      const globeGeo = new THREE.SphereGeometry(0.50, 48, 48);
      const uranusTex = loadTexture('/textures/uranus.jpg', createUranusTexture());
      const globeMat = new THREE.MeshStandardMaterial({
        ...(uranusTex ? { map: uranusTex } : { color: 0x6ee7b7 }),
        roughness: 0.40,
        metalness: 0.05
      });
      const globeMesh = new THREE.Mesh(globeGeo, globeMat);
      globeMesh.name = 'uranusGlobe';
      uranusGroup.add(globeMesh);

      // Uranus faint, vertical rings (extreme axial tilt: 97.77 deg relative to ecliptic)
      const ringGeo = new THREE.RingGeometry(0.72, 1.05, 48);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        roughness: 0.7,
        depthWrite: false
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2 + THREE.MathUtils.degToRad(97.77);
      uranusGroup.add(ringMesh);

      mesh = uranusGroup;
    } else if (name === 'Titania') {
      geometry = new THREE.SphereGeometry(0.065, 20, 20);
      const material = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.85, metalness: 0.05 });
      mesh = new THREE.Mesh(geometry, material);
    } else if (name === 'Oberon') {
      geometry = new THREE.SphereGeometry(0.060, 20, 20);
      const material = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.90, metalness: 0.05 });
      mesh = new THREE.Mesh(geometry, material);
    } else if (name === 'Neptune') {
      const neptuneGroup = new THREE.Group();
      const globeGeo = new THREE.SphereGeometry(0.48, 48, 48);
      const neptuneTex = loadTexture('/textures/neptune.jpg', createNeptuneTexture());
      const globeMat = new THREE.MeshStandardMaterial({
        ...(neptuneTex ? { map: neptuneTex } : { color: 0x2563eb }),
        roughness: 0.35,
        metalness: 0.05
      });
      const globeMesh = new THREE.Mesh(globeGeo, globeMat);
      globeMesh.name = 'neptuneGlobe';
      neptuneGroup.add(globeMesh);

      // Neptune delicate azure ring system (tilt 28.32 deg)
      const ringGeo = new THREE.RingGeometry(0.68, 0.92, 48);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        roughness: 0.7,
        depthWrite: false
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2 + THREE.MathUtils.degToRad(28.32);
      neptuneGroup.add(ringMesh);

      mesh = neptuneGroup;
    } else if (name === 'Triton') {
      geometry = new THREE.SphereGeometry(0.078, 24, 24);
      const material = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.50, metalness: 0.1 });
      mesh = new THREE.Mesh(geometry, material);
    } else {
      geometry = new THREE.SphereGeometry(0.2, 16, 16);
      const material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, emissive: new THREE.Color(0x111111) });
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    if (mesh) {
      mesh.renderOrder = 1;
    }

    this.scene.add(mesh);
    this.bodyMeshes.set(name, mesh);
    return mesh;
  }

  public updateBodies(frame: SimulationFrame, time_s: number): void {
    // 1. Update celestial bodies present in replay frame (Tug is handled by composite tugGroup)
    for (const [name, data] of Object.entries(frame.bodies)) {
      if (name === 'Tug') continue; // Handled by rich composite tugGroup with thrusters!
      const mesh = this.getOrCreateBodyMesh(name);
      const scenePos = eclipticToScene([data.x, data.y, data.z], [0, 0, 0], SCENE_SCALE_AU);
      mesh.position.set(scenePos[0], scenePos[1], scenePos[2]);
      if (name === 'Earth') {
        // Set the daily phase from replay time so pause and seeking are deterministic.
        // Earth turns exactly once per 24 simulated hours (86,400 s)
        const dayPhase_s = ((time_s % EARTH_ROTATION_PERIOD_SECONDS) + EARTH_ROTATION_PERIOD_SECONDS)
          % EARTH_ROTATION_PERIOD_SECONDS;
        mesh.rotation.y = (dayPhase_s / EARTH_ROTATION_PERIOD_SECONDS) * 2 * Math.PI;

        const clouds = mesh.getObjectByName('earthClouds');
        if (clouds) {
          clouds.rotation.y = ((dayPhase_s * 1.04) / EARTH_ROTATION_PERIOD_SECONDS) * 2 * Math.PI;
        }
      }
    }

    // 2. Ensure ALL standard Solar System planets are ALWAYS visible and in orbit:
    const planets: Record<string, { r: number; periodYr: number }> = {
      Mercury: { r: MERCURY_ORBIT_AU, periodYr: MERCURY_PERIOD_YR },
      Venus: { r: VENUS_ORBIT_AU, periodYr: VENUS_PERIOD_YR },
      Mars: { r: MARS_ORBIT_AU, periodYr: MARS_PERIOD_YR },
      Jupiter: { r: JUPITER_ORBIT_AU, periodYr: JUPITER_PERIOD_YR },
      Saturn: { r: SATURN_ORBIT_AU, periodYr: SATURN_PERIOD_YR },
      Uranus: { r: URANUS_ORBIT_AU, periodYr: URANUS_PERIOD_YR },
      Neptune: { r: NEPTUNE_ORBIT_AU, periodYr: NEPTUNE_PERIOD_YR }
    };

    for (const [pName, pConfig] of Object.entries(planets)) {
      if (!frame.bodies[pName]) {
        const mesh = this.getOrCreateBodyMesh(pName);
        const theta = (2.0 * Math.PI * time_s) / (pConfig.periodYr * YEAR_SECONDS);
        const scenePos = eclipticToScene(
          [pConfig.r * Math.cos(theta), pConfig.r * Math.sin(theta), 0],
          [0, 0, 0],
          SCENE_SCALE_AU
        );
        mesh.position.set(scenePos[0], scenePos[1], scenePos[2]);
      }
    }

    // 3. Realistic, deterministic axial self-spin for ALL planets based on simulation time
    const rotationPeriods: Record<string, number> = {
      Mercury: MERCURY_ROTATION_PERIOD_SECONDS,
      Venus: VENUS_ROTATION_PERIOD_SECONDS, // negative = retrograde
      Mars: MARS_ROTATION_PERIOD_SECONDS,
      Jupiter: JUPITER_ROTATION_PERIOD_SECONDS,
      Saturn: SATURN_ROTATION_PERIOD_SECONDS,
      Uranus: URANUS_ROTATION_PERIOD_SECONDS,
      Neptune: NEPTUNE_ROTATION_PERIOD_SECONDS,
      Sun: SUN_ROTATION_PERIOD_SECONDS,
      Moon: MOON_ROTATION_PERIOD_SECONDS
    };

    for (const [pName, period_s] of Object.entries(rotationPeriods)) {
      const bodyMesh = this.bodyMeshes.get(pName);
      if (!bodyMesh) continue;
      const absPeriod = Math.abs(period_s);
      const phase = ((time_s % absPeriod) + absPeriod) % absPeriod;
      const angle = (phase / absPeriod) * 2 * Math.PI;
      const signedAngle = period_s >= 0 ? angle : -angle;

      if (pName === 'Saturn') {
        const globe = bodyMesh.getObjectByName('saturnGlobe');
        if (globe) globe.rotation.y = signedAngle;
      } else if (pName === 'Uranus') {
        const globe = bodyMesh.getObjectByName('uranusGlobe');
        if (globe) globe.rotation.y = signedAngle;
      } else if (pName === 'Neptune') {
        const globe = bodyMesh.getObjectByName('neptuneGlobe');
        if (globe) globe.rotation.y = signedAngle;
      } else if (pName === 'Sun') {
        const core = bodyMesh.getObjectByName('sunCore');
        if (core) core.rotation.y = signedAngle;
        else bodyMesh.rotation.y = signedAngle;
      } else {
        bodyMesh.rotation.y = signedAngle;
      }
    }

    // 4. Update Moons for Earth, Mars, Jupiter, and Saturn
    const earthData = frame.bodies['Earth'];
    if (earthData) {
      const earthScene = eclipticToScene([earthData.x, earthData.y, earthData.z], [0, 0, 0], SCENE_SCALE_AU);
      if (!frame.bodies['Moon']) {
        const moonMesh = this.getOrCreateBodyMesh('Moon');
        const lunarAngle = (2.0 * Math.PI * time_s) / MOON_ROTATION_PERIOD_SECONDS;
        const lunarDist = 0.92;
        moonMesh.position.set(
          earthScene[0] + lunarDist * Math.cos(lunarAngle),
          earthScene[1] + lunarDist * 0.089 * Math.sin(lunarAngle),
          earthScene[2] + lunarDist * Math.sin(lunarAngle)
        );
      }
    }

    // Martian Moons: Phobos & Deimos
    const marsMesh = this.bodyMeshes.get('Mars');
    if (marsMesh) {
      const phobosMesh = this.getOrCreateBodyMesh('Phobos');
      const phobosAngle = (2.0 * Math.PI * time_s) / PHOBOS_ORBIT_PERIOD_SECONDS;
      phobosMesh.position.set(
        marsMesh.position.x + 0.45 * Math.cos(phobosAngle),
        marsMesh.position.y + 0.45 * 0.08 * Math.sin(phobosAngle),
        marsMesh.position.z + 0.45 * Math.sin(phobosAngle)
      );
      phobosMesh.rotation.y = phobosAngle;

      const deimosMesh = this.getOrCreateBodyMesh('Deimos');
      const deimosAngle = (2.0 * Math.PI * time_s) / DEIMOS_ORBIT_PERIOD_SECONDS;
      deimosMesh.position.set(
        marsMesh.position.x + 0.72 * Math.cos(deimosAngle),
        marsMesh.position.y + 0.72 * 0.05 * Math.sin(deimosAngle),
        marsMesh.position.z + 0.72 * Math.sin(deimosAngle)
      );
      deimosMesh.rotation.y = deimosAngle;
    }

    // Jovian Galilean Moons: Io, Europa, Ganymede, Callisto
    const jupMesh = this.bodyMeshes.get('Jupiter');
    if (jupMesh) {
      const ioMesh = this.getOrCreateBodyMesh('Io');
      const ioAngle = (2.0 * Math.PI * time_s) / IO_ORBIT_PERIOD_SECONDS;
      ioMesh.position.set(
        jupMesh.position.x + 1.15 * Math.cos(ioAngle),
        jupMesh.position.y + 1.15 * 0.04 * Math.sin(ioAngle),
        jupMesh.position.z + 1.15 * Math.sin(ioAngle)
      );
      ioMesh.rotation.y = ioAngle;

      const europaMesh = this.getOrCreateBodyMesh('Europa');
      const europaAngle = (2.0 * Math.PI * time_s) / EUROPA_ORBIT_PERIOD_SECONDS;
      europaMesh.position.set(
        jupMesh.position.x + 1.48 * Math.cos(europaAngle),
        jupMesh.position.y + 1.48 * 0.04 * Math.sin(europaAngle),
        jupMesh.position.z + 1.48 * Math.sin(europaAngle)
      );
      europaMesh.rotation.y = europaAngle;

      const ganymedeMesh = this.getOrCreateBodyMesh('Ganymede');
      const ganymedeAngle = (2.0 * Math.PI * time_s) / GANYMEDE_ORBIT_PERIOD_SECONDS;
      ganymedeMesh.position.set(
        jupMesh.position.x + 1.92 * Math.cos(ganymedeAngle),
        jupMesh.position.y + 1.92 * 0.03 * Math.sin(ganymedeAngle),
        jupMesh.position.z + 1.92 * Math.sin(ganymedeAngle)
      );
      ganymedeMesh.rotation.y = ganymedeAngle;

      const callistoMesh = this.getOrCreateBodyMesh('Callisto');
      const callistoAngle = (2.0 * Math.PI * time_s) / CALLISTO_ORBIT_PERIOD_SECONDS;
      callistoMesh.position.set(
        jupMesh.position.x + 2.45 * Math.cos(callistoAngle),
        jupMesh.position.y + 2.45 * 0.03 * Math.sin(callistoAngle),
        jupMesh.position.z + 2.45 * Math.sin(callistoAngle)
      );
      callistoMesh.rotation.y = callistoAngle;
    }

    // Saturnian Major Moons: Enceladus, Tethys, Rhea, Titan
    const satMesh = this.bodyMeshes.get('Saturn');
    if (satMesh) {
      const enceladusMesh = this.getOrCreateBodyMesh('Enceladus');
      const encAngle = (2.0 * Math.PI * time_s) / ENCELADUS_ORBIT_PERIOD_SECONDS;
      enceladusMesh.position.set(
        satMesh.position.x + 1.28 * Math.cos(encAngle),
        satMesh.position.y + 1.28 * 0.05 * Math.sin(encAngle),
        satMesh.position.z + 1.28 * Math.sin(encAngle)
      );
      enceladusMesh.rotation.y = encAngle;

      const tethysMesh = this.getOrCreateBodyMesh('Tethys');
      const tethysAngle = (2.0 * Math.PI * time_s) / TETHYS_ORBIT_PERIOD_SECONDS;
      tethysMesh.position.set(
        satMesh.position.x + 1.55 * Math.cos(tethysAngle),
        satMesh.position.y + 1.55 * 0.04 * Math.sin(tethysAngle),
        satMesh.position.z + 1.55 * Math.sin(tethysAngle)
      );
      tethysMesh.rotation.y = tethysAngle;

      const rheaMesh = this.getOrCreateBodyMesh('Rhea');
      const rheaAngle = (2.0 * Math.PI * time_s) / RHEA_ORBIT_PERIOD_SECONDS;
      rheaMesh.position.set(
        satMesh.position.x + 1.86 * Math.cos(rheaAngle),
        satMesh.position.y + 1.86 * 0.04 * Math.sin(rheaAngle),
        satMesh.position.z + 1.86 * Math.sin(rheaAngle)
      );
      rheaMesh.rotation.y = rheaAngle;

      const titanMesh = this.getOrCreateBodyMesh('Titan');
      const titanAngle = (2.0 * Math.PI * time_s) / TITAN_ORBIT_PERIOD_SECONDS;
      titanMesh.position.set(
        satMesh.position.x + 2.45 * Math.cos(titanAngle),
        satMesh.position.y + 2.45 * 0.03 * Math.sin(titanAngle),
        satMesh.position.z + 2.45 * Math.sin(titanAngle)
      );
      titanMesh.rotation.y = titanAngle;
    }

    // Uranian Major Moons: Titania & Oberon
    const uranMesh = this.bodyMeshes.get('Uranus');
    if (uranMesh) {
      const titaniaMesh = this.getOrCreateBodyMesh('Titania');
      const titaniaAngle = (2.0 * Math.PI * time_s) / TITANIA_ORBIT_PERIOD_SECONDS;
      titaniaMesh.position.set(
        uranMesh.position.x + 0.75 * Math.cos(titaniaAngle),
        uranMesh.position.y + 0.75 * 0.98 * Math.sin(titaniaAngle),
        uranMesh.position.z + 0.75 * 0.20 * Math.sin(titaniaAngle)
      );
      titaniaMesh.rotation.y = titaniaAngle;

      const oberonMesh = this.getOrCreateBodyMesh('Oberon');
      const oberonAngle = (2.0 * Math.PI * time_s) / OBERON_ORBIT_PERIOD_SECONDS;
      oberonMesh.position.set(
        uranMesh.position.x + 1.10 * Math.cos(oberonAngle),
        uranMesh.position.y + 1.10 * 0.98 * Math.sin(oberonAngle),
        uranMesh.position.z + 1.10 * 0.20 * Math.sin(oberonAngle)
      );
      oberonMesh.rotation.y = oberonAngle;
    }

    // Neptunian Moon: Triton (Retrograde Orbit)
    const nepMesh = this.bodyMeshes.get('Neptune');
    if (nepMesh) {
      const tritonMesh = this.getOrCreateBodyMesh('Triton');
      const tritonAngle = (2.0 * Math.PI * time_s) / TRITON_ORBIT_PERIOD_SECONDS;
      tritonMesh.position.set(
        nepMesh.position.x + 0.85 * Math.cos(tritonAngle),
        nepMesh.position.y + 0.85 * 0.28 * Math.sin(tritonAngle),
        nepMesh.position.z + 0.85 * Math.sin(tritonAngle)
      );
      tritonMesh.rotation.y = tritonAngle;
    }

    // 5. Position and Orient Ceres Tug and Relativistic Thrusters
    if (earthData) {
      const earthScene = eclipticToScene([earthData.x, earthData.y, earthData.z], [0, 0, 0], SCENE_SCALE_AU);
      this.currentEarthPos.set(earthScene[0], earthScene[1], earthScene[2]);

      // Calculate forward prograde pulling direction
      let dir = new THREE.Vector3();
      const tugData = frame.bodies['Tug'];
      if (tugData) {
        const tugRaw = eclipticToScene([tugData.x, tugData.y, tugData.z], [0, 0, 0], SCENE_SCALE_AU);
        dir.set(tugRaw[0] - earthScene[0], tugRaw[1] - earthScene[1], tugRaw[2] - earthScene[2]);
      }
      if (dir.lengthSq() < 1e-6) {
        // Fallback to velocity unit vector in scene coordinates
        const vScene = eclipticToScene([earthData.vx, earthData.vy, earthData.vz], [0, 0, 0], 1.0);
        dir.set(vScene[0], vScene[1], vScene[2]);
      }
      dir.normalize();

      // Visual standoff distance: 1.4 scene units ahead of Earth center
      const visualStandoff = 1.4;
      const tugVisualPos = this.currentEarthPos.clone().addScaledVector(dir, visualStandoff);

      if (this.tugGroup) {
        this.tugGroup.position.copy(tugVisualPos);
        this.tugGroup.lookAt(tugVisualPos.clone().sub(dir));
      }

      // Update Gravitational Towline (Earth center to Tug center)
      if (this.towlineGeometry) {
        const posAttr = this.towlineGeometry.getAttribute('position') as THREE.BufferAttribute;
        this.towlinePositions[0] = this.currentEarthPos.x;
        this.towlinePositions[1] = this.currentEarthPos.y;
        this.towlinePositions[2] = this.currentEarthPos.z;
        this.towlinePositions[3] = tugVisualPos.x;
        this.towlinePositions[4] = tugVisualPos.y;
        this.towlinePositions[5] = tugVisualPos.z;
        posAttr.needsUpdate = true;
      }

      // Check thrust telemetry
      const thrust_n = frame.tug_telemetry?.thrust_n ?? 0;
      this.isThrustingActive = thrust_n > 1.0e10;

      // Update Thruster Exhaust Plumes (canted ±5° out-of-ecliptic)
      if (this.tugThrusterPlume1 && this.tugThrusterPlume2) {
        this.tugThrusterPlume1.visible = this.isThrustingActive;
        this.tugThrusterPlume2.visible = this.isThrustingActive;
      }
      if (this.tugExtendedPlume1 && this.tugExtendedPlume2) {
        this.tugExtendedPlume1.visible = this.isThrustingActive;
        this.tugExtendedPlume2.visible = this.isThrustingActive;
      }
      if (this.plumeClearanceEnvelope) {
        this.plumeClearanceEnvelope.visible = this.isThrustingActive;
      }

      // Update Quarry Asteroid physical size shrinkage as mass is drilled and flash-vaporized
      const fuel_spent_kg = frame.tug_telemetry?.propellant_spent_kg ?? 0.0;
      // Total reference quarry mass = 9.4e20 kg. Expelling 7.51e20 kg over 9,500 yr.
      const minedFraction = Math.min(0.85, Math.max(0.0, fuel_spent_kg / 9.4e20));
      const volRemaining = Math.max(0.15, 1.0 - minedFraction);
      const quarryRadiusScale = Math.pow(volRemaining, 1.0 / 3.0);
      if (this.quarryAsteroidMesh) {
        this.quarryAsteroidMesh.scale.set(quarryRadiusScale, quarryRadiusScale, quarryRadiusScale);
      }

      // Update Mining Laser and Particle visibility based on thruster state
      if (this.miningLaserBeam && this.miningLaserGlow) {
        this.miningLaserBeam.visible = this.isThrustingActive;
        this.miningLaserGlow.visible = this.isThrustingActive;
      }
      if (this.plasmaParticles) {
        this.plasmaParticles.visible = this.isThrustingActive;
      }

      // Update Towline appearance
      if (this.tugTowline) {
        const mat = this.tugTowline.material as THREE.LineBasicMaterial;
        mat.opacity = this.isThrustingActive ? 0.9 : 0.35;
        mat.color.setHex(this.isThrustingActive ? 0x00f0ff : 0x5588aa);
      }
    }

    // 6. Update Dual-Lagrange Hexagonal Heating Swarms (L1 Day + Giant L2 Night) & Bypass Solar Rays
    if (this.mirrorGroup && this.mirrorSunbeam && this.l2SwarmGroup) {
      const sunToEarth = this.currentEarthPos.clone();
      const distEarth = sunToEarth.length();
      if (distEarth > 0.1) {
        const sunDir = sunToEarth.clone().normalize();
        const earthData = frame.bodies['Earth'];
        const r_au = earthData ? Math.sqrt(earthData.x * earthData.x + earthData.y * earthData.y) : 1.0;

        // Hill sphere standoff distance scaling with r_au:
        // Set standoff d_L to 1.25 scene units, giving generous clearance beyond Earth (R=0.38)
        const d_l = Math.max(1.10, Math.min(1.50, 1.25 * Math.pow(r_au, 1.0 / 3.0)));

        // Fixed Orthonormal Basis:
        // - sceneUp is strictly locked to (0, 1, 0) [ecliptic normal]
        // - lateralAxis is in the ecliptic plane perpendicular to sunDir
        // - orthogonalUp is in the plane of the mirror strictly parallel to (0, 1, 0)
        // This mathematically eliminates any roll or rotation on the lens's own normal axis!
        const sceneUp = new THREE.Vector3(0, 1, 0);
        let lateralAxis = new THREE.Vector3().crossVectors(sceneUp, sunDir).normalize();
        if (lateralAxis.lengthSq() < 0.01) {
          lateralAxis = new THREE.Vector3(1, 0, 0);
        }
        const orthogonalUp = new THREE.Vector3().crossVectors(sunDir, lateralAxis).normalize();

        // A. L1 Day Concentrator Swarm Position & Fixed Basis (Sunward of Earth)
        this.currentL1Pos.copy(this.currentEarthPos).addScaledVector(sunDir, -d_l);
        this.mirrorGroup.position.copy(this.currentL1Pos);
        const rotMatL1 = new THREE.Matrix4().makeBasis(lateralAxis, orthogonalUp, sunDir);
        this.mirrorGroup.setRotationFromMatrix(rotMatL1);

        const boostFraction = Math.max(0.15, Math.min(1.0, (r_au - 1.0) / 1.70));
        const beamMat = this.mirrorSunbeam.material as THREE.MeshBasicMaterial;
        beamMat.opacity = 0.28 + 0.35 * boostFraction;

        if (this.l1NorthPolarBeam) {
          (this.l1NorthPolarBeam.material as THREE.MeshBasicMaterial).opacity = 0.32 + 0.35 * boostFraction;
        }
        if (this.l1SouthPolarBeam) {
          (this.l1SouthPolarBeam.material as THREE.MeshBasicMaterial).opacity = 0.32 + 0.35 * boostFraction;
        }
        if (this.l1RayLines) {
          (this.l1RayLines.material as THREE.LineBasicMaterial).opacity = 0.55 + 0.35 * boostFraction;
        }

        // Dynamically compute Z-scaling so rays and beams always touch Earth's surface exactly
        this.currentBeamZScale = (d_l - 0.38) / 0.87;
        this.currentBypassScale = d_l / 1.25;

        // Position caustics flush with Earth's surface
        if (this.l1SubsolarCaustic) {
          this.l1SubsolarCaustic.position.set(0, 0, d_l - 0.375);
        }
        if (this.l1NorthCaustic) {
          this.l1NorthCaustic.position.set(0, 0.36, d_l - 0.08);
        }
        if (this.l1SouthCaustic) {
          this.l1SouthCaustic.position.set(0, -0.36, d_l - 0.08);
        }

        // B. L2 Giant Night-Side Fixed Hexagonal Concentrator (Anti-sunward at L2)
        // Completely fixed at collinear L2 Lagrange point. No spin, no roll, no rotation on its axis.
        this.currentL2Pos.copy(this.currentEarthPos).addScaledVector(sunDir, d_l);
        this.l2SwarmGroup.position.copy(this.currentL2Pos);
        const rotMatL2 = new THREE.Matrix4().makeBasis(lateralAxis.clone().negate(), orthogonalUp, sunDir.clone().negate());
        this.l2SwarmGroup.setRotationFromMatrix(rotMatL2);

        if (this.l2ReverseEarthshineBeam) {
          const l2Mat = this.l2ReverseEarthshineBeam.material as THREE.MeshBasicMaterial;
          l2Mat.opacity = 0.28 + 0.35 * boostFraction;
        }
        if (this.l2RayLines) {
          (this.l2RayLines.material as THREE.LineBasicMaterial).opacity = 0.55 + 0.35 * boostFraction;
        }
        if (this.l2NightCaustic) {
          this.l2NightCaustic.position.set(0, 0, d_l - 0.375);
        }

        // C. Bypass Solar Transfer Corridor (Rays flowing from L1 past Earth to Giant L2 Mirror)
        if (this.bypassBeamsGroup) {
          this.bypassBeamsGroup.position.copy(this.currentEarthPos);
          this.bypassBeamsGroup.setRotationFromMatrix(rotMatL1);
          if (this.bypassSheath) {
            (this.bypassSheath.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.16 * boostFraction;
          }
          if (this.bypassRayLines) {
            (this.bypassRayLines.material as THREE.LineBasicMaterial).opacity = 0.55 + 0.35 * boostFraction;
          }
        }
      }
    }

    // 7. Camera Target Tracking for focused celestial bodies
    if (this.cameraFocus && this.cameraFocus !== 'system') {
      let targetPos: THREE.Vector3 | null = null;
      if (this.cameraFocus === 'earth_tug' || this.cameraFocus === 'Earth') {
        targetPos = this.currentEarthPos;
      } else if (this.cameraFocus === 'Tug') {
        targetPos = this.tugGroup ? this.tugGroup.position : this.currentEarthPos;
      } else if (this.cameraFocus === 'L1_Mirror' || this.cameraFocus === 'L1_Swarm' || this.cameraFocus === 'mirror') {
        targetPos = this.currentL1Pos;
      } else if (this.cameraFocus === 'L2_Swarm') {
        targetPos = this.currentL2Pos;
      } else {
        const mesh = this.bodyMeshes.get(this.cameraFocus);
        if (mesh) targetPos = mesh.position;
      }

      if (targetPos && this.controls) {
        if (this.cameraFocus === 'L2_Swarm') {
          // Stable synodic camera framing: tracks L2 from a stationary perspective relative to Sun-Earth axis
          const sunToEarth = this.currentEarthPos.clone();
          const sunDir = sunToEarth.length() > 0.1 ? sunToEarth.normalize() : new THREE.Vector3(1, 0, 0);
          const sceneUp = new THREE.Vector3(0, 1, 0);
          let lateralAxis = new THREE.Vector3().crossVectors(sceneUp, sunDir).normalize();
          if (lateralAxis.lengthSq() < 0.01) lateralAxis = new THREE.Vector3(1, 0, 0);

          this.controls.target.copy(targetPos);
          const camOffset = sunDir.clone().multiplyScalar(1.9)
            .addScaledVector(sceneUp, 0.95)
            .addScaledVector(lateralAxis, 1.4);
          this.camera.position.copy(targetPos).add(camOffset);
        } else {
          const offset = this.camera.position.clone().sub(this.controls.target);
          this.controls.target.copy(targetPos);
          this.camera.position.copy(targetPos).add(offset);
        }
      }
    }

    // 7. Update the traversed trajectory trail up to current time_s
    this.updateTraversedTrail(time_s);
  }

  public setOrbitsVisible(visible: boolean): void {
    if (this.orbitsGroup) {
      this.orbitsGroup.visible = visible;
    }
  }

  public toggleOrbits(): boolean {
    if (this.orbitsGroup) {
      this.orbitsGroup.visible = !this.orbitsGroup.visible;
      return this.orbitsGroup.visible;
    }
    return true;
  }

  public areOrbitsVisible(): boolean {
    return this.orbitsGroup ? this.orbitsGroup.visible : true;
  }

  public setCameraFocus(mode: string): void {
    this.cameraFocus = mode;

    if (mode === 'system') {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, 72, 72);
    } else if (mode === 'Tug') {
      const tugPos = this.tugGroup ? this.tugGroup.position : this.currentEarthPos;
      this.controls.target.copy(tugPos);
      this.camera.position.set(
        tugPos.x + 1.2,
        tugPos.y + 0.7,
        tugPos.z + 1.4
      );
    } else if (mode === 'L1_Mirror' || mode === 'L1_Swarm' || mode === 'mirror') {
      const targetPos = this.currentL1Pos;
      this.controls.target.copy(targetPos);
      this.camera.position.set(
        targetPos.x + 1.2,
        targetPos.y + 0.7,
        targetPos.z + 1.4
      );
    } else if (mode === 'L2_Swarm') {
      const targetPos = this.currentL2Pos;
      this.controls.target.copy(targetPos);
      const sunToEarth = this.currentEarthPos.clone();
      const sunDir = sunToEarth.length() > 0.1 ? sunToEarth.normalize() : new THREE.Vector3(1, 0, 0);
      const sceneUp = new THREE.Vector3(0, 1, 0);
      let lateralAxis = new THREE.Vector3().crossVectors(sceneUp, sunDir).normalize();
      if (lateralAxis.lengthSq() < 0.01) lateralAxis = new THREE.Vector3(1, 0, 0);
      const camOffset = sunDir.clone().multiplyScalar(1.9)
        .addScaledVector(sceneUp, 0.95)
        .addScaledVector(lateralAxis, 1.4);
      this.camera.position.copy(targetPos).add(camOffset);
    } else if (mode === 'earth_tug') {
      this.controls.target.copy(this.currentEarthPos);
      this.camera.position.set(
        this.currentEarthPos.x + 3.0,
        this.currentEarthPos.y + 2.2,
        this.currentEarthPos.z + 3.8
      );
    } else if (mode === 'AsteroidBelt') {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(22, 14, 22);
    } else {
      let targetPos: THREE.Vector3 | null = null;
      if (mode === 'Earth') {
        targetPos = this.currentEarthPos;
      } else {
        const mesh = this.bodyMeshes.get(mode);
        if (mesh) targetPos = mesh.position.clone();
      }

      if (targetPos) {
        this.controls.target.copy(targetPos);
        const distMap: Record<string, number> = {
          Sun: 4.5,
          Mercury: 1.2,
          Venus: 1.5,
          Earth: 2.2,
          Tug: 1.2,
          Mars: 1.5,
          Jupiter: 3.5,
          Saturn: 3.8,
          Uranus: 3.2,
          Titania: 0.50,
          Oberon: 0.50,
          Neptune: 3.2,
          Triton: 0.50,
          Moon: 0.6,
          Phobos: 0.3,
          Deimos: 0.25,
          Io: 0.45,
          Europa: 0.45,
          Ganymede: 0.55,
          Callisto: 0.55,
          Titan: 0.55,
          Enceladus: 0.35,
          Tethys: 0.40,
          Rhea: 0.45
        };
        const dist = distMap[mode] ?? 2.0;

        if (mode === 'Sun') {
          this.camera.position.set(0, dist * 0.5, dist);
        } else {
          // Calculate unit vector toward the Sun in the ecliptic X-Z plane
          const toSun = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), targetPos);
          toSun.y = 0;
          if (toSun.lengthSq() < 1e-4) {
            toSun.set(1, 0, 0);
          } else {
            toSun.normalize();
          }

          // Perpendicular tangent vector in ecliptic plane
          const tangent = new THREE.Vector3(-toSun.z, 0, toSun.x).normalize();

          // 45-degree elevated terminator angle:
          // Reveals both the brightly sunlit day hemisphere and gracefully shaded night hemisphere
          this.camera.position.set(
            targetPos.x + toSun.x * dist * 0.65 + tangent.x * dist * 0.75,
            targetPos.y + dist * 0.38,
            targetPos.z + toSun.z * dist * 0.65 + tangent.z * dist * 0.75
          );
        }
      }
    }
    this.controls.update();

    if (this.onFocusChange) {
      this.onFocusChange(mode, this.getFocusDisplayName(mode));
    }
    if (this.onBodySelected) {
      this.onBodySelected(mode);
    }
  }

  public zoomIn(): void {
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    dir.multiplyScalar(0.75);
    this.camera.position.addVectors(this.controls.target, dir);
    this.controls.update();
  }

  public zoomOut(): void {
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    dir.multiplyScalar(1.33);
    this.camera.position.addVectors(this.controls.target, dir);
    this.controls.update();
  }

  public toggleCameraFocus(): string {
    const next = this.cameraFocus === 'system' ? 'earth_tug' : 'system';
    this.setCameraFocus(next);
    return next;
  }

  public getCameraFocus(): string {
    return this.cameraFocus;
  }

  public getFocusDisplayName(mode: string): string {
    const names: Record<string, string> = {
      system: 'Solar System',
      earth_tug: 'Earth-Tug Complex',
      Tug: 'Ceres Tug & Mining Refinery',
      L1_Mirror: 'L1 Day Concentrator Swarm',
      L1_Swarm: 'L1 Day Concentrator Swarm',
      L2_Swarm: 'L2 Night Concentrator Swarm',
      Sun: 'Sun',
      Mercury: 'Mercury',
      Venus: 'Venus',
      Earth: 'Earth',
      Moon: 'Moon',
      Mars: 'Mars',
      Phobos: 'Phobos',
      Deimos: 'Deimos',
      AsteroidBelt: 'Asteroid Belt',
      Jupiter: 'Jupiter',
      Io: 'Io',
      Europa: 'Europa',
      Ganymede: 'Ganymede',
      Callisto: 'Callisto',
      Saturn: 'Saturn',
      Titan: 'Titan',
      Enceladus: 'Enceladus',
      Tethys: 'Tethys',
      Rhea: 'Rhea',
      Uranus: 'Uranus',
      Titania: 'Titania',
      Oberon: 'Oberon',
      Neptune: 'Neptune',
      Triton: 'Triton'
    };
    return names[mode] || mode;
  }

  public render(): void {
    this.pulseTime += 0.02;

    // 1. Sun dynamic procedural animation (stable physical radius, smooth plasma convection)
    const t = this.pulseTime;

    if (this.sunPlasmaMaterial) {
      this.sunPlasmaMaterial.uniforms.uTime.value = t;
    }
    if (this.sunCoreMesh) {
      this.sunCoreMesh.scale.setScalar(1.0);
      this.sunCoreMesh.rotation.y += 0.0015;
      this.sunCoreMesh.rotation.x += 0.0002;
    }
    if (this.sunHotCoreMesh) {
      this.sunHotCoreMesh.scale.setScalar(1.0);
      this.sunHotCoreMesh.rotation.y += 0.001;
    }
    if (this.sunOuterMesh) {
      this.sunOuterMesh.scale.setScalar(1.0);
      this.sunOuterMesh.rotation.y -= 0.0008;
    }
    if (this.sunCoronaMaterial) {
      this.sunCoronaMaterial.uniforms.uTime.value = t;
    }
    if (this.sunCoronaGlowMaterial) {
      this.sunCoronaGlowMaterial.uniforms.uIntensity.value = 0.10;
    }

    // 2. Thruster relativistic plasma pulsation & high-velocity particle stream
    if (this.isThrustingActive && this.tugThrusterPlume1 && this.tugThrusterPlume2) {
      const pulse1 = 0.85 + 0.15 * Math.sin(this.pulseTime * 20.0);
      const pulse2 = 0.85 + 0.15 * Math.cos(this.pulseTime * 23.0);
      this.tugThrusterPlume1.scale.set(pulse1, pulse1, pulse1 * (0.95 + 0.1 * Math.sin(this.pulseTime * 30.0)));
      this.tugThrusterPlume2.scale.set(pulse2, pulse2, pulse2 * (0.95 + 0.1 * Math.cos(this.pulseTime * 28.0)));
    }

    // Dynamic Relativistic Exhaust Particle Stream (shooting ions backwards @ 0.3c visual velocity)
    if (this.plasmaParticles && this.plasmaPositions && this.plasmaVelocities && this.plasmaLifetimes && this.plasmaMaxLifetimes) {
      if (this.isThrustingActive) {
        this.plasmaParticles.visible = true;
        const posAttr = this.plasmaParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
        const colAttr = this.plasmaParticles.geometry.getAttribute('color') as THREE.BufferAttribute;
        const visualCantAngleRad = THREE.MathUtils.degToRad(28.0);
        const sinCant = Math.sin(visualCantAngleRad);
        const cosCant = Math.cos(visualCantAngleRad);
        const count = this.PLASMA_PARTICLE_COUNT;
        const dt = 0.016;

        for (let i = 0; i < count; i++) {
          this.plasmaLifetimes[i] += dt;
          if (this.plasmaLifetimes[i] > this.plasmaMaxLifetimes[i]) {
            // Respawn at canted nozzle throat
            this.plasmaLifetimes[i] = 0;
            this.plasmaMaxLifetimes[i] = 0.65 + Math.random() * 0.35;
            const isNorth = i % 2 === 0;
            const nozzleY = isNorth ? 0.09 : -0.09;
            const cantSign = isNorth ? 1.0 : -1.0;
            const speed = 3.6 + Math.random() * 1.0;

            this.plasmaVelocities[i * 3 + 0] = (Math.random() - 0.5) * 0.05;
            this.plasmaVelocities[i * 3 + 1] = cantSign * sinCant * speed + (Math.random() - 0.5) * 0.03;
            this.plasmaVelocities[i * 3 + 2] = cosCant * speed;

            this.plasmaPositions[i * 3 + 0] = (Math.random() - 0.5) * 0.02;
            this.plasmaPositions[i * 3 + 1] = nozzleY + (Math.random() - 0.5) * 0.02;
            this.plasmaPositions[i * 3 + 2] = 0.42;
          } else {
            // Relativistic transport along out-of-ecliptic canted vector
            this.plasmaPositions[i * 3 + 0] += this.plasmaVelocities[i * 3 + 0] * dt;
            this.plasmaPositions[i * 3 + 1] += this.plasmaVelocities[i * 3 + 1] * dt;
            this.plasmaPositions[i * 3 + 2] += this.plasmaVelocities[i * 3 + 2] * dt;

            // ABSOLUTE BIOSPHERE SAFEGUARD: ZERO IMPINGEMENT ON EARTH
            // In the tug's local coordinate frame, Earth center is at (0, 0, 1.40).
            // Earth visual radius is 0.35, atmosphere halo is 0.42.
            // If any particle ever approaches within 0.48 scene units of Earth,
            // strictly deflect it outward along the out-of-ecliptic cant corridor.
            const pX = this.plasmaPositions[i * 3 + 0];
            const pY = this.plasmaPositions[i * 3 + 1];
            const pZ = this.plasmaPositions[i * 3 + 2] - 1.40;
            const distSq = pX * pX + pY * pY + pZ * pZ;
            const safeRadius = 0.48;
            if (distSq < safeRadius * safeRadius) {
              const cantSign = i % 2 === 0 ? 1.0 : -1.0;
              this.plasmaPositions[i * 3 + 1] = cantSign * (safeRadius + 0.10);
            }
          }

          // Exhaust color gradient: Softer subtle electric cyan -> deep blue recombination
          const progress = this.plasmaLifetimes[i] / this.plasmaMaxLifetimes[i];
          if (progress < 0.25) {
            this.plasmaColors[i * 3 + 0] = 0.35;
            this.plasmaColors[i * 3 + 1] = 0.65;
            this.plasmaColors[i * 3 + 2] = 0.85;
          } else if (progress < 0.65) {
            this.plasmaColors[i * 3 + 0] = 0.0;
            this.plasmaColors[i * 3 + 1] = 0.45;
            this.plasmaColors[i * 3 + 2] = 0.70;
          } else {
            this.plasmaColors[i * 3 + 0] = 0.15 * (1.0 - progress);
            this.plasmaColors[i * 3 + 1] = 0.05 * (1.0 - progress);
            this.plasmaColors[i * 3 + 2] = 0.35 * (1.0 - progress);
          }
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      } else {
        this.plasmaParticles.visible = false;
      }
    }

    // 3. Automated Mining Machine Animation (Rotary Core Drills, Laser Ablation & Plasma Conversion Reactor)
    if (this.miningDrillHead1) {
      this.miningDrillHead1.rotation.x += this.isThrustingActive ? 0.24 : 0.04;
    }
    if (this.miningDrillHead2) {
      this.miningDrillHead2.rotation.x -= this.isThrustingActive ? 0.18 : 0.03;
    }
    if (this.plasmaReactorCore) {
      if (this.isThrustingActive) {
        const pulse = 0.75 + 0.25 * Math.sin(this.pulseTime * 22.0);
        (this.plasmaReactorCore.material as THREE.MeshBasicMaterial).opacity = 0.85 * pulse;
        const scale = 0.96 + 0.06 * Math.sin(this.pulseTime * 30.0);
        this.plasmaReactorCore.scale.set(scale, scale, 1.0);
      } else {
        (this.plasmaReactorCore.material as THREE.MeshBasicMaterial).opacity = 0.20;
      }
    }
    if (this.miningLaserBeam && this.miningLaserGlow) {
      if (this.isThrustingActive) {
        const pulse = 0.70 + 0.30 * Math.sin(this.pulseTime * 24.0);
        (this.miningLaserBeam.material as THREE.MeshBasicMaterial).opacity = 0.80 * pulse;
        const flareScale = 0.85 + 0.35 * Math.sin(this.pulseTime * 32.0);
        this.miningLaserGlow.scale.set(flareScale, flareScale, flareScale);
      }
    }

    // 4. Dynamic motion for Asteroid Belt and Cosmic Nebula background
    if (this.asteroidBeltMesh) {
      this.asteroidBeltMesh.rotation.y += 0.00015;
    }
    if (this.cosmicNebulaPoints) {
      this.cosmicNebulaPoints.rotation.y += 0.00003;
    }

    // 4. Update procedural shader uniforms for Deep Space and Sun Plasma
    if (this.deepSpaceMesh && this.deepSpaceMesh.material instanceof THREE.ShaderMaterial) {
      this.deepSpaceMesh.material.uniforms.uTime.value = this.pulseTime;
    }

    // 5. Dual Hexagonal Heating Swarms Animation (Polar Beams, Reverse Earthshine, Statite Tacking)
    // Both L1 (Day) and L2 (Night) Hexagonal Swarms are stationary and fixed at their collinear Lagrange points
    const zScale = this.currentBeamZScale || 1.0;
    const bypassZ = this.currentBypassScale || 1.0;

    if (this.mirrorSunbeam) {
      const pulse = 0.94 + 0.06 * Math.sin(this.pulseTime * 14.0);
      this.mirrorSunbeam.scale.set(pulse, pulse, zScale);
    }
    if (this.l1NorthPolarBeam && this.l1SouthPolarBeam) {
      const pPulse1 = 0.93 + 0.07 * Math.sin(this.pulseTime * 12.0);
      const pPulse2 = 0.93 + 0.07 * Math.cos(this.pulseTime * 13.0);
      this.l1NorthPolarBeam.scale.set(pPulse1, pPulse1, zScale);
      this.l1SouthPolarBeam.scale.set(pPulse2, pPulse2, zScale);
    }
    if (this.l1RayLines) {
      this.l1RayLines.scale.set(1.0, 1.0, zScale);
    }
    if (this.l2ReverseEarthshineBeam) {
      const l2Pulse = 0.94 + 0.06 * Math.sin(this.pulseTime * 10.0);
      this.l2ReverseEarthshineBeam.scale.set(l2Pulse, l2Pulse, zScale);
    }
    if (this.l2RayLines) {
      this.l2RayLines.scale.set(1.0, 1.0, zScale);
    }
    if (this.bypassSheath) {
      const bPulse = 0.96 + 0.04 * Math.sin(this.pulseTime * 11.0);
      this.bypassSheath.scale.set(bPulse, bPulse, bypassZ);
    }
    if (this.bypassRayLines) {
      this.bypassRayLines.scale.set(1.0, 1.0, bypassZ);
    }

    // Electrochromic solar tacking trim panel pulsing (statite sailboat trim)
    const tackPulse = 0.65 + 0.35 * Math.sin(this.pulseTime * 8.0);
    if (this.l1ElectrochromicRims && Array.isArray(this.l1ElectrochromicRims)) {
      for (let i = 0; i < this.l1ElectrochromicRims.length; i++) {
        (this.l1ElectrochromicRims[i].material as THREE.MeshBasicMaterial).opacity = tackPulse;
      }
    }
    if (this.l2ElectrochromicRims && Array.isArray(this.l2ElectrochromicRims)) {
      for (let i = 0; i < this.l2ElectrochromicRims.length; i++) {
        (this.l2ElectrochromicRims[i].material as THREE.MeshBasicMaterial).opacity = tackPulse;
      }
    }

    // 6. Extended Out-of-Ecliptic Plume Cones pulsation
    if (this.isThrustingActive && this.tugExtendedPlume1 && this.tugExtendedPlume2) {
      const epPulse1 = 0.92 + 0.08 * Math.sin(this.pulseTime * 18.0);
      const epPulse2 = 0.92 + 0.08 * Math.cos(this.pulseTime * 19.0);
      this.tugExtendedPlume1.scale.set(epPulse1, epPulse1, 1.0);
      this.tugExtendedPlume2.scale.set(epPulse2, epPulse2, 1.0);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    window.removeEventListener('resize', this.onWindowResize);
    try {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    } catch {}
  }
}
