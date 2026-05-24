import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => {
    console.log('BROWSER LOG:', msg.text());
  });

  await page.setViewportSize({ width: 1200, height: 800 });

  try {
    console.log('Loading game...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    console.log('\nDone - check logs above\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();
