// JSDOM runtime test — verify JS executes without errors and reactions work
const fs = require('fs');

// Mock canvas getContext
const mockCtx = new Proxy({}, {
  get(t, prop) {
    if (prop === 'canvas') return { width: 0, height: 0, style: {}, getBoundingClientRect: () => ({width:1000,height:600}) };
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
      return () => ({ addColorStop: () => {} });
    }
    if (prop === 'measureText') return () => ({ width: 10 });
    if (prop === 'setTransform') return () => {};
    return typeof t[prop] !== 'undefined' ? t[prop] : () => {};
  },
  set(t, prop, val) { t[prop] = val; return true; }
});

const stubEl = () => ({
  _children: [], _html: '', _text: '', _class: '', style: {}, dataset: {},
  appendChild(c) { this._children.push(c); return c },
  removeChild(c) {},
  addEventListener() {},
  removeEventListener() {},
  querySelectorAll() { return [] },
  querySelector() { return stubEl() },
  getBoundingClientRect() { return { width: 1000, height: 600, left: 0, top: 0 } },
  set innerHTML(v) { this._html = v }, get innerHTML() { return this._html },
  set textContent(v) { this._text = v }, get textContent() { return this._text },
  set className(v) { this._class = v }, get className() { return this._class },
  classList: { add(){}, remove(){}, toggle(){}, contains(){return false} },
  setAttribute(){}, getAttribute(){return null},
  getContext() { return mockCtx },
  options: [],
  append() {},
});

const elements = {};
const stubDoc = {
  getElementById: (id) => elements[id] || (elements[id] = stubEl()),
  querySelector: () => stubEl(),
  querySelectorAll: () => [],
  createElement: () => stubEl(),
  readyState: 'complete',
  addEventListener() {},
};
global.document = stubDoc;
global.window = {
  addEventListener() {},
  devicePixelRatio: 1,
  performance: { now: () => Date.now() },
  requestAnimationFrame: (cb) => {},
};
global.requestAnimationFrame = (cb) => {};
global.performance = { now: () => Date.now() };

