import { test, expect } from '@playwright/test';
import * as path from 'path';

test('Verify fonts and capture 1280x800 screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'networkidle' });

  // Await fonts ready
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const fontAudit = await page.evaluate(() => {
    const sansCheck = document.fonts.check('13px "Open Sans"');
    const serifCheck = document.fonts.check('13px "Roboto Slab"');

    const titleEl = document.querySelector('header span');
    const buttonEl = document.querySelector('button');
    const selectEl = document.querySelector('[aria-label="Target Focus"]') || document.querySelector('button');
    const readoutEl = document.querySelector('.mono');

    return {
      sansCheck,
      serifCheck,
      pageTitleFont: titleEl ? window.getComputedStyle(titleEl).fontFamily : '',
      buttonFont: buttonEl ? window.getComputedStyle(buttonEl).fontFamily : '',
      selectFont: selectEl ? window.getComputedStyle(selectEl).fontFamily : '',
      numericReadoutFont: readoutEl ? window.getComputedStyle(readoutEl).fontFamily : ''
    };
  });

  console.log('--- FONT AUDIT RESULTS ---');
  console.log('document.fonts.check(\x2713px "Open Sans"\x27):', fontAudit.sansCheck);
  console.log('document.fonts.check(\x2713px "Roboto Slab"\x27):', fontAudit.serifCheck);
  console.log('Page Title fontFamily:', fontAudit.pageTitleFont);
  console.log('Button fontFamily:', fontAudit.buttonFont);
  console.log('Select fontFamily:', fontAudit.selectFont);
  console.log('Numeric Readout fontFamily:', fontAudit.numericReadoutFont);
  console.log('--------------------------');

  expect(fontAudit.sansCheck, 'Open Sans must be loaded').toBe(true);
  expect(fontAudit.serifCheck, 'Roboto Slab must be loaded').toBe(true);
  expect(fontAudit.pageTitleFont).toContain('Open Sans');
  expect(fontAudit.buttonFont).toContain('Open Sans');
  expect(fontAudit.selectFont).toContain('Open Sans');
  expect(fontAudit.numericReadoutFont).toContain('Roboto Slab');

  const screenshotPath = path.join(process.cwd(), 'screenshots', '1280x800_landscape.png');
  await page.screenshot({ path: screenshotPath });
});
