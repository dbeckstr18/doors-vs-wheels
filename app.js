import {VERSION,EPOCH,YEAR_MS,REVIEW_MS,DEFAULTS,LIMITS,DEFINITION,SOURCES,CATEGORIES,estimate,encodeState,decodeState} from './model.js';

const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const billion = new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
const precise = new Intl.NumberFormat('en-US',{minimumFractionDigits:3,maximumFractionDigits:3});
const escape = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const signed = (value,format=billion) => `${value>=0?'+':'−'}${format.format(Math.abs(value))}`;
const sourceMap = new Map(SOURCES.map(s=>[s.id,s]));
let state = decodeState(location.search);
let pausedAt = null;
let lastSlowUpdate = -Infinity;

for(const kind of ['doors','wheels']) {
 const container = $(kind==='doors'?'door-categories':'wheel-categories');
 container.innerHTML = CATEGORIES.filter(c=>c.kind===kind).map(c=>`<details class="category ${kind}-category" id="${c.id}"><summary><span>${escape(c.name)}</span><span class="category-value" id="${c.id}-value"></span></summary><div class="category-content"><div class="category-mini" aria-hidden="true"><span id="${c.id}-bar"></span></div><span class="evidence-tag">${escape(c.evidence)}</span><p><strong>Reference-case stock:</strong> ${escape(c.stockBasis)}</p><p><strong>Annual flows:</strong> ${escape(c.flowBasis)}</p><dl><dt>Selected starting stock</dt><dd id="${c.id}-base"></dd><dt>Current assumption range</dt><dd id="${c.id}-range"></dd><dt>Manufactured / year</dt><dd id="${c.id}-made"></dd><dt>Physically destroyed / year</dt><dd id="${c.id}-lost"></dd><dt>Net change / year</dt><dd id="${c.id}-net"></dd></dl><div class="category-sources">${c.sources.map(id=>`<a href="#source-${id}">${escape(sourceMap.get(id).publisher)}</a>`).join('')}</div></div></details>`).join('');
}
$('source-list').innerHTML = SOURCES.map((s,index)=>`<article class="source-item" id="source-${s.id}"><span class="source-meta">${String(index+1).padStart(2,'0')} / ${escape(s.publisher)} · ${escape(s.year)}<br>${escape(s.type)}</span><h3><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)} <span aria-hidden="true">↗</span></a></h3><p>${escape(s.finding)}</p><p class="source-limit"><b>Limit:</b> ${escape(s.limit)}</p></article>`).join('');

