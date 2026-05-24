import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 800 });

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Get all elements on the page
    const html = await page.content();
    
    // Log the body to see what's rendered
    const body = await page.evaluate(() => document.body.innerHTML);
    console.log('Body innerHTML (first 500 chars):', body.substring(0, 500));
    
    // Check for canvas
    const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
    console.log('Canvas elements found:', canvasCount);

  } finally {
    await browser.close();
  }
})();
