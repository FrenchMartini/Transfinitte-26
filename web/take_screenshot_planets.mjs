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

  console.log('Navigating to http://127.0.0.1:5173/ ...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));

  // 1. Solar system wide view showing all orbits out to Neptune
  const ssPath = path.resolve(__dirname, 'screenshot_all_planets_system.png');
  await page.screenshot({ path: ssPath });
  console.log(`Saved Solar System overview screenshot to ${ssPath}`);

  // 2. Focus on Uranus
  console.log('Selecting target: Uranus ...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[data-target="Uranus"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  const uranusPath = path.resolve(__dirname, 'screenshot_uranus_focus.png');
  await page.screenshot({ path: uranusPath });
  console.log(`Saved Uranus focus screenshot to ${uranusPath}`);

  // 3. Focus on Neptune
  console.log('Selecting target: Neptune ...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[data-target="Neptune"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  const neptunePath = path.resolve(__dirname, 'screenshot_neptune_focus.png');
  await page.screenshot({ path: neptunePath });
  console.log(`Saved Neptune focus screenshot to ${neptunePath}`);

  await browser.close();
  console.log('Done capturing screenshots!');
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
