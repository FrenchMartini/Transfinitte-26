/**
 * Procedural Celestial Shader Materials & Ring Systems.
 * Directly ported from akshuvo101/3d-solar-system-visualizer.
 *
 * Implements GPU-procedural 3D spherical direction shaders with zero 2D seams,
 * zero texture distortion, zero black spaces, dynamic day/night terminator lighting,
 * and Saturn's multi-tier procedural ring system with Cassini division and Encke gap.
 */

import * as THREE from 'three';

const commonVertexShader = `
  varying vec3 vLocalDirection;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  #include <logdepthbuf_pars_vertex>

  void main() {
    vLocalDirection = normalize(position);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

// ============================================================================
// 1. SATURN'S PROCEDURAL RING SYSTEM (4-Tier Procedural Ring Group)
// ============================================================================

export function createSaturnRingGroup(saturnRadius: number = 0.65): THREE.Group {
  const group = new THREE.Group();

  // Multi-scale procedural shader for Saturn's main ring (A and B rings with Cassini division)
  const innerRingMaterial = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec2 centered = vUv - vec2(0.5);
        float radial = length(centered);

        // Multi-scale ring divisions
        float fineBands = sin(radial * 235.0) * 0.5 + 0.5;
        float mediumBands = sin(radial * 112.0 + sin(radial * 19.0) * 2.4) * 0.5 + 0.5;
        float broadBands = sin(radial * 42.0) * 0.5 + 0.5;

        // Irregular ring density
        float densityNoise = noise(vec2(radial * 110.0, vUv.y * 18.0));
        float fineNoise = noise(vec2(radial * 210.0, vUv.y * 34.0));

        float brightness = fineBands * 0.27 + mediumBands * 0.24 + broadBands * 0.13 + densityNoise * 0.25 + fineNoise * 0.11;

        // Photorealistic Saturnian ring colors
        vec3 darkRing = vec3(0.12, 0.090, 0.058);
        vec3 midRing = vec3(0.43, 0.345, 0.235);
        vec3 brightRing = vec3(0.78, 0.68, 0.51);
        vec3 paleRing = vec3(0.91, 0.83, 0.68);

        vec3 ringColor = mix(darkRing, midRing, smoothstep(0.14, 0.52, brightness));
        ringColor = mix(ringColor, brightRing, smoothstep(0.48, 0.77, brightness) * 0.78);
        ringColor = mix(ringColor, paleRing, smoothstep(0.72, 0.93, brightness) * 0.36);

        // Radial inner and outer bounds fade
        float innerFade = smoothstep(0.0, 0.050, radial);
        float outerFade = 1.0 - smoothstep(0.425, 0.500, radial);
        float alpha = innerFade * outerFade;

        // Cassini Division (major gap between A and B rings)
        float cassini = smoothstep(0.247, 0.266, radial) * (1.0 - smoothstep(0.266, 0.288, radial));
        alpha *= 1.0 - cassini * 0.88;

        // Secondary Division (Encke Gap in A ring)
        float secondaryDivision = smoothstep(0.365, 0.374, radial) * (1.0 - smoothstep(0.374, 0.385, radial));
        alpha *= 1.0 - secondaryDivision * 0.52;

        gl_FragColor = vec4(ringColor, alpha * 0.90);
      }
    `
  });

  // Layer 1: Main detailed procedural ring
  const mainRingGeo = new THREE.RingGeometry(1.35 * saturnRadius, 2.35 * saturnRadius, 160);
  const mainRing = new THREE.Mesh(mainRingGeo, innerRingMaterial);
  group.add(mainRing);

  // Layer 2: Inner Dark C Ring (Crepe Ring)
  const cRingMat = new THREE.MeshBasicMaterial({
    color: 0x56452f,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const cRingGeo = new THREE.RingGeometry(1.15 * saturnRadius, 1.35 * saturnRadius, 160);
  group.add(new THREE.Mesh(cRingGeo, cRingMat));

  // Layer 3: Bright Inner B Ring Core
  const bRingMat = new THREE.MeshBasicMaterial({
    color: 0xc7ad78,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const bRingGeo = new THREE.RingGeometry(1.38 * saturnRadius, 1.72 * saturnRadius, 160);
  group.add(new THREE.Mesh(bRingGeo, bRingMat));

  // Layer 4: Outer Faint A/F Ring
  const fRingMat = new THREE.MeshBasicMaterial({
    color: 0x927b59,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const fRingGeo = new THREE.RingGeometry(2.35 * saturnRadius, 2.62 * saturnRadius, 160);
  group.add(new THREE.Mesh(fRingGeo, fRingMat));

  // Set axial tilt: 26.73° relative to ecliptic (horizontal X-Z plane)
  group.rotation.x = Math.PI / 2 + THREE.MathUtils.degToRad(26.73);
  return group;
}

// ============================================================================
// 2. SATURN PROCEDURAL BODY MATERIAL
// ============================================================================

export function createSaturnMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunPosition: { value: new THREE.Vector3(0, 0, 0) }
    },
    vertexShader: commonVertexShader,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vLocalDirection;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      uniform vec3 uSunPosition;

      float hash31(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float n000 = hash31(i);
        float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

        float nx00 = mix(n000, n100, f.x);
        float nx10 = mix(n010, n110, f.x);
        float nx01 = mix(n001, n101, f.x);
        float nx11 = mix(n011, n111, f.x);

        float nxy0 = mix(nx00, nx10, f.y);
        float nxy1 = mix(nx01, nx11, f.y);
        return mix(nxy0, nxy1, f.z);
      }

      float fbm3(vec3 p) {
        float val = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
          val += noise3(p) * amp;
          p *= 2.0;
          amp *= 0.5;
        }
        return val;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 dir = normalize(vLocalDirection);
        float lat = dir.y;

        // Saturnian Golden-Ochre Palette
        vec3 deepAmber = vec3(0.38, 0.28, 0.16);
        vec3 warmOchre = vec3(0.68, 0.54, 0.36);
        vec3 paleGold = vec3(0.85, 0.74, 0.56);
        vec3 creamyWhite = vec3(0.94, 0.88, 0.74);
        vec3 polarHex = vec3(0.42, 0.36, 0.26);

        // Latitudinal band structure
        float primaryBands = sin(lat * 38.0) * 0.5 + 0.5;
        float secondaryBands = sin(lat * 82.0 + sin(lat * 18.0) * 1.5) * 0.5 + 0.5;
        float cloudNoise = fbm3(dir * vec3(6.0, 28.0, 6.0));

        float bandMix = primaryBands * 0.52 + secondaryBands * 0.26 + cloudNoise * 0.22;

        vec3 surface = mix(deepAmber, warmOchre, smoothstep(0.20, 0.50, bandMix));
        surface = mix(surface, paleGold, smoothstep(0.45, 0.75, bandMix) * 0.85);
        surface = mix(surface, creamyWhite, smoothstep(0.70, 0.95, bandMix) * 0.50);

        // Polar darkening & hexagon region
        float polarMask = smoothstep(0.78, 0.98, abs(lat));
        surface = mix(surface, polarHex, polarMask * 0.65);

        // Sun day/night terminator lighting
        vec3 sunDir = normalize(uSunPosition - vWorldPosition);
        float NdotL = dot(normalize(vNormal), sunDir);
        float daylight = smoothstep(-0.10, 0.28, NdotL);
        float diffuse = max(0.0, NdotL);
        float dayIntensity = 0.20 + pow(diffuse, 0.70) * 0.85;

        surface *= dayIntensity;

        // Subtle atmospheric limb rim
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float limb = pow(1.0 - max(0.0, dot(normalize(vNormal), viewDir)), 3.5);
        surface += vec3(0.85, 0.72, 0.48) * limb * 0.18 * daylight;

        gl_FragColor = vec4(surface, 1.0);
      }
    `,
    transparent: false,
    depthTest: true,
    depthWrite: true
  });
}

// ============================================================================
// 3. URANUS PROCEDURAL RING SYSTEM & BODY
// ============================================================================

export function createUranusRingGroup(uranusRadius: number = 0.45): THREE.Group {
  const group = new THREE.Group();

  const mainRingMaterial = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec2 centered = vUv - vec2(0.5);
        float radial = length(centered);

        float fineBands = sin(radial * 310.0) * 0.5 + 0.5;
        float mediumBands = sin(radial * 135.0 + sin(radial * 21.0) * 2.0) * 0.5 + 0.5;
        float broadBands = sin(radial * 48.0) * 0.5 + 0.5;
        float density = noise(vec2(radial * 125.0, vUv.y * 15.0));

        float brightness = fineBands * 0.30 + mediumBands * 0.23 + broadBands * 0.13 + density * 0.34;

        vec3 darkRing = vec3(0.065, 0.13, 0.135);
        vec3 midRing = vec3(0.27, 0.40, 0.40);
        vec3 brightRing = vec3(0.55, 0.68, 0.67);
        vec3 icyRing = vec3(0.72, 0.82, 0.80);

        vec3 ringColor = mix(darkRing, midRing, smoothstep(0.15, 0.52, brightness));
        ringColor = mix(ringColor, brightRing, smoothstep(0.50, 0.78, brightness) * 0.66);
        ringColor = mix(ringColor, icyRing, smoothstep(0.74, 0.93, brightness) * 0.28);

        float innerFade = smoothstep(0.015, 0.060, radial);
        float outerFade = 1.0 - smoothstep(0.41, 0.50, radial);
        float alpha = innerFade * outerFade;

        // Subtle divisions
        float divisionOne = smoothstep(0.205, 0.216, radial) * (1.0 - smoothstep(0.216, 0.228, radial));
        float divisionTwo = smoothstep(0.315, 0.324, radial) * (1.0 - smoothstep(0.324, 0.337, radial));
        alpha *= 1.0 - divisionOne * 0.52;
        alpha *= 1.0 - divisionTwo * 0.34;

        gl_FragColor = vec4(ringColor, alpha * 0.65);
      }
    `
  });

  const mainRingGeo = new THREE.RingGeometry(1.32 * uranusRadius, 1.85 * uranusRadius, 160);
  group.add(new THREE.Mesh(mainRingGeo, mainRingMaterial));

  const outerMat = new THREE.MeshBasicMaterial({ color: 0x819b9a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const outerGeo = new THREE.RingGeometry(2.02 * uranusRadius, 2.18 * uranusRadius, 160);
  group.add(new THREE.Mesh(outerGeo, outerMat));

  group.rotation.x = Math.PI / 2 + THREE.MathUtils.degToRad(97.77);
  return group;
}

export function createUranusMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunPosition: { value: new THREE.Vector3(0, 0, 0) }
    },
    vertexShader: commonVertexShader,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vLocalDirection;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      uniform vec3 uSunPosition;

      void main() {
        #include <logdepthbuf_fragment>
        vec3 dir = normalize(vLocalDirection);
        float lat = abs(dir.y);

        // Pale cyan-aquamarine atmosphere
        vec3 deepCyan = vec3(0.24, 0.52, 0.65);
        vec3 aquamarine = vec3(0.42, 0.76, 0.88);
        vec3 paleCyan = vec3(0.68, 0.90, 0.96);
        vec3 polarHaze = vec3(0.78, 0.94, 0.98);

        float bands = sin(lat * 32.0) * 0.08;
        vec3 surface = mix(aquamarine, paleCyan, lat * 0.6 + bands);
        surface = mix(surface, polarHaze, smoothstep(0.65, 0.98, lat) * 0.45);

        vec3 sunDir = normalize(uSunPosition - vWorldPosition);
        float NdotL = dot(normalize(vNormal), sunDir);
        float daylight = smoothstep(-0.12, 0.26, NdotL);
        float diffuse = max(0.0, NdotL);
        float dayIntensity = 0.20 + pow(diffuse, 0.70) * 0.85;

        surface *= dayIntensity;

        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float limb = pow(1.0 - max(0.0, dot(normalize(vNormal), viewDir)), 3.2);
        surface += vec3(0.60, 0.92, 1.0) * limb * 0.24 * daylight;

        gl_FragColor = vec4(surface, 1.0);
      }
    `,
    transparent: false,
    depthTest: true,
    depthWrite: true
  });
}

// ============================================================================
// 4. NEPTUNE PROCEDURAL MATERIAL
// ============================================================================

export function createNeptuneMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunPosition: { value: new THREE.Vector3(0, 0, 0) }
    },
    vertexShader: commonVertexShader,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vLocalDirection;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      uniform vec3 uSunPosition;

      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
      }

      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec3(1.0, 0.0, 0.0));
        float c = hash(i + vec3(0.0, 1.0, 0.0));
        float d = hash(i + vec3(1.0, 1.0, 0.0));
        float e = hash(i + vec3(0.0, 0.0, 1.0));
        float g = hash(i + vec3(1.0, 0.0, 1.0));
        float h = hash(i + vec3(0.0, 1.0, 1.0));
        float k = hash(i + vec3(1.0, 1.0, 1.0));
        return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 dir = normalize(vLocalDirection);
        float lat = dir.y;

        vec3 deepAzure = vec3(0.08, 0.22, 0.65);
        vec3 royalBlue = vec3(0.14, 0.38, 0.88);
        vec3 azureBlue = vec3(0.24, 0.54, 0.96);
        vec3 darkSpot = vec3(0.03, 0.08, 0.28);
        vec3 cirrusWhite = vec3(0.85, 0.94, 1.0);

        float bands = sin(lat * 38.0) * 0.5 + 0.5;
        float cloudNoise = noise3(dir * vec3(8.0, 32.0, 8.0));
        vec3 surface = mix(deepAzure, royalBlue, bands * 0.6 + cloudNoise * 0.4);

        // Great Dark Spot (southern hemisphere, lat ~ -0.35)
        float spotDist = length(vec2(dir.x - 0.4, dir.y + 0.35));
        float spotMask = smoothstep(0.22, 0.12, spotDist);
        surface = mix(surface, darkSpot, spotMask * 0.65);

        // High-altitude methane cirrus clouds (bright white companion clouds)
        float cirrus = smoothstep(0.72, 0.92, noise3(dir * 22.0));
        surface = mix(surface, cirrusWhite, cirrus * 0.45);

        vec3 sunDir = normalize(uSunPosition - vWorldPosition);
        float NdotL = dot(normalize(vNormal), sunDir);
        float daylight = smoothstep(-0.12, 0.26, NdotL);
        float diffuse = max(0.0, NdotL);
        float dayIntensity = 0.20 + pow(diffuse, 0.70) * 0.85;

        surface *= dayIntensity;

        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float limb = pow(1.0 - max(0.0, dot(normalize(vNormal), viewDir)), 3.2);
        surface += vec3(0.35, 0.70, 1.0) * limb * 0.26 * daylight;

        gl_FragColor = vec4(surface, 1.0);
      }
    `,
    transparent: false,
    depthTest: true,
    depthWrite: true
  });
}

