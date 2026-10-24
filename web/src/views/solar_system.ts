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
import {
  SCENE_SCALE_AU,
  TARGET_ORBIT_AU,
  MARS_ORBIT_AU,
  ASTEROID_BELT_INNER_AU,
  ASTEROID_BELT_OUTER_AU,
  CERES_SEMI_MAJOR_AXIS_AU,
  YEAR_SECONDS
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

function createEarthTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Rich layered ocean gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, 256);
  oceanGrad.addColorStop(0.0, '#0a2342');
  oceanGrad.addColorStop(0.2, '#124574');
  oceanGrad.addColorStop(0.5, '#195e99');
  oceanGrad.addColorStop(0.8, '#124574');
  oceanGrad.addColorStop(1.0, '#0a2342');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, 512, 256);

  // Continental landmasses
  const prng = mulberry32(777);
  ctx.fillStyle = '#2b6e4e'; // Verdant temperate continents
  for (let i = 0; i < 48; i++) {
    const cx = prng() * 512;
    const cy = 40 + prng() * 175;
    const rw = 16 + prng() * 48;
    const rh = 10 + prng() * 32;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, prng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();

    // Arid desert interior
    if (prng() > 0.45) {
      ctx.fillStyle = '#c5a059';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw * 0.42, rh * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b6e4e';
    }
  }

  // Polar Ice Caps (North and South poles)
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.ellipse(256, 8, 256, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(256, 248, 256, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Swirling atmospheric white clouds
  ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
  for (let i = 0; i < 35; i++) {
    const cx = prng() * 512;
    const cy = 25 + prng() * 206;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 35 + prng() * 65, 6 + prng() * 10, 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
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

export class SolarSystemView {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;

  private bodyMeshes: Map<string, THREE.Object3D> = new Map();
  private asteroidBeltMesh: THREE.InstancedMesh | null = null;
  private ceresMarker: THREE.Mesh | null = null;
  private sunCoronaMesh: THREE.Mesh | null = null;
  private cosmicNebulaPoints: THREE.Points | null = null;

  // Prominent Ceres Tug & Thrusters
  private tugGroup: THREE.Group | null = null;
  private tugThrusterPlume1: THREE.Mesh | null = null;
  private tugThrusterPlume2: THREE.Mesh | null = null;
  private tugTowline: THREE.Line | null = null;
  private towlineGeometry: THREE.BufferGeometry | null = null;
  private towlinePositions: Float32Array = new Float32Array(6);
  private cameraFocus: 'system' | 'earth_tug' = 'system';
  private currentEarthPos: THREE.Vector3 = new THREE.Vector3(10, 0, 0);
  private isThrustingActive: boolean = false;
  private pulseTime: number = 0;

  // Dynamic Traversed Trail (drawn only behind Earth as it traverses)
  private trailLine: THREE.Line | null = null;
  private trailPositions: Float32Array;
  private trailColors: Float32Array;
  private trailGeometry: THREE.BufferGeometry;
  private framesCache: SimulationFrame[] = [];

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();

    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.01, 5000);
    this.camera.position.set(0, 72, 72); // Comfortable framing showing all planets out to Jupiter/Saturn

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

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
    // 1. Bright, clean omnidirectional ambient space illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.6);
    this.scene.add(ambientLight);

    // 2. Camera headlight / fill light so whichever angle the user views from, the planets are crisply lit and bright!
    const cameraLight = new THREE.DirectionalLight(0xffffff, 2.0);
    cameraLight.position.set(0, 0, 1);
    this.camera.add(cameraLight);
    this.scene.add(this.camera);

    // 3. Warm, radiant central Sun light
    const sunLight = new THREE.PointLight(0xfffaec, 5.0, 0, 0.0);
    sunLight.position.set(0, 0, 0);
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
      transparent: true,
      opacity: 0.85
    });

    const starfield = new THREE.Points(geometry, material);
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
      blending: THREE.AdditiveBlending
    });

    this.cosmicNebulaPoints = new THREE.Points(nebGeo, nebMat);
    this.scene.add(this.cosmicNebulaPoints);
  }

  /**
   * Creates a luminous, anti-aliased continuous orbit ring.
   * Uses a 2D mesh ribbon (RingGeometry) combined with a soft glow ribbon so it NEVER
   * rasterizes into dotted/aliased pixels, remaining perfectly smooth and luminous from any distance.
   */
  private createLuminousOrbitRing(
    radiusAU: number,
    colorHex: number,
    opacity: number = 0.85,
    widthScene: number = 0.05
  ): THREE.Group {
    const group = new THREE.Group();
    const rScene = radiusAU * SCENE_SCALE_AU;
    const segments = 256;

    // 1. Anti-aliased physical ribbon mesh (immune to 1px line rasterization dots)
    const innerR = Math.max(0.1, rScene - widthScene);
    const outerR = rScene + widthScene;
    const ringGeo = new THREE.RingGeometry(innerR, outerR, segments);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: opacity,
      depthWrite: false
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2; // Lie flat in X-Z ecliptic plane
    group.add(ringMesh);

    // 2. Outer soft glow aura ribbon
    const glowInner = Math.max(0.1, rScene - widthScene * 2.8);
    const glowOuter = rScene + widthScene * 2.8;
    const glowGeo = new THREE.RingGeometry(glowInner, glowOuter, segments);
    const glowMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: opacity * 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.rotation.x = Math.PI / 2;
    group.add(glowMesh);

    return group;
  }

  private setupReferenceRings(): void {
    // 1. Mercury Orbit (0.387 AU) - Silver-grey solid luminous ribbon
    const mercuryRing = this.createLuminousOrbitRing(MERCURY_ORBIT_AU, 0x94a3b8, 0.40, 0.025);
    this.scene.add(mercuryRing);

    // 2. Venus Orbit (0.723 AU) - Creamy gold solid luminous ribbon
    const venusRing = this.createLuminousOrbitRing(VENUS_ORBIT_AU, 0xfde047, 0.45, 0.035);
    this.scene.add(venusRing);

    // 3. Earth Initial Reference Orbit (1.00 AU) - Continuous luminous Azure ribbon
    const earthInitRing = this.createLuminousOrbitRing(1.0, 0x38bdf8, 0.55, 0.04);
    this.scene.add(earthInitRing);

    // 4. Mars Crossing (1.524 AU) - Continuous solid coral-orange ribbon
    const marsRing = this.createLuminousOrbitRing(MARS_ORBIT_AU, 0xf97316, 0.65, 0.05);
    this.scene.add(marsRing);

    // 5. Asteroid Belt Entry (2.20 AU) - Continuous solid golden-amber ribbon
    const beltEntryRing = this.createLuminousOrbitRing(ASTEROID_BELT_INNER_AU, 0xfbbf24, 0.65, 0.06);
    this.scene.add(beltEntryRing);

    // 6. Target Orbit (2.70 AU) - Radiant electric cyan ribbon + primary destination aura
    const targetRing = this.createLuminousOrbitRing(TARGET_ORBIT_AU, 0x00f0ff, 0.95, 0.08);
    this.scene.add(targetRing);

    const targetAura = this.createLuminousOrbitRing(TARGET_ORBIT_AU, 0x22d3ee, 0.40, 0.18);
    this.scene.add(targetAura);

    // 7. Jupiter Orbit (5.204 AU) - Continuous solid warm bronze ribbon
    const jupiterRing = this.createLuminousOrbitRing(JUPITER_ORBIT_AU, 0xd97706, 0.65, 0.10);
    this.scene.add(jupiterRing);

    // 8. Saturn Orbit (9.582 AU) - Continuous solid golden-ochre ribbon
    const saturnRing = this.createLuminousOrbitRing(SATURN_ORBIT_AU, 0xeab308, 0.50, 0.14);
    this.scene.add(saturnRing);
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

    // 1. Ceres Asteroid Body (Dwarf Planet)
    // Irregular rocky surface
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

    // 2. Structural Engine Gantry / Truss
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

    // 3. Shadow Heat Shield Disc (protects Ceres ice from thruster radiation)
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

    // 4. Dual Canted Relativistic Thrusters (Nozzles + Exhaust Plumes)
    // Plumes exhaust backwards (+Z in local frame) canted ±5° out-of-ecliptic (Y axis)
    const cantAngleRad = THREE.MathUtils.degToRad(5.0);

    // Nozzle 1 (North canted: +5°)
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

    // Nozzle 2 (South canted: -5°)
    const nozzle2 = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle2.rotation.x = -Math.PI / 2 + cantAngleRad;
    nozzle2.position.set(0, -0.09, 0.35);
    this.tugGroup.add(nozzle2);

    // Relativistic Exhaust Plumes (High-intensity plasma beams)
    const plumeGeo = new THREE.ConeGeometry(0.11, 1.1, 16, 1, true);
    plumeGeo.translate(0, -0.55, 0); // apex at 0, expanding to base at -1.1

    const plumeMat1 = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const plumeMat2 = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
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

    // 5. Reticle Ring Marker around Ceres Tug (makes it easily identifiable)
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

    this.scene.add(this.tugGroup);

    // 6. Gravitational Towline (Earth to Ceres Tug)
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
    let material: THREE.Material;

    if (name === 'Sun') {
      geometry = new THREE.SphereGeometry(1.0, 36, 36);
      material = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
      mesh = new THREE.Mesh(geometry, material);

      // Inner Golden Corona Shell
      const coronaGeo = new THREE.SphereGeometry(1.25, 32, 32);
      const coronaMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false
      });
      const coronaInner = new THREE.Mesh(coronaGeo, coronaMat);
      mesh.add(coronaInner);

      // Outer Fiery Prominence Corona (breathing animated in render)
      const coronaOuterGeo = new THREE.SphereGeometry(1.60, 32, 32);
      const coronaOuterMat = new THREE.MeshBasicMaterial({
        color: 0xff4500,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false
      });
      this.sunCoronaMesh = new THREE.Mesh(coronaOuterGeo, coronaOuterMat);
      mesh.add(this.sunCoronaMesh);
    } else if (name === 'Mercury') {
      geometry = new THREE.SphereGeometry(0.22, 24, 24);
      material = new THREE.MeshStandardMaterial({
        color: 0xc4c7cc,
        roughness: 0.25,
        metalness: 0.1,
        emissive: new THREE.Color(0x222222)
      });
      mesh = new THREE.Mesh(geometry, material);
    } else if (name === 'Venus') {
      geometry = new THREE.SphereGeometry(0.34, 28, 28);
      material = new THREE.MeshStandardMaterial({
        color: 0xfff0b3,
        roughness: 0.20,
        metalness: 0.0,
        emissive: new THREE.Color(0x4a4422)
      });
      mesh = new THREE.Mesh(geometry, material);
    } else if (name === 'Earth') {
      geometry = new THREE.SphereGeometry(0.38, 32, 32);
      const earthTex = createEarthTexture();
      material = new THREE.MeshStandardMaterial({
        map: earthTex ?? undefined,
        color: earthTex ? 0xffffff : 0x2277ff,
        roughness: 0.30,
        metalness: 0.05,
        emissive: new THREE.Color(0x1a2e40)
      });
      mesh = new THREE.Mesh(geometry, material);

      // Rayleigh Atmospheric Scattering Blue Halo
      const atmoGeo = new THREE.SphereGeometry(0.42, 32, 32);
      const atmoMat = new THREE.MeshBasicMaterial({
        color: 0x60a5fa,
        transparent: true,
        opacity: 0.40,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false
      });
      const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
      mesh.add(atmoMesh);
    } else if (name === 'Mars') {
      geometry = new THREE.SphereGeometry(0.28, 24, 24);
      const marsTex = createMarsTexture();
      material = new THREE.MeshStandardMaterial({
        map: marsTex ?? undefined,
        color: marsTex ? 0xffffff : 0xcc5522,
        roughness: 0.35,
        metalness: 0.05,
        emissive: new THREE.Color(0x3d170a)
      });
      mesh = new THREE.Mesh(geometry, material);
    } else if (name === 'Jupiter') {
      geometry = new THREE.SphereGeometry(0.78, 32, 32);
      const jupTex = createJupiterTexture();
      material = new THREE.MeshStandardMaterial({
        map: jupTex ?? undefined,
        color: jupTex ? 0xffffff : 0xd4a373,
        roughness: 0.35,
        metalness: 0.05,
        emissive: new THREE.Color(0x382c1a)
      });
      mesh = new THREE.Mesh(geometry, material);
      // Clean, majestic Jupiter without any fake wobbling rings!
    } else if (name === 'Saturn') {
      const saturnGroup = new THREE.Group();

      const globeGeo = new THREE.SphereGeometry(0.65, 32, 32);
      const globeMat = new THREE.MeshStandardMaterial({
        color: 0xf6d89b,
        roughness: 0.35,
        metalness: 0.05,
        emissive: new THREE.Color(0x3d3014)
      });
      const globeMesh = new THREE.Mesh(globeGeo, globeMat);
      globeMesh.name = 'saturnGlobe';
      saturnGroup.add(globeMesh);

      // Saturnian Majestic Ring System (fixed tilt at 26.7 deg, does not tumble when globe spins)
      const ringGeo = new THREE.RingGeometry(0.95, 1.85, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xe2c688,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2 + THREE.MathUtils.degToRad(26.7);
      saturnGroup.add(ringMesh);

      mesh = saturnGroup;
    } else {
      geometry = new THREE.SphereGeometry(0.2, 16, 16);
      material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, emissive: new THREE.Color(0x222222) });
      mesh = new THREE.Mesh(geometry, material);
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
    }

    // 2. Ensure ALL standard Solar System planets are ALWAYS visible and in orbit:
    const planets: Record<string, { r: number; periodYr: number }> = {
      Mercury: { r: MERCURY_ORBIT_AU, periodYr: MERCURY_PERIOD_YR },
      Venus: { r: VENUS_ORBIT_AU, periodYr: VENUS_PERIOD_YR },
      Mars: { r: MARS_ORBIT_AU, periodYr: MARS_PERIOD_YR },
      Jupiter: { r: JUPITER_ORBIT_AU, periodYr: JUPITER_PERIOD_YR },
      Saturn: { r: SATURN_ORBIT_AU, periodYr: SATURN_PERIOD_YR }
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

    // 3. Position and Orient Ceres Tug and Relativistic Thrusters
    const earthData = frame.bodies['Earth'];
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
      // (Earth radius is 0.35, giving 1.05 units clear visual separation)
      const visualStandoff = 1.4;
      const tugVisualPos = this.currentEarthPos.clone().addScaledVector(dir, visualStandoff);

      if (this.tugGroup) {
        this.tugGroup.position.copy(tugVisualPos);
        // Look in forward direction so local -Z points forward, and +Z (nozzles/plumes) points backwards towards Earth
        this.tugGroup.lookAt(tugVisualPos.clone().add(dir));
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

      // Update Towline appearance
      if (this.tugTowline) {
        const mat = this.tugTowline.material as THREE.LineBasicMaterial;
        mat.opacity = this.isThrustingActive ? 0.9 : 0.35;
        mat.color.setHex(this.isThrustingActive ? 0x00f0ff : 0x5588aa);
      }

      // Camera Tracking if focused on Earth-Tug system
      if (this.cameraFocus === 'earth_tug') {
        const offset = this.camera.position.clone().sub(this.controls.target);
        this.controls.target.copy(this.currentEarthPos);
        this.camera.position.copy(this.currentEarthPos).add(offset);
      }
    }

    // 4. Update the traversed trajectory trail up to current time_s
    this.updateTraversedTrail(time_s);
  }

  public setCameraFocus(mode: 'system' | 'earth_tug'): void {
    this.cameraFocus = mode;
    if (mode === 'system') {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, 72, 72);
    } else {
      // Zoom in directly to Earth-Tug system
      this.controls.target.copy(this.currentEarthPos);
      this.camera.position.set(
        this.currentEarthPos.x + 3.0,
        this.currentEarthPos.y + 2.2,
        this.currentEarthPos.z + 3.8
      );
    }
    this.controls.update();
  }

  public toggleCameraFocus(): 'system' | 'earth_tug' {
    const next = this.cameraFocus === 'system' ? 'earth_tug' : 'system';
    this.setCameraFocus(next);
    return next;
  }

  public getCameraFocus(): 'system' | 'earth_tug' {
    return this.cameraFocus;
  }

  public render(): void {
    this.pulseTime += 0.05;

    // 1. Sun corona breathing pulsation
    if (this.sunCoronaMesh) {
      const s = 1.0 + 0.06 * Math.sin(this.pulseTime * 2.2);
      this.sunCoronaMesh.scale.set(s, s, s);
    }

    // 2. Thruster relativistic plasma pulsation
    if (this.isThrustingActive && this.tugThrusterPlume1 && this.tugThrusterPlume2) {
      const pulse1 = 0.85 + 0.15 * Math.sin(this.pulseTime * 20.0);
      const pulse2 = 0.85 + 0.15 * Math.cos(this.pulseTime * 23.0);
      this.tugThrusterPlume1.scale.set(pulse1, pulse1, pulse1 * (0.95 + 0.1 * Math.sin(this.pulseTime * 30.0)));
      this.tugThrusterPlume2.scale.set(pulse2, pulse2, pulse2 * (0.95 + 0.1 * Math.cos(this.pulseTime * 28.0)));
    }

    // 3. Planetary axial rotations (spinning realistically)
    const earthMesh = this.bodyMeshes.get('Earth');
    if (earthMesh) earthMesh.rotation.y += 0.008;

    const marsMesh = this.bodyMeshes.get('Mars');
    if (marsMesh) marsMesh.rotation.y += 0.006;

    const jupiterMesh = this.bodyMeshes.get('Jupiter');
    if (jupiterMesh) jupiterMesh.rotation.y += 0.012;

    const saturnGlobe = this.scene.getObjectByName('saturnGlobe');
    if (saturnGlobe) saturnGlobe.rotation.y += 0.010;

    const mercuryMesh = this.bodyMeshes.get('Mercury');
    if (mercuryMesh) mercuryMesh.rotation.y += 0.004;

    const venusMesh = this.bodyMeshes.get('Venus');
    if (venusMesh) venusMesh.rotation.y -= 0.003;

    // 4. Subtle dynamic motion for Asteroid Belt and Cosmic Nebula
    if (this.asteroidBeltMesh) {
      this.asteroidBeltMesh.rotation.y += 0.00015;
    }
    if (this.cosmicNebulaPoints) {
      this.cosmicNebulaPoints.rotation.y += 0.00003;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    window.removeEventListener('resize', this.onWindowResize);
    this.renderer.dispose();
  }
}