function syncControls() {
 for(const key of Object.keys(LIMITS)) {
  $(key).value = state[key];
  $(`${key}-value`).textContent = `${state[key]}${key==='cabinets'?'':'%'}`;
 }
 $('toys').checked = state.toys;
 $('survival').disabled = !state.toys;
 $('otherToys').disabled = !state.toys;
}
function saveUrl() {
 const query = encodeState(state);
 history.replaceState(null,'',`${location.pathname}${query?'?'+query:''}${location.hash}`);
}
function updateScenarioMessage(result) {
 const difference = result.totals.wheels.stock-result.totals.doors.stock;
 const winner = difference>=0?'Wheels':'Doors';
 const without = !state.toys?' Toys are excluded from both sides.':'';
 $('assumption-result').textContent = `${winner} lead by approximately ${billion.format(Math.abs(difference))} billion in your scenario.${without} This is a model result, not evidence that the real-world winner has changed.`;
}
function render(force=false) {
 const now = pausedAt??Date.now();
 const result = estimate(state,now);
 for(const kind of ['doors','wheels']) {
  const total = result.totals[kind];
  $(`${kind}-count`).textContent = number.format(Math.floor(total.stock*1e9));
  $(`${kind}-rate`).textContent = signed(result.reviewDue?0:total.net*1e9/(YEAR_MS/1000),number);
  $(`${kind}-range`).textContent = `${billion.format(total.low)}–${billion.format(total.high)}B`;
 }
 const d = result.totals.doors, w = result.totals.wheels;
 $('door-share').style.width = `${100*d.stock/(d.stock+w.stock)}%`;
 $('lead').textContent = `${w.stock>=d.stock?'Wheels':'Doors'} lead by about ${billion.format(Math.abs(w.stock-d.stock))} billion in this model.`;
 $('scenario-status').textContent = encodeState(state)?'Your custom assumptions':'Default assumptions';
 const time = new Date(result.asOf).toISOString().replace('T',' · ').slice(0,21)+' UTC';
 $('clock-status').textContent = `${pausedAt!==null?'Paused at':result.reviewDue?'Projection stopped at':result.beforeBaseline?'Baseline (device clock is earlier)':'Model time'} ${time}`;
 $('review-alert').hidden = !result.reviewDue && !result.beforeBaseline;
 $('review-alert').textContent = result.reviewDue?'Research update needed. The one-year projection has ended; the counters are frozen at the review horizon.':result.beforeBaseline?'Your device clock precedes the baseline. The starting estimates are shown until 19 October 2026 UTC.':'';
 if(force || Date.now()-lastSlowUpdate>=15000) {
  for(const kind of ['doors','wheels']) {
   const total = result.totals[kind];
   $(`${kind}-accessible`).textContent = `Approximately ${billion.format(total.stock)} billion estimated ${kind}. Assumption range ${billion.format(total.low)} to ${billion.format(total.high)} billion.`;
   $(kind==='doors'?'door-category-total':'wheel-category-total').textContent = `${billion.format(total.stock)}B`;
  }
  for(const row of result.rows) {
   $(`${row.id}-value`).textContent = `${billion.format(row.current)}B`;
   $(`${row.id}-bar`).style.width = `${100*row.current/result.totals[row.kind].stock}%`;
   $(`${row.id}-base`).textContent = `${billion.format(row.stock)}B`;
   $(`${row.id}-range`).textContent = `${billion.format(row.currentLow)}–${billion.format(row.currentHigh)}B`;
   for(const field of ['made','lost']) $(`${row.id}-${field}`).textContent = `${precise.format(row[field])}B`;
   $(`${row.id}-net`).textContent = `${signed(row.net,precise)}B`;
  }
  $('flow-totals').innerHTML = ['doors','wheels'].map(kind=>`<tr><td>${kind==='doors'?'Doors':'Wheels'}</td><td>${precise.format(result.totals[kind].made)}</td><td>${precise.format(result.totals[kind].lost)}</td><td>${signed(result.totals[kind].net,precise)}</td></tr>`).join('');
  lastSlowUpdate = Date.now();
 }
 if(force) updateScenarioMessage(result);
 return result;
}
function applyState() {syncControls();saveUrl();render(true);}
for(const key of Object.keys(LIMITS)) $(key).addEventListener('input',()=>{state[key]=Number($(key).value);applyState();});
$('toys').addEventListener('change',()=>{state.toys=$('toys').checked;applyState();});
$('reset').addEventListener('click',()=>{state={...DEFAULTS};applyState();$('action-feedback').textContent='Reference assumptions restored.';});
$('pause').addEventListener('click',()=>{
 pausedAt=pausedAt===null?Date.now():null;
 $('pause').setAttribute('aria-pressed',String(pausedAt!==null));
 $('pause').innerHTML = pausedAt!==null?'Resume counters <span aria-hidden="true">▶</span>':'Pause counters <span aria-hidden="true">Ⅱ</span>';
 render(true);
});
$('share').addEventListener('click',async()=>{
 try {
  const url = new URL(location.href);url.hash='';
  await navigator.clipboard.writeText(url.href);
  $('action-feedback').textContent='Scenario link copied. Site access rules still apply.';
 } catch {
  $('action-feedback').textContent='Your settings are saved in the address bar. Copy that address to share this scenario.';
 }
});
$('download').addEventListener('click',()=>{
 const snapshot=render();
 const data={modelVersion:VERSION,exportedAt:new Date().toISOString(),modelAsOf:new Date(snapshot.asOf).toISOString(),baseline:new Date(EPOCH).toISOString(),reviewHorizon:new Date(REVIEW_MS).toISOString(),displayPaused:pausedAt!==null,units:'Billions of individual components; flows per 365.2425-day year',definition:DEFINITION,warning:'Scenario estimates, not measured world counts. Ranges are stress tests, not confidence intervals. All physical-destruction rates are assumptions. No automatic source refresh.',...snapshot,sources:SOURCES};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download=`doors-wheels-model-${VERSION}.json`;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 $('action-feedback').textContent='Model snapshot downloaded with your settings and sources.';
});
window.addEventListener('popstate',()=>{state=decodeState(location.search);syncControls();render(true);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render(true);});
syncControls();render(true);
setInterval(()=>{if(!document.hidden&&pausedAt===null)render();},250);
