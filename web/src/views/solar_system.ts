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
  RHEA_ORBIT_PERIOD_SECONDS
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

  // Dynamic Camera Focus & Interactive Raycasting Selection
  private cameraFocus: string = 'system';
  private currentEarthPos: THREE.Vector3 = new THREE.Vector3(10, 0, 0);
  private isThrustingActive: boolean = false;
  private pulseTime: number = 0;

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

    // 9. Uranus Orbit (19.191 AU) - Soft pale cyan ribbon
    const uranusRing = this.createLuminousOrbitRing(URANUS_ORBIT_AU, 0x7dd3fc, 0.22, 0.025);
    this.orbitsGroup.add(uranusRing);

    // 10. Neptune Orbit (30.07 AU) - Rich royal azure ribbon
    const neptuneRing = this.createLuminousOrbitRing(NEPTUNE_ORBIT_AU, 0x3b82f6, 0.20, 0.028);
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

    // 2. Central engine gantry.
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

    // 3. Central heat shield.
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

    // Short illustrative flames leave a clear gap before the magnified Earth.
    const plumeGeo = new THREE.ConeGeometry(0.04, 0.32, 16, 1, true);
    plumeGeo.translate(0, -0.16, 0); // apex at 0, expanding to base at -0.32

    const plumeMat1 = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.60,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const plumeMat2 = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.60,
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

    this.tugGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

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
      geometry = new THREE.SphereGeometry(0.45, 48, 48);
      const uranusTex = loadTexture('/textures/uranus.jpeg');
      const uranusMat = new THREE.MeshStandardMaterial({
        ...(uranusTex ? { map: uranusTex } : {}),
        color: uranusTex ? 0xffffff : 0x7dd3fc,
        roughness: 0.80,
        metalness: 0.0
      });
      uranusMat.transparent = false;
      uranusMat.depthTest = true;
      uranusMat.depthWrite = true;
      const uranusMesh = new THREE.Mesh(geometry, uranusMat);
      uranusMesh.name = 'uranusGlobe';
      uranusMesh.castShadow = true;
      uranusMesh.receiveShadow = true;
      uranusGroup.add(uranusMesh);

      // Subtle icy ring
      const ringMesh = createUranusRingMesh(0.45);
      uranusGroup.add(ringMesh);

      // Uranus authentic axial tilt: 97.77 degrees
      uranusGroup.rotation.z = THREE.MathUtils.degToRad(97.77);

      mesh = uranusGroup;
    } else if (name === 'Neptune') {
      geometry = new THREE.SphereGeometry(0.44, 48, 48);
      const neptuneTex = loadTexture('/textures/neptune.jpg');
      const material = new THREE.MeshStandardMaterial({
        ...(neptuneTex ? { map: neptuneTex } : {}),
        color: neptuneTex ? 0xffffff : 0x2563eb,
        roughness: 0.80,
        metalness: 0.0
      });
      material.transparent = false;
      material.depthTest = true;
      material.depthWrite = true;
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
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

      // Update Towline appearance
      if (this.tugTowline) {
        const mat = this.tugTowline.material as THREE.LineBasicMaterial;
        mat.opacity = this.isThrustingActive ? 0.9 : 0.35;
        mat.color.setHex(this.isThrustingActive ? 0x00f0ff : 0x5588aa);
      }
    }

    // 6. Camera Target Tracking for focused celestial bodies
    if (this.cameraFocus && this.cameraFocus !== 'system') {
      let targetPos: THREE.Vector3 | null = null;
      if (this.cameraFocus === 'earth_tug' || this.cameraFocus === 'Earth' || this.cameraFocus === 'Tug') {
        targetPos = this.currentEarthPos;
      } else {
        const mesh = this.bodyMeshes.get(this.cameraFocus);
        if (mesh) targetPos = mesh.position;
      }

      if (targetPos && this.controls) {
        const offset = this.camera.position.clone().sub(this.controls.target);
        this.controls.target.copy(targetPos);
        this.camera.position.copy(targetPos).add(offset);
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
    } else if (mode === 'earth_tug' || mode === 'Tug') {
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
          Neptune: 3.2,
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
      earth_tug: 'Earth-Tug',
      Tug: 'Ceres Tug',
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
      Neptune: 'Neptune'
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

    // 2. Thruster relativistic plasma pulsation
    if (this.isThrustingActive && this.tugThrusterPlume1 && this.tugThrusterPlume2) {
      const pulse1 = 0.85 + 0.15 * Math.sin(this.pulseTime * 20.0);
      const pulse2 = 0.85 + 0.15 * Math.cos(this.pulseTime * 23.0);
      this.tugThrusterPlume1.scale.set(pulse1, pulse1, pulse1 * (0.95 + 0.1 * Math.sin(this.pulseTime * 30.0)));
      this.tugThrusterPlume2.scale.set(pulse2, pulse2, pulse2 * (0.95 + 0.1 * Math.cos(this.pulseTime * 28.0)));
    }

    // 3. Dynamic motion for Asteroid Belt and Cosmic Nebula background
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