// ============================================================================
// 5. JUPITER PROCEDURAL MATERIAL (With Great Red Spot)
// ============================================================================

export function createJupiterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunPosition: { value: new THREE.Vector3(0, 0, 0) }
    },
    vertexShader: commonVertexShader,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vLocalDirection;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      uniform vec3 uSunPosition;

      float hash3(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n000 = hash3(i);
        float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
        return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
      }

      float fbm3(vec3 p) {
        float val = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
          val += noise3(p) * amp;
          p *= 2.0;
          amp *= 0.5;
        }
        return val;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 dir = normalize(vLocalDirection);
        float lat = dir.y;

        // Jupiter Belt Colors
        vec3 deepBrown = vec3(0.38, 0.18, 0.09);
        vec3 warmOchre = vec3(0.68, 0.42, 0.24);
        vec3 creamZone = vec3(0.92, 0.86, 0.76);
        vec3 orangeBelt = vec3(0.78, 0.38, 0.18);
        vec3 redSpotColor = vec3(0.65, 0.16, 0.08);

        // Turbulent atmospheric zones and belts
        float primaryBands = sin(lat * 32.0) * 0.5 + 0.5;
        float secondaryBands = sin(lat * 74.0 + sin(lat * 16.0) * 2.0) * 0.5 + 0.5;
        float turbulence = fbm3(dir * vec3(5.0, 24.0, 5.0));

        float bandField = primaryBands * 0.50 + secondaryBands * 0.25 + turbulence * 0.25;

        vec3 surface = mix(deepBrown, warmOchre, smoothstep(0.20, 0.50, bandField));
        surface = mix(surface, orangeBelt, smoothstep(0.40, 0.65, bandField) * 0.65);
        surface = mix(surface, creamZone, smoothstep(0.60, 0.88, bandField) * 0.85);

        // Great Red Spot (Southern Tropical Zone: lat ~ -0.32, lon ~ 0.5)
        vec2 spotCoord = vec2(dir.x - 0.45, (dir.y + 0.32) * 1.6);
        float spotDist = length(spotCoord);
        float spotMask = smoothstep(0.18, 0.08, spotDist);
        float spotSwirl = noise3(dir * 18.0);
        surface = mix(surface, redSpotColor + spotSwirl * 0.12, spotMask * 0.90);

        vec3 sunDir = normalize(uSunPosition - vWorldPosition);
        float NdotL = dot(normalize(vNormal), sunDir);
        float daylight = smoothstep(-0.10, 0.26, NdotL);
        float diffuse = max(0.0, NdotL);
        float dayIntensity = 0.20 + pow(diffuse, 0.72) * 0.88;

        surface *= dayIntensity;

        gl_FragColor = vec4(surface, 1.0);
      }
    `,
    transparent: false,
    depthTest: true,
    depthWrite: true
  });
}

// ============================================================================
// 6. MARS PROCEDURAL MATERIAL (Volcanic Maria & Polar Caps)
// ============================================================================

export function createMarsMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunPosition: { value: new THREE.Vector3(0, 0, 0) }
    },
    vertexShader: commonVertexShader,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vLocalDirection;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      uniform vec3 uSunPosition;

      float hash3(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash3(i);
        float b = hash3(i + vec3(1.0, 0.0, 0.0));
        float c = hash3(i + vec3(0.0, 1.0, 0.0));
        float d = hash3(i + vec3(1.0, 1.0, 0.0));
        float e = hash3(i + vec3(0.0, 0.0, 1.0));
        float g = hash3(i + vec3(1.0, 0.0, 1.0));
        float h = hash3(i + vec3(0.0, 1.0, 1.0));
        float k = hash3(i + vec3(1.0, 1.0, 1.0));
        return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
      }

      float fbm3(vec3 p) {
        float val = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
          val += noise3(p) * amp;
          p *= 2.0;
          amp *= 0.5;
        }
        return val;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 dir = normalize(vLocalDirection);
        float lat = abs(dir.y);

        vec3 darkBasalt = vec3(0.18, 0.08, 0.04);
        vec3 deepRust = vec3(0.48, 0.16, 0.06);
        vec3 orangeDesert = vec3(0.78, 0.32, 0.12);
        vec3 dustyHighlands = vec3(0.88, 0.45, 0.22);
        vec3 polarIce = vec3(0.96, 0.98, 1.0);

        float terrain = fbm3(dir * 3.8);
        float detail = noise3(dir * 12.0);
        float combined = terrain * 0.75 + detail * 0.25;

        vec3 surface = mix(darkBasalt, deepRust, smoothstep(0.25, 0.52, combined));
        surface = mix(surface, orangeDesert, smoothstep(0.48, 0.72, combined) * 0.85);
        surface = mix(surface, dustyHighlands, smoothstep(0.68, 0.88, combined) * 0.40);

        // Brilliant Martian polar ice caps
        float polarMask = smoothstep(0.84, 0.96, lat);
        surface = mix(surface, polarIce, polarMask * 0.92);

        vec3 sunDir = normalize(uSunPosition - vWorldPosition);
        float NdotL = dot(normalize(vNormal), sunDir);
        float daylight = smoothstep(-0.10, 0.26, NdotL);
        float diffuse = max(0.0, NdotL);
        float dayIntensity = 0.20 + pow(diffuse, 0.72) * 0.88;

        surface *= dayIntensity;

        // Faint atmospheric limb
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float limb = pow(1.0 - max(0.0, dot(normalize(vNormal), viewDir)), 3.5);
        surface += vec3(0.9, 0.45, 0.25) * limb * 0.14 * daylight;

        gl_FragColor = vec4(surface, 1.0);
      }
    `,
    transparent: false,
    depthTest: true,
    depthWrite: true
  });
}

