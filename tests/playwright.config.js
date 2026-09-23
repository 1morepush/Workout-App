// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries. A test that fails once has found something; rerunning until it
  // passes hides exactly the timing bugs this app has had.
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    // The app is used one-handed on a phone, so that is what the tests see.
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    locale: 'en-US',
    // West of UTC on purpose: evening sessions used to be filed under tomorrow.
    timezoneId: 'America/New_York',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // Claude Code on the web ships its own Chromium; point at it with CHROMIUM_PATH
    // instead of downloading one. CI installs the matching browser normally.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
});
