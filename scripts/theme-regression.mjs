import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import postcss from 'postcss';
const source = fs.readFileSync('components/settings/settings-space.tsx', 'utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, '');
const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } }).outputText;
function mount(saved) {
  let stored = saved, current = saved ?? 'editorial', states = [], cursor = 0, effects = [], writes = [];
  const context = { exports: {}, React: { createElement: () => null }, useInterfaceSound: () => ({}),
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], v => { states[i] = v; }]; },
    useEffect(fn) { effects.push(fn); },
    window: { localStorage: { getItem: () => stored, setItem: (_, v) => { stored = v; writes.push(v); } } },
    document: { documentElement: { getAttribute: () => current, setAttribute: (_, v) => { current = v; } } },
  };
  vm.runInNewContext(js, context);
  context.exports.SettingsSpace({ section: 'unused' });
  effects.forEach(fn => fn());
  // React StrictMode replays mount effects before processing their state updates.
  effects.forEach(fn => fn());
  return { current, stored, writes };
}
for (const saved of ['editorial', 'tactile', 'darkroom', null]) {
  const result = mount(saved);
  assert.equal(result.current, saved ?? 'editorial', `opening settings changed ${saved} theme`);
  assert.ok(result.writes.every(v => v === (saved ?? 'editorial')), 'mount overwrote saved preference');
}
console.log('PASS: settings mount and StrictMode replay preserve all themes; fresh default is editorial');

// Resolve the root theme rules in source order, including the default fallback.
const css = postcss.parse(fs.readFileSync('app/globals.css', 'utf8'));
function palette(studio) {
  const values = {};
  for (const rule of css.nodes) {
    if (rule.type !== 'rule') continue;
    const matches = rule.selectors.some(selector =>
      selector === ':root' ||
      (selector === ':root:not([data-studio])' && studio === null) ||
      selector === `[data-studio="${studio}"]`
    );
    if (matches) rule.walkDecls(decl => { values[decl.prop] = decl.value; });
  }
  return [values['--paper'], values['--accent'], values['color-scheme']];
}
assert.deepEqual(palette('darkroom'), ['#030712', '#7c3aed', 'dark']);
assert.deepEqual(palette('editorial'), ['#f7f4ed', '#c8321e', 'light']);
assert.deepEqual(palette('tactile'), ['#141619', '#ff5722', 'dark']);
assert.deepEqual(palette(null), palette('editorial'));
console.log('PASS: three distinct theme palettes; fallback uses editorial');
