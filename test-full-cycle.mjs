import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 800 });

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Get all canvas elements and try to find clickable areas
    // The button should be in the top-right area - let's try clicking there
    console.log('Attempting to click time advance button...');

    // Try clicking at button coordinates (found from earlier observation)
    const positions = [
      { x: 663, y: 16, label: 'time button area' }
    ];

    for (const pos of positions) {
      try {
        console.log(`Trying click at ${pos.x}, ${pos.y} (${pos.label})`);
        await page.click('body'); // First get focus
        await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });

        // Try to get the actual button element by searching the document
        const result = await page.evaluate(() => {
          // Since it's Phaser canvas, we can't directly click buttons
          // But we can trigger the clock tick programmatically if we have access
          return 'Canvas-based UI detected';
        });
        console.log(result);
      } catch (e) {
        console.log('Could not interact with canvas');
      }
    }

    console.log('Taking final screenshot...');
    await page.screenshot({ path: 'test-final.png' });

  } finally {
    await browser.close();
  }
})();
