import * as THREE from 'three';

const loader = typeof document !== 'undefined' ? new THREE.TextureLoader() : null;
const textureCache = new Map<string, THREE.Texture>();

export function getTexture(url: string, isColorMap: boolean = true): THREE.Texture | null {
  if (!loader || typeof document === 'undefined') return null;

  // Convert legacy .jpg/.jpeg/.png to high-performance .webp
  const resolvedUrl = url.replace(/\.(jpeg|jpg|png)$/, '.webp');

  if (textureCache.has(resolvedUrl)) {
    return textureCache.get(resolvedUrl)!;
  }

  const isHalfTex = typeof window !== 'undefined' && window.location.search.includes('halftex');

  try {
    const tex = loader.load(
      resolvedUrl,
      (loaded) => {
        if (isColorMap) {
          loaded.colorSpace = THREE.SRGBColorSpace;
        }
        loaded.generateMipmaps = true;
        loaded.minFilter = THREE.LinearMipmapLinearFilter;
        loaded.magFilter = THREE.LinearFilter;
        loaded.anisotropy = isHalfTex ? 2 : 8;
        loaded.needsUpdate = true;
      },
      undefined,
      () => {
        // Fallback to original url if webp fails
        loader.load(url, (fallback) => {
          if (isColorMap) fallback.colorSpace = THREE.SRGBColorSpace;
          fallback.generateMipmaps = true;
          fallback.anisotropy = isHalfTex ? 2 : 8;
          textureCache.set(resolvedUrl, fallback);
        });
      }
    );

    if (isColorMap) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = isHalfTex ? 2 : 8;

    textureCache.set(resolvedUrl, tex);
    return tex;
  } catch (err) {
    console.warn('Error initiating texture load:', url, err);
    return null;
  }
}

export function disposeAllTextures(): void {
  for (const tex of textureCache.values()) {
    tex.dispose();
  }
  textureCache.clear();
}
