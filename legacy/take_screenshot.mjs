import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function capture() {
  const possiblePaths = [
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  const executablePath = possiblePaths.find(p => fs.existsSync(p));

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLogs.push(`[PAGE ERROR] ${err.toString()}`));
  console.log('1. Navigating to http://127.0.0.1:5173/ (t=0 view) ...');
  try {
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  await new Promise(r => setTimeout(r, 2000));

  // 1. Initial overview
  const screenshotPath0 = path.resolve(__dirname, 'screenshot_visualizer_initial.png');
  await page.screenshot({ path: screenshotPath0 });
  console.log(`Saved initial visualizer screenshot to ${screenshotPath0}`);

  const targets = [
    { name: 'Earth', file: 'current_Earth.png' },
    { name: 'Mars', file: 'current_Mars.png' },
    { name: 'Jupiter', file: 'current_Jupiter.png' },
    { name: 'Saturn', file: 'current_Saturn.png' },
    { name: 'Sun', file: 'current_Sun.png' }
  ];

  for (const t of targets) {
    console.log(`Focusing on ${t.name}...`);
    await page.evaluate((targetName) => {
      const btn = document.querySelector(`.target-item-btn[data-target="${targetName}"]`) ||
                  document.querySelector(`.sidebar-item-btn[data-target="${targetName}"]`);
      if (btn) btn.click();
    }, t.name);
    await new Promise(r => setTimeout(r, 1200));
    const p = path.resolve(__dirname, t.file);
    await page.screenshot({ path: p });
    console.log(`Saved screenshot to ${p}`);
  }

  // 2. Click Focus target: Ceres Tug & Quarry to inspect drill, quarry asteroid, storage hoppers and plasma jet
  console.log('2. Clicking Focus: Ceres Tug & Quarry button ...');
  await page.evaluate(() => {
    // Open target dropdown and select Tug
    const tugBtn = document.querySelector('button[data-target="Tug"]');
    if (tugBtn) {
      tugBtn.click();
    } else {
      const btn = document.getElementById('btn-toggle-focus');
      if (btn) btn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  const screenshotPathClose = path.resolve(__dirname, 'screenshot_earth_tug_close.png');
  await page.screenshot({ path: screenshotPathClose });
  console.log(`Saved Earth-Tug close-up screenshot to ${screenshotPathClose}`);

  // 2b. Click Focus target: L1 Climate Mirror to inspect gossamer solar concentrator & sunbeam warming Earth
  console.log('2b. Clicking Focus: L1 Climate Mirror button ...');
  await page.evaluate(() => {
    const mirrorBtn = document.querySelector('button[data-target="L1_Mirror"]');
    if (mirrorBtn) mirrorBtn.click();
  });
  await new Promise(r => setTimeout(r, 1200));

  const screenshotPathMirror = path.resolve(__dirname, 'screenshot_l1_mirror.png');
  await page.screenshot({ path: screenshotPathMirror });
  console.log(`Saved L1 Climate Mirror close-up screenshot to ${screenshotPathMirror}`);

  // 3. Switch back to System focus and scrub timeline to Year ~2500
  console.log('3. Returning to System focus and scrubbing timeline to ~2,500 years ...');
  await page.evaluate(() => {
    const sysBtn = document.querySelector('button[data-target="system"]');
    if (sysBtn) sysBtn.click();
    const scrubber = document.getElementById('timeline-scrubber');
    if (scrubber) {
      scrubber.value = '260'; // ~26% of 9566 years = ~2500 years
      scrubber.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  const screenshotPathTraversed = path.resolve(__dirname, 'screenshot_traversed_mid.png');
  await page.screenshot({ path: screenshotPathTraversed });
  console.log(`Saved traversed screenshot to ${screenshotPathTraversed}`);

  // 4. Click Benchmarks button to display Hackathon §6 Validation Benchmarks table
  console.log('4. Clicking Benchmarks button ...');
  await page.evaluate(() => {
    const btn = document.getElementById('btn-benchmarks');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const screenshotPathBenchmarks = path.resolve(__dirname, 'screenshot_benchmarks_modal.png');
  await page.screenshot({ path: screenshotPathBenchmarks });
  console.log(`Saved benchmarks modal screenshot to ${screenshotPathBenchmarks}`);

  // 4b. Click Canting Protection button to display Out-of-Ecliptic Two-Cone Canting modal
  console.log('4b. Clicking Canting Protection button ...');
  await page.evaluate(() => {
    // First close benchmarks if open
    const bmClose = document.getElementById('btn-close-benchmarks');
    if (bmClose) bmClose.click();
    const btnCanting = document.getElementById('btn-canting-modal');
    if (btnCanting) btnCanting.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const screenshotPathCanting = path.resolve(__dirname, 'screenshot_canting_modal.png');
  await page.screenshot({ path: screenshotPathCanting });
  console.log(`Saved canting modal screenshot to ${screenshotPathCanting}`);

  // 4c. Close modal and focus on Earth-Tug system to clearly see the two plume corridors clearing Earth
  console.log('4c. Focusing on Earth-Tug System ...');
  await page.evaluate(() => {
    const cantingClose = document.getElementById('btn-close-canting');
    if (cantingClose) cantingClose.click();
    const earthTugBtn = document.querySelector('button[data-target="earth_tug"]');
    if (earthTugBtn) earthTugBtn.click();
  });
  await new Promise(r => setTimeout(r, 1200));

  const screenshotPathEarthTug = path.resolve(__dirname, 'screenshot_earth_tug_bypass.png');
  await page.screenshot({ path: screenshotPathEarthTug });
  console.log(`Saved earth tug bypass screenshot to ${screenshotPathEarthTug}`);

  console.log('Captured Console Logs:');
  consoleLogs.forEach(log => console.log('  ', log));

  await browser.close();
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
