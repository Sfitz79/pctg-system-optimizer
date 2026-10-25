const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = require('node:path').join(__dirname, '../app/');
const html = fs.readFileSync(root+'index.html','utf8');
const source = fs.readFileSync(root+'renderer.js','utf8');
class Element {
  constructor(dataset={}) { this.dataset=dataset; this.style={}; this.handlers={}; this.textContent=''; this.disabled=false; this.classList={add(){},remove(){}}; }
  addEventListener(name,fn) { this.handlers[name]=fn; }
  setAttribute() {}
}
function setup(bridge={}) {
  const nodes=new Map();
  const cards=[...html.matchAll(/class="card[^"\n]*" data-phase="([^"]+)"/g)].map(m=>new Element({phase:m[1]}));
  const gpu=['nvidia','amd','intel'].map(brand=>new Element({gpuBrand:brand}));
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  const storage=new Map(); const calls=[];
  const document={getElementById:get,addEventListener(){},querySelectorAll:s=>s==='.card[data-phase]'?cards:s==='.gpu-brand-btn'?gpu:[]};
  const context={document,activeTier:'pro',demoMode:false,window:{pctg:{onPhaseProgress(){},runPhase:async phase=>{calls.push(phase);return 'done';},getDiskSpace:async()=>({free:1000000000}),...bridge}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,v)=>storage.set(key,v)},getTuneUpSettings:()=>({cleanup:true,performance:true,final:true}),refreshReport(){},logout(){},setTimeout:()=>1,clearTimeout(){},console};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function initOptimizer()'),source.indexOf('// ======== Toggle Cards'))+'\ninitOptimizer();',context);
  return {context,cards,gpu,get,calls,storage};
}
(async()=>{
  const fixture=setup();
  for(const card of fixture.cards.filter(c=>c.dataset.phase!=='gpu-select'))await card.handlers.click();
  for(const button of fixture.gpu)await button.handlers.click({stopPropagation(){}});
  const expected=['registry','disk','fps','winfix','performance','internet','cleanup','security','master','repair','uninstaller','duplicates','contextmenu','gpu-nvidia','gpu-amd','gpu-intel'];
  assert.deepEqual(fixture.calls.sort(),expected.sort());
  console.log('PASS: all 16 module and GPU actions dispatch the expected phase through the bridge.');
  const denied=setup({runPhase:async()=>{throw new Error('Licence does not include this phase');}});
  await denied.cards[0].handlers.click();
  assert.equal(denied.storage.has('pctg_completed_phases'),false);
  assert.match(denied.get('log').textContent,/Licence does not include/);
  assert.doesNotMatch(denied.get('log').textContent,/done\./);
  console.log('PASS: rejected tools show an error and are never recorded as completed.');
  let release; let started=0; const pending=setup({runPhase:()=>{started++;return new Promise(r=>release=r);}});
  const first=pending.cards[0].handlers.click();
  await pending.cards[1].handlers.click();
  assert.equal(started,1);
  release('done');await first;
  console.log('PASS: a second tool cannot start while a phase is pending.');
  const preview=setup();preview.context.demoMode=true;
  await preview.cards[0].handlers.click();assert.equal(preview.calls.length,0);
  console.log('PASS: preview mode cannot invoke paid module actions.');
  const tune=setup();await tune.get('btn-tuneup').onclick();
  assert.deepEqual(tune.calls,['cleanup','performance','final']);
  console.log('PASS: tune-up executes Clean, Boost and Final Sweep in order.');
  const failed=setup({runPhase:async()=>{throw Error('Failed phase');}});
  await failed.get('btn-tuneup').onclick();
  assert.equal(failed.storage.has('pctg_completed_phases'),false);
  console.log('PASS: failed tune-up stops and does not report a successful completion.');
  assert.doesNotMatch(source,/cleaned = d \? Math\.round\(\(d\.used/);
  assert.match(source,/afterSpace\.free - beforeSpace\.free/);
  console.log('PASS: disk-recovery reporting uses free-space change, never total used space.');
})().catch(error=>{console.error(error);process.exitCode=1;});
