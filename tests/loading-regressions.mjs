import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.createSourceFile('App.tsx', readFileSync('src/App.tsx', 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = source.statements.filter(ts.isFunctionDeclaration);
const app = functions.find(node => node.name?.text === 'App');
const reports = functions.find(node => node.name?.text === 'Reports');
function find(node, predicate) {
  if (predicate(node)) return node;
  return ts.forEachChild(node, child => find(child, predicate));
}
const effects = app.body.statements.filter(ts.isExpressionStatement)
  .map(node => node.expression)
  .filter(node => ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect');
const businessEffect = effects.find(node => node.arguments[0].getText(source).includes('void loadBusiness()'));
assert.ok(businessEffect, 'Business loading must have its own effect');
assert.equal(businessEffect.arguments[1].getText(source), '[session, loadBusiness]');
assert.ok(effects.some(node => node.arguments[1]?.getText(source) === '[load]'),
  'Daily data must load independently');

const loadNode = find(reports, node => ts.isVariableDeclaration(node) && node.name.getText(source) === 'load');
const callback = loadNode.initializer.arguments[0].getText(source);
const pending = [];
const state = { sales: [], error: '', loading: false };
const gate = { current: { version: 0 } };
const query = new Proxy({}, { get(_target, key) {
  if (key === 'then') return (resolve) => { pending.push(resolve); };
  return () => query;
}});
const context = vm.createContext({
  supabase: { from: () => query }, reportRequests: gate,
  business: { id: 1 }, dateRange: { start: '2026-09-01', end: '2026-09-01' },
  view: 'daily',
  setSales: value => { state.sales = value; },
  setReportError: value => { state.error = value; },
  setLoadingReports: value => { state.loading = value; },
});
const compiled = ts.transpileModule('(' + callback + ')', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const load = vm.runInContext(compiled, context);
const older = load();
await Promise.resolve();
const latest = load();
await Promise.resolve();
pending[1]({ data: ['latest date'], error: null });
await latest;
pending[0]({ data: ['older date'], error: { message: 'stale error' } });
await older;
assert.deepEqual(state.sales, ['latest date']);
assert.equal(state.error, '');
assert.equal(state.loading, false);
const abandoned = load();
await Promise.resolve();
++gate.current.version;
pending[2]({ data: ['unmounted view'], error: null });
await abandoned;
assert.equal(state.sales.length, 0, 'Cleanup invalidates abandoned results');
console.log('PASS: separate loading effects; stale report data/errors ignored; abandoned view ignored.');
