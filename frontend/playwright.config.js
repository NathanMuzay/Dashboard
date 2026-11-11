import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1,
  timeout: 45000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure', screenshot:'only-on-failure', video:'retain-on-failure' },
  webServer: [
    { command: 'cargo run --manifest-path ../backend/Cargo.toml', url:'http://127.0.0.1:3001/api/health', reuseExistingServer: false, timeout:120000,
      env: { DATABASE_URL: 'postgres://lumi:lumi-local@127.0.0.1:5432/lumi_e2e', LUMI_SEED_DEMO:'true', SMTP_HOST:'127.0.0.1', SMTP_PORT:'1025', SMTP_SECURITY:'local', APP_URL:'http://127.0.0.1:5174' } },
    { command: 'npm run dev -- --host 127.0.0.1', url:'http://127.0.0.1:5174', reuseExistingServer:false, timeout:30000 },
  ],
});
