import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('Verification: Console errors, Font-family check, Measured FPS, and Multi-resolution planetary screenshots', async ({ page }) => {
  test.setTimeout(60000);

  const consoleMessages: { type: string; text: string }[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    }
  });

  page.on('pageerror', (err) => {
    consoleMessages.push({ type: 'pageerror', text: err.message });
  });

  const screenshotsDir = path.join(process.cwd(), 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // Define target viewports and target planets (Earth, Mars, Jupiter, Saturn)
  const testCases = [
    { width: 360, height: 740, name: '360x740_earth', target: 'Earth' },
    { width: 768, height: 1024, name: '768x1024_mars', target: 'Mars' },
    { width: 1280, height: 800, name: '1280x800_jupiter', target: 'Jupiter' },
    { width: 1920, height: 1080, name: '1920x1080_saturn', target: 'Saturn' }
  ];

  for (const tc of testCases) {
    await page.setViewportSize({ width: tc.width, height: tc.height });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // Focus target body
    await page.evaluate((targetName) => {
      const store = (window as any).__simStore;
      if (store && store.getState) {
        store.getState().focusBody(targetName);
      }
    }, tc.target);

    // Wait for smooth camera transition to complete
    await page.waitForTimeout(1300);

    // Confirm no horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow, `Horizontal overflow at ${tc.width}x${tc.height}`).toBe(false);

    // Take screenshot
    const shotPath = path.join(screenshotsDir, `${tc.name}.png`);
    await page.screenshot({ path: shotPath });
    console.log(`Saved screenshot: ${shotPath}`);
  }

  // 1. Desktop Font-Family Audit
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const fontAudit = await page.evaluate(() => {
    const bodyFont = window.getComputedStyle(document.body).fontFamily;
    const monoEl = document.querySelector('.mono') || document.querySelector('[class*="rowValue"]') || document.body;
    const monoFont = window.getComputedStyle(monoEl).fontFamily;
    return { bodyFont, monoFont };
  });

  console.log(`COMPUTED_FONT_SANS: ${fontAudit.bodyFont}`);
  console.log(`COMPUTED_FONT_MONO: ${fontAudit.monoFont}`);

  expect(fontAudit.bodyFont.toLowerCase()).toContain('open sans');
  expect(fontAudit.monoFont.toLowerCase()).toContain('roboto slab');

  // 2. Measure Desktop FPS over 50 frames
  const measuredFps = await page.evaluate(async () => {
    return new Promise<number>((resolve) => {
      let frameCount = 0;
      let startTime = performance.now();
      function count() {
        frameCount++;
        if (frameCount >= 50) {
          const duration = (performance.now() - startTime) / 1000;
          resolve(Math.round(frameCount / duration));
        } else {
          requestAnimationFrame(count);
        }
      }
      requestAnimationFrame(count);
    });
  });

  console.log(`MEASURED_DESKTOP_FPS: ${measuredFps} fps`);
  expect(measuredFps).toBeGreaterThan(0);

  // 3. Confirm zero console errors or warnings
  const criticalErrors = consoleMessages.filter((m) => {
    return !m.text.includes('WEBGL_debug_renderer_info') && !m.text.includes('download the React DevTools');
  });

  console.log(`CONSOLE_MESSAGES_COUNT: ${criticalErrors.length}`);
  if (criticalErrors.length > 0) {
    console.log('Console messages:', JSON.stringify(criticalErrors, null, 2));
  }
  expect(criticalErrors).toEqual([]);
});