// ============================================================================
// 7. EARTH PROCEDURAL MATERIAL (Continents, Oceans, Vegetation, Polar Ice)
// ============================================================================

export function createEarthMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunPosition: { value: new THREE.Vector3(0, 0, 0) }
    },
    vertexShader: commonVertexShader,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vLocalDirection;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      uniform vec3 uSunPosition;

      float hash3(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash3(i);
        float b = hash3(i + vec3(1.0, 0.0, 0.0));
        float c = hash3(i + vec3(0.0, 1.0, 0.0));
        float d = hash3(i + vec3(1.0, 1.0, 0.0));
        float e = hash3(i + vec3(0.0, 0.0, 1.0));
        float g = hash3(i + vec3(1.0, 0.0, 1.0));
        float h = hash3(i + vec3(0.0, 1.0, 1.0));
        float k = hash3(i + vec3(1.0, 1.0, 1.0));
        return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
      }

      float fbm3(vec3 p) {
        float val = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
          val += noise3(p) * amp;
          p *= 2.0;
          amp *= 0.5;
        }
        return val;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 dir = normalize(vLocalDirection);
        float lat = abs(dir.y);

        // Earth Palettes
        vec3 deepOcean = vec3(0.02, 0.08, 0.24);
        vec3 coastWater = vec3(0.05, 0.22, 0.42);
        vec3 temperateLand = vec3(0.12, 0.32, 0.16);
        vec3 denseForest = vec3(0.06, 0.22, 0.10);
        vec3 aridDesert = vec3(0.68, 0.52, 0.28);
        vec3 mountainRock = vec3(0.42, 0.36, 0.32);
        vec3 polarIce = vec3(0.94, 0.97, 1.0);

        // Continent Mask
        float continentBase = fbm3(dir * 1.85);
        float continentDetail = fbm3(dir * 4.2 + vec3(12.0, 5.0, 8.0));
        float continent = continentBase * 0.75 + continentDetail * 0.25;

        float isLand = smoothstep(0.52, 0.56, continent);

        // Ocean Gradient
        float oceanDepth = fbm3(dir * 6.0);
        vec3 oceanColor = mix(deepOcean, coastWater, smoothstep(0.35, 0.70, oceanDepth));

        // Land Vegetation / Desert Gradient
        float elevation = fbm3(dir * 7.0 + vec3(4.0, 9.0, 2.0));
        vec3 landColor = mix(temperateLand, denseForest, smoothstep(0.45, 0.75, elevation));
        landColor = mix(landColor, aridDesert, (1.0 - smoothstep(0.15, 0.55, lat)) * smoothstep(0.30, 0.65, elevation));
        landColor = mix(landColor, mountainRock, smoothstep(0.72, 0.90, elevation));

        vec3 surface = mix(oceanColor, landColor, isLand);

        // Polar Ice Caps
        float iceMask = smoothstep(0.80, 0.96, lat);
        surface = mix(surface, polarIce, iceMask * 0.95);

        // Dynamic Solar Day/Night Lighting
        vec3 sunDir = normalize(uSunPosition - vWorldPosition);
        float NdotL = dot(normalize(vNormal), sunDir);
        float daylight = smoothstep(-0.10, 0.28, NdotL);
        float diffuse = max(0.0, NdotL);
        float dayIntensity = 0.22 + pow(diffuse, 0.70) * 0.90;

        surface *= dayIntensity;

        gl_FragColor = vec4(surface, 1.0);
      }
    `,
    transparent: false,
    depthTest: true,
    depthWrite: true
  });
}

// ============================================================================
// 8. VENUS PROCEDURAL MATERIAL (Dense Sulfuric Atmosphere)
// ============================================================================

export function createVenusMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunPosition: { value: new THREE.Vector3(0, 0, 0) }
    },
    vertexShader: commonVertexShader,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vLocalDirection;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      uniform vec3 uSunPosition;

      float hash3(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash3(i);
        float b = hash3(i + vec3(1.0, 0.0, 0.0));
        float c = hash3(i + vec3(0.0, 1.0, 0.0));
        float d = hash3(i + vec3(1.0, 1.0, 0.0));
        float e = hash3(i + vec3(0.0, 0.0, 1.0));
        float g = hash3(i + vec3(1.0, 0.0, 1.0));
        float h = hash3(i + vec3(0.0, 1.0, 1.0));
        float k = hash3(i + vec3(1.0, 1.0, 1.0));
        return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
      }

      float fbm3(vec3 p) {
        float val = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
          val += noise3(p) * amp;
          p *= 2.0;
          amp *= 0.5;
        }
        return val;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 dir = normalize(vLocalDirection);

        vec3 deepAmber = vec3(0.48, 0.28, 0.10);
        vec3 goldenHaze = vec3(0.76, 0.52, 0.24);
        vec3 creamyCloud = vec3(0.92, 0.78, 0.48);
        vec3 paleYellow = vec3(0.98, 0.88, 0.62);

        float clouds = fbm3(dir * 4.5);
        float bands = sin(dir.y * 24.0 + clouds * 2.0) * 0.5 + 0.5;
        float swirl = fbm3(dir * 12.0);

        float mixVal = clouds * 0.45 + bands * 0.35 + swirl * 0.20;

        vec3 surface = mix(deepAmber, goldenHaze, smoothstep(0.20, 0.52, mixVal));
        surface = mix(surface, creamyCloud, smoothstep(0.48, 0.78, mixVal) * 0.80);
        surface = mix(surface, paleYellow, smoothstep(0.72, 0.95, mixVal) * 0.40);

        vec3 sunDir = normalize(uSunPosition - vWorldPosition);
        float NdotL = dot(normalize(vNormal), sunDir);
        float daylight = smoothstep(-0.10, 0.26, NdotL);
        float diffuse = max(0.0, NdotL);
        float dayIntensity = 0.20 + pow(diffuse, 0.70) * 0.88;

        surface *= dayIntensity;

        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float limb = pow(1.0 - max(0.0, dot(normalize(vNormal), viewDir)), 3.0);
        surface += vec3(0.95, 0.82, 0.45) * limb * 0.22 * daylight;

        gl_FragColor = vec4(surface, 1.0);
      }
    `,
    transparent: false,
    depthTest: true,
    depthWrite: true
  });
}

