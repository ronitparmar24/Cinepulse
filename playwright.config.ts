import {defineConfig,devices} from '@playwright/test';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export default defineConfig({
  testDir:'./tests',testMatch:'*.spec.ts',timeout:45000,workers:1,
  use:{baseURL:'http://127.0.0.1:3101',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run start -- --port 3101',url:'http://127.0.0.1:3101/api/config',reuseExistingServer:false,timeout:60000,env:{CATALOG_MODE:'demo',DATABASE_PATH:join(tmpdir(),`cinepulse-browser-${randomUUID()}.db`),APP_ORIGIN:'http://127.0.0.1:3101',NEXT_TELEMETRY_DISABLED:'1'}},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}]
});
