import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function capture() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLogs.push(`[PAGE ERROR] ${err.toString()}`));

  console.log('1. Navigating to http://127.0.0.1:5173/ (t=0 view) ...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1200));

  const screenshotPath0 = path.resolve(__dirname, 'screenshot_initial_t0.png');
  await page.screenshot({ path: screenshotPath0 });
  console.log(`Saved initial t=0 screenshot to ${screenshotPath0}`);

  // 2. Click Focus: Earth-Tug button to zoom in close to Earth, Tug, and thrusters!
  console.log('2. Clicking Focus: Earth-Tug button ...');
  await page.evaluate(() => {
    const btn = document.getElementById('btn-toggle-focus');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1200));

  const screenshotPathClose = path.resolve(__dirname, 'screenshot_earth_tug_close.png');
  await page.screenshot({ path: screenshotPathClose });
  console.log(`Saved Earth-Tug close-up screenshot to ${screenshotPathClose}`);

  // 3. Switch back to System focus and scrub timeline to Year ~2500
  console.log('3. Returning to System focus and scrubbing timeline to ~2,500 years ...');
  await page.evaluate(() => {
    const btn = document.getElementById('btn-toggle-focus');
    if (btn) btn.click();
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

  console.log('Captured Console Logs:');
  consoleLogs.forEach(log => console.log('  ', log));

  await browser.close();
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
