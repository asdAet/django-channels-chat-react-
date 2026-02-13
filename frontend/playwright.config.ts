import { defineConfig, devices } from '@playwright/test'

const backendPython = process.platform === 'win32' ? '.\\.venv\\Scripts\\python.exe' : 'python'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: `${backendPython} manage.py migrate && ${backendPython} manage.py runserver 127.0.0.1:8000`,
      url: 'http://127.0.0.1:8000/api/health/live/',
      cwd: '../backend',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      cwd: '.',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
