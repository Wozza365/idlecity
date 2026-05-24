import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setViewportSize({ width: 1200, height: 800 });

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    console.log('Taking screenshot at initial time...');
    await page.screenshot({ path: 'test-fixed-initial.png' });

  } finally {
    await browser.close();
  }
})();
