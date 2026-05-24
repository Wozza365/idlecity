import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setViewportSize({ width: 1200, height: 800 });

  try {
    console.log('Loading game...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('Taking initial screenshot at 12:13...');
    await page.screenshot({ path: 'test-initial.png' });

    // Find all buttons and log them
    const buttons = await page.locator('button').allTextContents();
    console.log('Available buttons:', buttons);

    // Try to find the +1hr button - it should contain "+1" and "hr"
    const timeButton = page.locator('button', { hasText: '+1 hr' });

    if (await timeButton.count() > 0) {
      console.log('Found time button!');

      // Advance time multiple times and capture screenshots
      for (let i = 0; i < 24; i++) {
        await page.waitForTimeout(300);

        if (i === 6) {
          console.log('After 6 hours (daytime around 18:13) - taking screenshot');
          await page.screenshot({ path: 'test-daytime.png' });
        } else if (i === 12) {
          console.log('After 12 hours (midnight around 00:13) - taking screenshot');
          await page.screenshot({ path: 'test-midnight.png' });
        } else if (i === 18) {
          console.log('After 18 hours (sunrise around 06:13) - taking screenshot');
          await page.screenshot({ path: 'test-sunrise.png' });
        }

        await timeButton.first().click();
      }
    } else {
      console.log('Could not find time button');
    }

    console.log('Test complete!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();