const html = fs.readFileSync('/workspace/chemistry_simulator.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
const js = m[1];

const winStub = {
  addEventListener() {},
  devicePixelRatio: 1,
  performance: { now: () => Date.now() },
  requestAnimationFrame: (cb) => {},
};
const sandbox = {
  document: stubDoc,
  window: winStub,
  performance: { now: () => Date.now() },
  requestAnimationFrame: (cb) => {},
  addEventListener() {},
  console,
  setTimeout: () => {},
  Math, Date, JSON, parseInt, parseFloat, String, Number, Boolean, Array, Object,
};
sandbox.globalThis = sandbox;

const vm = require('vm');
const ctx = vm.createContext(sandbox);
const exposed = js + '\n;globalThis.SUBSTANCES=SUBSTANCES;globalThis.INSTRUMENTS=INSTRUMENTS;globalThis.REACTIONS=REACTIONS;globalThis.PRESETS=PRESETS;globalThis.SAFETY_RULES=SAFETY_RULES;globalThis.Simulator=Simulator;globalThis.sim=sim;globalThis.Container=Container;globalThis.CONFIG=CONFIG;\n';
try {
  vm.runInContext(exposed, ctx, { filename: 'chemistry_simulator.html' });
  console.log('[OK] JS executed without errors');
} catch (e) {
  console.log('[FAIL] RUNTIME ERROR:', e.message);
  console.log(e.stack.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
}

console.log('SUBSTANCES:', Object.keys(sandbox.SUBSTANCES || {}).length);
console.log('INSTRUMENTS:', Object.keys(sandbox.INSTRUMENTS || {}).length);
console.log('REACTIONS:', (sandbox.REACTIONS || []).length);
console.log('PRESETS:', (sandbox.PRESETS || []).length);

const sim = sandbox.sim;
if (!sim) { console.log('[FAIL] sim not created'); process.exit(1); }
sim.resize();

// Expected reaction id for each preset (null = conditional/no immediate reaction)
const EXPECTED = {
  p1:  {reactionId:'na_water',      minHistory:1, note:'钠+水→NaOH+H₂'},
  p2:  {reactionId:'fe_cu',         minHistory:1, note:'铁置换铜'},
  p3:  {reactionId:'na2co3_hcl',    minHistory:1, note:'碳酸钠+盐酸产气'},
  p4:  {reactionId:'agcl',          minHistory:1, precip:true, note:'AgCl白色沉淀'},
  p5:  {reactionId:'baso4',         minHistory:1, precip:true, note:'BaSO₄白色沉淀'},
  p6:  {reactionId:'cuoh2',         minHistory:1, precip:true, note:'Cu(OH)₂蓝色絮状'},
  p7:  {reactionId:'feoh3',         minHistory:1, precip:true, note:'Fe(OH)₃红褐色'},
  p8:  {reactionId:'neutralize',    minHistory:1, note:'酸碱中和'},
  p9:  {reactionId:'h2o2_decomp',   minHistory:1, note:'H₂O₂催化分解'},
  p10: {reactionId:'caco3_hcl',     minHistory:1, note:'碳酸钙+盐酸'},
  p11: {reactionId:'mg_burn',       minHistory:0, note:'镁条燃烧(需点燃,初始不反应)'},
  p12: {reactionId:'fe_o2',         minHistory:0, note:'铁在氧气中燃烧(需点燃)'},
  p13: {reactionId:'co2_lime1',     minHistory:1, acceptAny:['co2_lime1','co2_lime2'], precip:true, note:'CO₂+石灰水(过量CO₂会触发第二步)'},
  p14: {reactionId:'cu_hno3c',      minHistory:1, note:'铜+浓硝酸'},
  p15: {reactionId:'ethanol_burn',  minHistory:0, note:'乙醇燃烧(需点燃)'},
  p16: {reactionId:'kmno4_decomp',  minHistory:0, note:'KMnO₄加热分解(需≥200℃)'},
  p17: {reactionId:'nahco3_hcl',    minHistory:1, note:'碳酸氢钠+盐酸'},
  p18: {reactionId:'feoh3',         minHistory:1, precip:true, note:'FeCl₃+NaOH'},
  p19: {reactionId:'baso4',         minHistory:1, precip:true, note:'BaCl₂+Na₂SO₄'},
  p20: {reactionId:'h2so4_dilute',  minHistory:1, note:'浓硫酸稀释'},
};

let pass = 0, fail = 0;
function check(name, cond, info='') {
  if (cond) { pass++; console.log(`  [PASS] ${name} ${info}`); }
  else { fail++; console.log(`  [FAIL] ${name} ${info}`); }
}

console.log('\n=== Testing all 20 presets ===');
for (const preset of sandbox.PRESETS) {
  console.log(`\n--- ${preset.id}: ${preset.name} ---`);
  sim.loadPreset(preset);
  // initial state - no heat, no ignition
  for (let i = 0; i < 30; i++) {
    for (const c of sim.containers) if (c.contents.length) sim.engine.advance(c, 0.1);
  }
  const c = sim.containers[0];
  if (!c) { check(`${preset.id} container exists`, false); continue; }
  const exp = EXPECTED[preset.id];
  const lastR = c.lastReaction ? c.lastReaction.id : null;
  const histLen = c.history.length;

  if (exp.minHistory > 0) {
    check(`${preset.id} reaction triggered`, histLen >= exp.minHistory, `(history=${histLen}, lastR=${lastR})`);
    const accept = exp.acceptAny || [exp.reactionId];
    check(`${preset.id} matches expected reaction`, accept.includes(lastR) || (lastR && lastR.startsWith('precip:') && exp.precip), `(got ${lastR}, want ${exp.reactionId})`);
  } else {
    // conditional: should NOT trigger initially
    check(`${preset.id} no reaction without conditions`, histLen === 0, `(history=${histLen}, expected 0)`);
  }
  if (exp.precip) {
    check(`${preset.id} precipitate formed`, c.precipitates.length > 0, `(${c.precipitates.map(p=>p.name).join(',')})`);
  }
  console.log(`  contents: ${c.contents.map(x=>`${x.id}=${x.moles.toFixed(3)}`).join(', ')}`);
  console.log(`  temp: ${c.temperature.toFixed(1)}℃, pH: ${c.pH.toFixed(2)}, precip: ${c.precipitates.length}, history: ${histLen}`);
}

// === Conditional reaction tests ===
console.log('\n=== Conditional reaction tests ===');

// Test p16: KMnO4 needs heat ≥200°C
console.log('\n--- p16 KMnO4 heat test ---');
sim.loadPreset(sandbox.PRESETS.find(p => p.id === 'p16'));
let c16 = sim.containers[0];
// Confirm no reaction at room temp
for (let i = 0; i < 10; i++) sim.engine.advance(c16, 0.1);
check('KMnO4 no reaction at room temp', c16.history.length === 0, `(history=${c16.history.length})`);
// Heat it up
c16.temperature = 250;
for (let i = 0; i < 30; i++) sim.engine.advance(c16, 0.1);
check('KMnO4 decomposes when heated ≥200℃', c16.history.length >= 1, `(history=${c16.history.length}, lastR=${c16.lastReaction && c16.lastReaction.id})`);
check('KMnO4 produces MnO₂ catalyst', c16.molesOf('mno2') > 0, `(mno2=${c16.molesOf('mno2').toFixed(3)})`);

// Test p11: Mg needs ignition
console.log('\n--- p11 Mg ignition test ---');
sim.loadPreset(sandbox.PRESETS.find(p => p.id === 'p11'));
let c11 = sim.containers[0];
for (let i = 0; i < 10; i++) sim.engine.advance(c11, 0.1);
check('Mg no reaction without ignition', c11.history.length === 0, `(history=${c11.history.length})`);
c11.ignited = true;
for (let i = 0; i < 30; i++) sim.engine.advance(c11, 0.1);
check('Mg burns when ignited', c11.history.length >= 1, `(history=${c11.history.length}, lastR=${c11.lastReaction && c11.lastReaction.id})`);
check('Mg produces MgO', c11.molesOf('mgo') > 0, `(mgo=${c11.molesOf('mgo').toFixed(3)})`);

// Test p12: Fe in O2 needs ignition
console.log('\n--- p12 Fe in O₂ ignition test ---');
sim.loadPreset(sandbox.PRESETS.find(p => p.id === 'p12'));
let c12 = sim.containers[0];
for (let i = 0; i < 10; i++) sim.engine.advance(c12, 0.1);
check('Fe in O₂ no reaction without ignition', c12.history.length === 0);
c12.ignited = true;
for (let i = 0; i < 30; i++) sim.engine.advance(c12, 0.1);
check('Fe burns in O₂ when ignited', c12.history.length >= 1, `(lastR=${c12.lastReaction && c12.lastReaction.id})`);
check('Fe produces Fe₃O₄', c12.molesOf('fe3o4') > 0, `(fe3o4=${c12.molesOf('fe3o4').toFixed(3)})`);

// Test p15: Ethanol needs ignition
console.log('\n--- p15 Ethanol ignition test ---');
sim.loadPreset(sandbox.PRESETS.find(p => p.id === 'p15'));
let c15 = sim.containers[0];
for (let i = 0; i < 10; i++) sim.engine.advance(c15, 0.1);
check('Ethanol no reaction without ignition', c15.history.length === 0);
c15.ignited = true;
for (let i = 0; i < 30; i++) sim.engine.advance(c15, 0.1);
check('Ethanol burns when ignited', c15.history.length >= 1, `(lastR=${c15.lastReaction && c15.lastReaction.id})`);

// Test H2O2 without catalyst (no reaction)
console.log('\n--- H₂O₂ without catalyst test ---');
sim.loadPreset(sandbox.PRESETS.find(p => p.id === 'p9'));
let c9 = sim.containers[0];
// Remove MnO2
c9.contents = c9.contents.filter(x => x.id !== 'mno2');
c9.precipitates = [];
c9.lastReaction = null; c9.history = [];
for (let i = 0; i < 30; i++) sim.engine.advance(c9, 0.1);
check('H₂O₂ no reaction without catalyst', c9.history.length === 0, `(history=${c9.history.length})`);

// === Limiting reagent test ===
console.log('\n=== Limiting reagent test ===');
sim.loadPreset(sandbox.PRESETS.find(p => p.id === 'p8')); // NaOH 0.1 + HCl 0.12
let c8 = sim.containers[0];
for (let i = 0; i < 200; i++) sim.engine.advance(c8, 0.1);
// NaOH is limiting (0.1 < 0.12): it should be more consumed than HCl
const naohRem = c8.molesOf('naoh'), hclRem = c8.molesOf('hcl');
check('NaOH more consumed than HCl (limiting reagent)', naohRem < hclRem, `(naoh=${naohRem.toFixed(4)} < hcl=${hclRem.toFixed(4)})`);
check('HCl remains (excess reagent)', hclRem > 0.005, `(hcl=${hclRem.toFixed(4)})`);
check('NaCl produced', c8.molesOf('nacl') > 0.05, `(nacl=${c8.molesOf('nacl').toFixed(4)})`);

// === Safety warnings ===
console.log('\n=== Safety rules ===');
check('SAFETY_RULES defined', Array.isArray(sandbox.SAFETY_RULES) && sandbox.SAFETY_RULES.length > 0);
check('H₂SO₄ dilution rule exists', sandbox.SAFETY_RULES.some(r => r.title && r.title.includes('浓硫酸')));

// Count reactions with safety warnings
const safetyRxns = sandbox.REACTIONS.filter(r => r.safety);
check('Reactions with safety warnings exist', safetyRxns.length >= 4, `(${safetyRxns.length} reactions)`);

// === Indicator test ===
console.log('\n=== Indicator test ===');
sim.loadPreset(sandbox.PRESETS.find(p => p.id === 'p1'));
let cI = sim.containers[0];
for (let i = 0; i < 30; i++) sim.engine.advance(cI, 0.1);
// After Na+water → NaOH (alkaline), phenolphthalein should make solution red/pink
check('Na+water produces alkaline solution', cI.pH > 10, `(pH=${cI.pH.toFixed(2)})`);
check('Phenolphthalein present', cI.molesOf('phenolphthalein') > 0);

// === Multi-substance reaction ===
console.log('\n=== Multi-substance coexistence ===');
sim.loadPreset(sandbox.PRESETS.find(p => p.id === 'p13'));
let c13 = sim.containers[0];
// Add excess CO2 to trigger second reaction (CaCO3 + CO2 + H2O → Ca(HCO3)2)
for (let i = 0; i < 30; i++) sim.engine.advance(c13, 0.1);
check('CO₂+lime produces precipitate (1st reaction)', c13.history.length >= 1, `(history=${c13.history.length})`);

// === Final summary ===
console.log('\n=== SUMMARY ===');
console.log(`Passed: ${pass}, Failed: ${fail}`);
console.log(`Substances: ${Object.keys(sandbox.SUBSTANCES).length}, Instruments: ${Object.keys(sandbox.INSTRUMENTS).length}`);
console.log(`Reactions: ${sandbox.REACTIONS.length}, Presets: ${sandbox.PRESETS.length}`);

if (fail > 0) {
  console.log('\n[FAIL] Some tests failed');
  process.exit(1);
}
console.log('\n[OK] ALL TESTS PASSED');
