import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanWidgets, exportDashboard, parseDashboardExport } from '../frontend/src/dashboardModel.js';
import { widgetConfigKey } from '../frontend/src/dashboard/widgetConfig.js';

test('POC shared frontend/API/SQL fixture preserves two independent weather configurations', () => {
  const dashboard = JSON.parse(readFileSync(new URL('./dashboard.json', import.meta.url), 'utf8'));
  assert.deepEqual(cleanWidgets(dashboard.widgets), dashboard.widgets);
  assert.deepEqual(parseDashboardExport(exportDashboard(dashboard)), dashboard);
  assert.notEqual(widgetConfigKey(dashboard.widgets[0]), widgetConfigKey(dashboard.widgets[1]));
});
