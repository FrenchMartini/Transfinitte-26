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

  console.log('1. Navigating to http://localhost:5173/ (t=0 view) ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1200));

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

  console.log('Captured Console Logs:');
  consoleLogs.forEach(log => console.log('  ', log));

  await browser.close();
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