// ============================================================================
// 9. MERCURY PROCEDURAL MATERIAL (Cratered Silicate)
// ============================================================================

export function createMercuryMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunPosition: { value: new THREE.Vector3(0, 0, 0) }
    },
    vertexShader: commonVertexShader,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vLocalDirection;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      uniform vec3 uSunPosition;

      float hash3(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash3(i);
        float b = hash3(i + vec3(1.0, 0.0, 0.0));
        float c = hash3(i + vec3(0.0, 1.0, 0.0));
        float d = hash3(i + vec3(1.0, 1.0, 0.0));
        float e = hash3(i + vec3(0.0, 0.0, 1.0));
        float g = hash3(i + vec3(1.0, 0.0, 1.0));
        float h = hash3(i + vec3(0.0, 1.0, 1.0));
        float k = hash3(i + vec3(1.0, 1.0, 1.0));
        return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
      }

      float fbm3(vec3 p) {
        float val = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
          val += noise3(p) * amp;
          p *= 2.0;
          amp *= 0.5;
        }
        return val;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 dir = normalize(vLocalDirection);

        vec3 deepRock = vec3(0.18, 0.17, 0.16);
        vec3 midRock = vec3(0.42, 0.41, 0.40);
        vec3 lightRock = vec3(0.68, 0.67, 0.65);
        vec3 craterRim = vec3(0.85, 0.84, 0.82);

        float terrain = fbm3(dir * 5.2);
        float craters = noise3(dir * 18.0);
        float structure = terrain * 0.70 + craters * 0.30;

        vec3 surface = mix(deepRock, midRock, smoothstep(0.20, 0.55, structure));
        surface = mix(surface, lightRock, smoothstep(0.50, 0.78, structure) * 0.75);
        surface = mix(surface, craterRim, smoothstep(0.75, 0.92, structure) * 0.35);

        vec3 sunDir = normalize(uSunPosition - vWorldPosition);
        float NdotL = dot(normalize(vNormal), sunDir);
        float daylight = smoothstep(-0.08, 0.25, NdotL);
        float diffuse = max(0.0, NdotL);
        float dayIntensity = 0.20 + pow(diffuse, 0.75) * 0.88;

        surface *= dayIntensity;

        gl_FragColor = vec4(surface, 1.0);
      }
    `,
    transparent: false,
    depthTest: true,
    depthWrite: true
  });
}

// ============================================================================
// 10. MOON PROCEDURAL MATERIAL (Maria & Highland Regolith)
// ============================================================================

export function createMoonMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunPosition: { value: new THREE.Vector3(0, 0, 0) }
    },
    vertexShader: commonVertexShader,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vLocalDirection;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      uniform vec3 uSunPosition;

      float hash3(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash3(i);
        float b = hash3(i + vec3(1.0, 0.0, 0.0));
        float c = hash3(i + vec3(0.0, 1.0, 0.0));
        float d = hash3(i + vec3(1.0, 1.0, 0.0));
        float e = hash3(i + vec3(0.0, 0.0, 1.0));
        float g = hash3(i + vec3(1.0, 0.0, 1.0));
        float h = hash3(i + vec3(0.0, 1.0, 1.0));
        float k = hash3(i + vec3(1.0, 1.0, 1.0));
        return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
      }

      float fbm3(vec3 p) {
        float val = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
          val += noise3(p) * amp;
          p *= 2.0;
          amp *= 0.5;
        }
        return val;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 dir = normalize(vLocalDirection);

        vec3 mariaDark = vec3(0.14, 0.14, 0.15);
        vec3 regolithMid = vec3(0.38, 0.38, 0.39);
        vec3 highlandLight = vec3(0.72, 0.72, 0.74);
        vec3 rayCrater = vec3(0.88, 0.88, 0.90);

        float maria = fbm3(dir * 2.2);
        float detail = noise3(dir * 14.0);
        float structure = maria * 0.72 + detail * 0.28;

        vec3 surface = mix(mariaDark, regolithMid, smoothstep(0.30, 0.58, structure));
        surface = mix(surface, highlandLight, smoothstep(0.55, 0.80, structure) * 0.75);
        surface = mix(surface, rayCrater, smoothstep(0.78, 0.94, structure) * 0.35);

        vec3 sunDir = normalize(uSunPosition - vWorldPosition);
        float NdotL = dot(normalize(vNormal), sunDir);
        float daylight = smoothstep(-0.08, 0.25, NdotL);
        float diffuse = max(0.0, NdotL);
        float dayIntensity = 0.20 + pow(diffuse, 0.75) * 0.88;

        surface *= dayIntensity;

        gl_FragColor = vec4(surface, 1.0);
      }
    `,
    transparent: false,
    depthTest: true,
    depthWrite: true
  });
}
