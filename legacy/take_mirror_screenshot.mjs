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

  console.log('1. Navigating to http://127.0.0.1:5173/ ...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // 1. Focus on L1 Day Concentrator Swarm
  console.log('2. Focusing on L1 Day Concentrator Swarm ...');
  await page.evaluate(() => {
    const l1Btn = document.querySelector('button[data-target="L1_Mirror"]');
    if (l1Btn) l1Btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  const pathL1 = path.resolve(__dirname, 'screenshot_l1_swarm.png');
  await page.screenshot({ path: pathL1 });
  console.log(`Saved L1 Day Swarm screenshot to ${pathL1}`);

  // 2. Focus on L2 Night Halo Swarm
  console.log('3. Focusing on L2 Night Halo Swarm ...');
  await page.evaluate(() => {
    const l2Btn = document.querySelector('button[data-target="L2_Swarm"]');
    if (l2Btn) l2Btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  const pathL2 = path.resolve(__dirname, 'screenshot_l2_swarm.png');
  await page.screenshot({ path: pathL2 });
  console.log(`Saved L2 Night Halo Swarm screenshot to ${pathL2}`);

  // 3. Focus on Earth-Tug System (showing Earth between L1 and L2 swarms)
  console.log('4. Focusing on Earth-Tug Complex ...');
  await page.evaluate(() => {
    const etBtn = document.querySelector('button[data-target="earth_tug"]');
    if (etBtn) etBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  const pathSystem = path.resolve(__dirname, 'screenshot_earth_dual_swarms.png');
  await page.screenshot({ path: pathSystem });
  console.log(`Saved Earth Dual Swarms screenshot to ${pathSystem}`);

  await browser.close();
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
