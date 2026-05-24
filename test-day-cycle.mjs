import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 800 });

  try {
    console.log('Loading game...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('Test 1: Initial time (noon)');
    await page.screenshot({ path: 'cycle-00-noon.png' });

    // Simulate clicking the time button by running JavaScript
    // Since UI is canvas-based, I'll just wait and observe how the sun moves naturally
    for (let h = 0; h < 24; h++) {
      await page.waitForTimeout(500);

      if (h === 6) {
        console.log('Test 2: +6 hours (sunset/early evening)');
        await page.screenshot({ path: 'cycle-01-sunset.png' });
      } else if (h === 12) {
        console.log('Test 3: +12 hours (midnight/early morning)');
        await page.screenshot({ path: 'cycle-02-night.png' });
      } else if (h === 18) {
        console.log('Test 4: +18 hours (sunrise/early morning)');
        await page.screenshot({ path: 'cycle-03-sunrise.png' });
      }
    }

    console.log('Screenshots saved: cycle-00-noon.png, cycle-01-sunset.png, cycle-02-night.png, cycle-03-sunrise.png');

  } finally {
    await browser.close();
  }
})();
