import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const viewports = [
  { width: 360, height: 740, name: '360x740_portrait' },
  { width: 740, height: 360, name: '740x360_landscape' },
  { width: 768, height: 1024, name: '768x1024_portrait' },
  { width: 1024, height: 768, name: '1024x768_landscape' },
  { width: 1280, height: 800, name: '1280x800_landscape' },
  { width: 800, height: 1280, name: '800x1280_portrait' },
  { width: 1920, height: 1080, name: '1920x1080_landscape' },
  { width: 1080, height: 1920, name: '1080x1920_portrait' }
];

test.beforeAll(() => {
  const dir = path.join(process.cwd(), 'screenshots');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

for (const vp of viewports) {
  test(`Capture screenshot and audit layout at ${vp.width}x${vp.height} (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.waitForTimeout(500);

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll, `Horizontal scroll detected at ${vp.width}x${vp.height}`).toBe(false);

    const screenshotPath = path.join(process.cwd(), 'screenshots', `${vp.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
  });
}

test('Audit single-line text constraint at 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const wrappedElements = await page.evaluate(() => {
    const results: string[] = [];
    const elements = document.querySelectorAll<HTMLElement>(
      'header *, aside *, footer *, [class*="dataRow"] *'
    );

    for (const el of elements) {
      if (el.children.length > 0) continue;
      const text = el.textContent?.trim();
      if (!text) continue;
      if (text.includes('UTC') || text.includes('00:00:00') || el.closest('[class*="dateReadout"]')) {
        continue;
      }

      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = Array.from(range.getClientRects());
      if (rects.length <= 1) continue;

      // Multiple lines only if rects have different vertical positions (wrapped lines)
      const firstTop = rects[0].top;
      const hasWrappedLine = rects.some((r) => Math.abs(r.top - firstTop) > 5);

      if (hasWrappedLine) {
        results.push(`"${text}" (wrapped across vertical lines)`);
      }
    }
    return results;
  });

  expect(wrappedElements, `Elements wrapped to >1 line at 1280px: ${wrappedElements.join(', ')}`).toEqual([]);
});
