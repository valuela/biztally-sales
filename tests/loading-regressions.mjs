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

const inventory = functions.find(node => node.name?.text === 'StockPage');
const remainingNode = find(inventory, node => ts.isVariableDeclaration(node) && node.name.getText(source) === 'sellingRemaining');
const remaining = vm.runInNewContext(ts.transpileModule('(' + remainingNode.initializer.getText(source) + ')', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, {
  offeringStock: { 1: 2, 3: 4 },
  remainingByVariant: new Map([[1, 14], [2, 12]]),
  componentDemand: item => item.id === 3
    ? [{ component_variant_id: 1, quantity: 3 }, { component_variant_id: 2, quantity: 3 }]
    : [{ component_variant_id: item.id, quantity: 1 }],
});
assert.equal(remaining({ id: 1 }), 2, 'Loose pieces must not include pack contents');
assert.equal(remaining({ id: 2 }), 0, 'Unselected flavors must not appear as loose stock');
assert.equal(remaining({ id: 3 }), 4, 'Mixed packs must count as packs, not pieces');
console.log('PASS: Inventory displays 2 loose pieces and 4 mixed packs, not 26 total pieces.');

const sell = functions.find(node => node.name?.text === 'Sell');
const availabilityNode = find(sell, node => ts.isFunctionDeclaration(node) && node.name?.text === 'availableFor');
const availableFor = vm.runInNewContext(ts.transpileModule('(' + availabilityNode.getText(source) + ')', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, { offeringStock: { 3: 5, 4: 2 }, cart: {} });
assert.equal(availableFor({ id: 3 }, { 4: { quantity: 2 } }), 5, 'Nuts packs must not reduce mixed packs');
assert.equal(availableFor({ id: 4 }, { 4: { quantity: 2 } }), 0, 'Cannot exceed this pack count');
assert.equal(availableFor({ id: 3 }, { 3: { quantity: 5 } }), 0);
assert.match(source.text, /variants\.filter\(variant => Object\.hasOwn\(dayVariantStock, variant\.id\)\)/,
  'Keep zero-stock offerings visible without including unselected products');
console.log('PASS: independent pack selection and persistent sold-out offerings.');

const stockLabelNode = find(source, node => ts.isVariableDeclaration(node) && node.name.getText(source) === 'stockLabel');
const stockLabel = vm.runInNewContext(ts.transpileModule('(' + stockLabelNode.initializer.getText(source) + ')', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText);
assert.equal(stockLabel(7, { package_quantity: 5 }), '7 packs');
assert.equal(stockLabel(7, { package_quantity: 1 }), '7 pcs');
assert.doesNotMatch(source.text, /Remaining pieces:|Stock will be shared across pieces and packs/);
console.log('PASS: simple independent item labels without combined piece totals.');
