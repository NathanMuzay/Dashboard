import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanWidgets, exportDashboard, parseDashboardExport } from '../src/dashboardModel.js';
const note = { id:'n',type:'notes',title:'Notes',x:1,y:1,width:6,height:2,content:'Bonjour' };
test('dashboard export round-trip preserves settings and removes tokens and unrelated fields', () => {
  const saved = parseDashboardExport(exportDashboard({ name:'Travail',widgets:[{...note, token:'secret', githubToken:'secret', clientId:'stale'}] }));
  assert.deepEqual(saved,{name:'Travail',widgets:[note]});
});
test('import rejects duplicate identities, invalid geometry, unknown types and out of range settings', () => {
  for (const widgets of [[note,note],[{...note,x:12}],[{...note,type:'unknown'}],[{...note,width:1.5}],[{...note,refreshInterval:1}]]) assert.throws(() => cleanWidgets(widgets));
  assert.throws(() => parseDashboardExport('{"version":2}'));
});
test('independent instances keep distinct content and positions', () => {
  assert.deepEqual(cleanWidgets([note,{...note,id:'other',content:'Autre',x:7}]).map(w => w.content),['Bonjour','Autre']);
});
