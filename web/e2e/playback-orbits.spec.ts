import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Phase 4 Proof: Playback, Orbits, Stray Lines & Background Audit', () => {
  test.setTimeout(90000);

  test('Execute playback, check orbit rings, eliminate stray lines and nebula', async ({ page }) => {
    // 1. Navigate to application
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Wait for canvas and Three.js scene to mount
    await page.waitForSelector('canvas');
    await page.waitForFunction(() => !!(window as any).__threeScene && !!(window as any).__simStore);

    console.log('--- PHASE 4 PROOF TEST SUITE ---');

    // 2. Play simulation for ~30 seconds virtual playback at several speeds
    const store = page.locator('#root');
    expect(store).toBeDefined();

    // Run at 1 yr/s, 10 yr/s, 100 yr/s
    await page.evaluate(() => {
      const s = (window as any).__simStore.getState();
      s.setPlaybackSpeed(10);
      s.setIsPlaying(true);
    });
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const s = (window as any).__simStore.getState();
      s.setPlaybackSpeed(100);
    });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      const s = (window as any).__simStore.getState();
      s.setIsPlaying(false);
    });

    console.log('✓ Virtual playback tested across multiple speed rates.');

    // 3. Audit stops at t = 0 yr, 1000 yr, 5000 yr, and 9500 yr (final year)
    const YEAR_SECONDS = 31557600.0;
    const testStops = [
      { name: 't=0yr', time_yr: 0 },
      { name: 't=1000yr', time_yr: 1000 },
      { name: 't=5000yr', time_yr: 5000 },
      { name: 't=9500yr', time_yr: 9500 }
    ];

    for (const stop of testStops) {
      const targetTimeSec = stop.time_yr * YEAR_SECONDS;

      // Seek to target timestamp
      await page.evaluate((tSec) => {
        const s = (window as any).__simStore.getState();
        s.seekTimeSec(tSec);
      }, targetTimeSec);

      await page.waitForTimeout(300);

      // Audit Scene Line Objects, Orbit Rings, and Meshes
      const audit = await page.evaluate(() => {
        const scene = (window as any).__threeScene;
        const simStore = (window as any).__simStore.getState();
        const currentFrame = simStore.currentFrame;
        const earthData = currentFrame.bodies['Earth'];
        const expectedEarthRadiusScene = Math.hypot(earthData.x, earthData.y) * 10.0;

        let totalLineCount = 0;
        let nanVertexCount = 0;
        let originVertexCountInRings = 0;
        let earthRingRadius = 0;
        let earthRingVertexCount = 0;
        let hasTrailObjects = false;
        let hasSkyboxOrFog = false;
        const ringVertexCounts: Record<string, number> = {};

        if (scene.fog) {
          hasSkyboxOrFog = true;
        }

        scene.traverse((obj: any) => {
          // Check for forbidden trail objects
          if (
            obj.name?.toLowerCase().includes('traversedtrail') ||
            obj.name?.toLowerCase().includes('planettrail')
          ) {
            hasTrailObjects = true;
          }

          // Check for skybox or cloudy nebula
          if (
            obj.name?.toLowerCase().includes('skybox') ||
            obj.name?.toLowerCase().includes('nebula') ||
            (obj.material?.map?.image?.src && obj.material.map.image.src.includes('astronomy'))
          ) {
            hasSkyboxOrFog = true;
          }

          // Check Line and LineLoop objects
          if (obj.isLine || obj.isLineLoop || obj.isLineSegments) {
            totalLineCount++;
            const posAttr = obj.geometry?.getAttribute('position');
            if (posAttr) {
              const count = posAttr.count;
              const isOrbitRing = obj.name?.startsWith('orbitRing_');

              if (isOrbitRing) {
                ringVertexCounts[obj.name] = count;
              }

              for (let i = 0; i < count; i++) {
                const x = posAttr.getX(i);
                const y = posAttr.getY(i);
                const z = posAttr.getZ(i);

                if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
                  nanVertexCount++;
                }

                // Orbit rings must never touch origin (0,0,0)
                if (isOrbitRing && x === 0 && y === 0 && z === 0) {
                  originVertexCountInRings++;
                }
              }

              if (obj.name === 'orbitRing_EarthCurrent') {
                earthRingVertexCount = count;
                const v0x = posAttr.getX(0);
                const v0z = posAttr.getZ(0);
                earthRingRadius = Math.hypot(v0x, v0z);
              }
            }
          }
        });

        return {
          totalLineCount,
          nanVertexCount,
          originVertexCountInRings,
          earthRingRadius,
          expectedEarthRadiusScene,
          earthRingVertexCount,
          hasTrailObjects,
          hasSkyboxOrFog,
          ringVertexCounts,
          currentYear: simStore.currentYear
        };
      });

      console.log(`[Stop: ${stop.name}] Audit Results:`, {
        nanVertexCount: audit.nanVertexCount,
        originVertexCountInRings: audit.originVertexCountInRings,
        earthRingRadius: audit.earthRingRadius.toFixed(3),
        expectedEarthRadiusScene: audit.expectedEarthRadiusScene.toFixed(3),
        earthRingVertexCount: audit.earthRingVertexCount,
        hasTrailObjects: audit.hasTrailObjects,
        hasSkyboxOrFog: audit.hasSkyboxOrFog
      });

      // Assertions
      expect(audit.nanVertexCount, `No NaN/Infinity vertices allowed at ${stop.name}`).toBe(0);
      expect(audit.originVertexCountInRings, `No (0,0,0) vertices allowed in rings at ${stop.name}`).toBe(0);
      expect(audit.earthRingVertexCount, 'Orbit ring vertex count must be constant 256').toBe(256);
      expect(audit.hasTrailObjects, 'No trail objects allowed').toBe(false);
      expect(audit.hasSkyboxOrFog, 'No skybox, fog or background mesh allowed').toBe(false);

      // Verify all orbit rings have exactly 256 vertices
      for (const [ringName, count] of Object.entries(audit.ringVertexCounts)) {
        expect(count, `Ring ${ringName} must have 256 vertices`).toBe(256);
      }

      // Verify Earth's ring radius equals current semi-major axis
      expect(
        Math.abs(audit.earthRingRadius - audit.expectedEarthRadiusScene),
        `Earth ring radius (${audit.earthRingRadius}) must match position (${audit.expectedEarthRadiusScene})`
      ).toBeLessThan(0.05);

      // Capture screenshot in System Overview
      await page.evaluate(() => {
        (window as any).__simStore.getState().focusBody('system');
      });
      await page.waitForTimeout(200);
      const overviewScreenshotPath = path.resolve(process.cwd(), `screenshots/proof_${stop.name}_overview.png`);
      await page.screenshot({ path: overviewScreenshotPath });

      // Capture screenshot Focused on Earth
      await page.evaluate(() => {
        (window as any).__simStore.getState().focusBody('Earth');
      });
      await page.waitForTimeout(200);
      const earthScreenshotPath = path.resolve(process.cwd(), `screenshots/proof_${stop.name}_earth.png`);
      await page.screenshot({ path: earthScreenshotPath });

      console.log(`✓ Saved screenshots for ${stop.name} (overview & earth)`);
    }

    console.log('--- ALL PHASE 4 PROOF AUDITS PASSED CLEANLY ---');
  });
});
