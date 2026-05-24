import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Set viewport to match game expectations
  await page.setViewportSize({ width: 1200, height: 800 });

  try {
    console.log('Loading game...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // Wait for game to initialize

    console.log('Taking screenshot at initial time...');
    await page.screenshot({ path: 'test-initial.png' });

    // Find the +1hr dev button and click it 6 times to cycle through times
    const advanceBtn = page.locator('button:has-text("1h")').first();

    if (await advanceBtn.isVisible()) {
      console.log('Found +1hr button, cycling through times...');

      for (let i = 0; i < 24; i++) {
        await page.waitForTimeout(200); // Let animation settle

        // Take screenshots at interesting times
        if (i === 6) {
          console.log(`Time shift +${i}h: Taking daytime screenshot...`);
          await page.screenshot({ path: 'test-daytime.png' });
        } else if (i === 12) {
          console.log(`Time shift +${i}h: Taking sunset screenshot...`);
          await page.screenshot({ path: 'test-sunset.png' });
        } else if (i === 18) {
          console.log(`Time shift +${i}h: Taking night screenshot...`);
          await page.screenshot({ path: 'test-night.png' });
        }

        // Click the advance button
        await advanceBtn.click();
      }
    } else {
      console.log('Could not find +1hr button');
      await page.screenshot({ path: 'test-no-button.png' });
    }

    console.log('Test complete!');
    console.log('Screenshots saved: test-initial.png, test-daytime.png, test-sunset.png, test-night.png');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();
