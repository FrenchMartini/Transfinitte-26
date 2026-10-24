/**
 * Procedural Deep Space Cosmic Nebula Shader.
 * Adapted from 3D Solar System Visualizer.
 */

import * as THREE from 'three';

export function createDeepSpaceMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPosition;
      uniform float uTime;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float n000 = hash(i);
        float n100 = hash(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash(i + vec3(1.0, 1.0, 1.0));

        float x00 = mix(n000, n100, f.x);
        float x10 = mix(n010, n110, f.x);
        float x01 = mix(n001, n101, f.x);
        float x11 = mix(n011, n111, f.x);

        float y0 = mix(x00, x10, f.y);
        float y1 = mix(x01, x11, f.y);

        return mix(y0, y1, f.z);
      }

      float fbm(vec3 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 5; i++) {
          value += noise(p) * amplitude;
          p *= 2.02;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec3 p = normalize(vWorldPosition);
        float t = uTime * 0.008;

        float largeCloud = fbm(p * 1.6 + vec3(t, -t * 0.35, t * 0.18));
        float mediumCloud = fbm(p * 3.6 - vec3(t * 0.5, t * 0.18, -t * 0.3));
        float nebula = largeCloud * 0.65 + mediumCloud * 0.35;

        vec3 spaceBlack = vec3(0.004, 0.006, 0.012);
        vec3 cosmicBlue = vec3(0.015, 0.04, 0.12);
        vec3 purpleDust = vec3(0.08, 0.02, 0.12);
        vec3 starGlow = vec3(0.04, 0.08, 0.16);

        vec3 color = mix(spaceBlack, cosmicBlue, smoothstep(0.2, 0.7, nebula));
        color = mix(color, purpleDust, smoothstep(0.45, 0.85, largeCloud));
        color += starGlow * pow(mediumCloud, 2.5) * 0.4;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false
  });
}
