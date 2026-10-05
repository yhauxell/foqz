import { _electron as electron, test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Foqz Electron Native App', () => {
  test('launches the Electron app and loads window', async () => {
    // Launch Electron via Playwright
    const electronApp = await electron.launch({
      args: [path.resolve(__dirname, '../electron/main.cjs')],
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173',
      },
    });

    try {
      // Get the main window
      const window = await electronApp.firstWindow();

      // Wait for React to mount
      await window.waitForSelector('body', { timeout: 15000 });

      // Capture native window screenshot
      await window.screenshot({ path: 'test-results/electron-native-window.png' });

      // Validate title
      const title = await window.title();
      expect(title).toBeDefined();
    } finally {
      await electronApp.close();
    }
  });
});
