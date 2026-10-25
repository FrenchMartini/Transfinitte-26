import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    launchOptions: {
      args: [
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--disable-gpu-vsync'
      ]
    }
  },
  webServer: {
    command: 'pnpm preview --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI
  }
});
