/* Twin Words - IELTS vocabulary for the bus.
   Spaced practice in boxes: new word -> learn card -> 2 checks in the same session -> box 1.
   Box 1 due next day, box 2 after 2 days, box 3 ("known") after 4, box 4 ("strong") after 7.
   A wrong answer sends the word back to box 1 and shows its card again in the same session.
   State lives in localStorage (this phone only). "Share my progress" exports it for Claude. */
(function () {
'use strict';
const W = self.TW_WORDS, P = self.TW_PACKS;
const BY = Object.fromEntries(W.map(w => [w.id, w]));
const EXAM = new Date(2026, 9, 25);
const TEST = /[?&]test\b/.test(location.search);
const SHOT = /[?&]shot=/.test(location.search);
const KEY = 'tw:state:v1' + (TEST ? ':test' : '');
const INT = { 1: 1, 2: 2, 3: 4, 4: 7 };
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- state ---------- */
function blank() { return { w: {}, cur: P[0].id, newPer: 10, sound: true, log: [], days: {} }; }
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.w) return Object.assign(blank(), s); } catch (e) {}
  return blank();
}
let st = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
function dayNum(d) { d = d || new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5); }
const today = () => dayNum() + (st.shift || 0);   // shift: test hook to move time forward
function rec(id) { return st.w[id]; }
function boxOf(id) { return rec(id) ? rec(id).b : 0; }
function logAns(id, k, ok) {
  st.log.push([Date.now(), id, k, ok ? 1 : 0]);
  if (st.log.length > 4000) st.log = st.log.slice(-4000);
  const d = String(today()); const t = st.days[d] || (st.days[d] = { r: 0, x: 0, n: 0 });
  ok ? t.r++ : t.x++;
}

/* ---------- picking words ---------- */
function dueList() {
  const t = today();
  return W.filter(w => rec(w.id) && rec(w.id).b > 0 && rec(w.id).dd <= t)
          .sort((a, b) => rec(a.id).dd - rec(b.id).dd);
}
const isNew = id => !rec(id) || rec(id).b === 0;   // b 0 = card seen but checks not passed yet
function unseenIn(pid) { return W.filter(w => w.pack === pid && isNew(w.id)); }
function packOrder() {   // current pack first, then the others in list order
  const i = P.findIndex(p => p.id === st.cur);
  return P.slice(i).concat(P.slice(0, i));
}
function newWords(n) {
  const out = [];
  for (const p of packOrder()) { for (const w of unseenIn(p.id)) { if (out.length < n) out.push(w); } }
  return out;
}
function fixCur() {   // if the current pack is finished, move to the next one that has new words
  if (unseenIn(st.cur).length) return;
  const nx = packOrder().find(p => unseenIn(p.id).length);
  if (nx) st.cur = nx.id;
}
function plan() {
  const due = dueList();
  const reviews = due.slice(0, 30);
  const nNew = due.length > 25 ? 0 : st.newPer;
  return { reviews, fresh: newWords(nNew), dueAll: due.length };
}
function kindFor(b) {
  if (b <= 1) return Math.random() < 0.5 ? 'twin' : 'gap';
  if (b === 2) return 'type';
  return ['type', 'twin', 'mean'][Math.floor(Math.random() * 3)];
}

/* ---------- session ---------- */
let S = null;   // { q: [items], i, right, wrong, learned, hard:Set }
function startSession(custom) {
  fixCur();
  let q = [];
  if (custom) q = custom;
  else {
    const p = plan();
    p.reviews.forEach(w => q.push({ id: w.id, k: kindFor(rec(w.id).b) }));
    const learns = p.fresh.map(w => ({ id: w.id, k: 'learn', nw: 1 }));
    // mix: 3 reviews, then a new word, and so on
    const mixed = []; let r = 0, n = 0;
    while (r < q.length || n < learns.length) {
      for (let c = 0; c < 3 && r < q.length; c++) mixed.push(q[r++]);
      if (n < learns.length) mixed.push(learns[n++]);
    }
    q = mixed;
  }
  if (!q.length) return false;
  S = { q, i: 0, right: 0, wrong: 0, learned: 0, hard: new Set(), seen: new Set() };
  unlockAudio();
  show();
  return true;
}
function later(item, gap) { const pos = Math.min(S.q.length, S.i + 1 + gap); S.q.splice(pos, 0, item); }
function settle(item, ok) {
  const id = item.id; let r = rec(id);
  logAns(id, item.k, ok);
  if (ok) S.right++; else { S.wrong++; S.hard.add(id); }
  if (item.nw) {                       // a word being learned right now
    if (!ok) { later({ id, k: 'learn', nw: 1, again: 1 }, 2); return; }
    if (item.nw === 1) { later({ id, k: 'gap', nw: 2 }, 4); return; }
    r.b = 1; r.dd = today() + INT[1]; S.learned++;
    const d = String(today()); (st.days[d] || (st.days[d] = { r: 0, x: 0, n: 0 })).n++;
    return;
  }
  if (item.relearn) { if (!ok) later({ id, k: 'learn', relearn: 1 }, 2); return; }
  r.last = Date.now();
  if (ok) { r.r++; r.b = Math.min(4, r.b + 1); r.dd = today() + INT[r.b]; }
  else {
    r.x++; r.b = 1; r.dd = today() + INT[1];
    later({ id, k: 'learn', relearn: 1 }, 1);
    later({ id, k: 'gap', relearn: 1 }, 4);
  }
}

/* ---------- audio ---------- */
let AU = null, unlocked = false;
function silentWav() {   // 0.1 s of silence, 8 kHz 8-bit mono
  const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
  const str = (o, t) => [...t].forEach((c, i) => b[o + i] = c.charCodeAt(0));
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44);
  let s = ''; b.forEach(x => s += String.fromCharCode(x)); return 'data:audio/wav;base64,' + btoa(s);
}
const urls = {};
function unlockAudio() {
  if (unlocked) return;
  try {
    AU = AU || new Audio();
    AU.src = silentWav();
    const p = AU.play(); if (p && p.catch) p.catch(() => {});
    unlocked = true;
  } catch (e) {}
}
function getUrl(path) {
  if (urls[path]) return Promise.resolve(urls[path]);
  return fetch(path).then(r => { if (!r.ok) throw 0; return r.blob(); })
    .then(b => (urls[path] = URL.createObjectURL(b))).catch(() => path);
}
let playToken = 0;
function play(id, kinds) {
  if (!st.sound) return;
  AU = AU || new Audio();
  const tok = ++playToken;
  const list = kinds.map(k => 'audio/' + k + '-' + id + '.mp3');
  (function next(i) {
    if (i >= list.length || tok !== playToken) return;
    getUrl(list[i]).then(u => {
      if (tok !== playToken) return;
      AU.onended = () => setTimeout(() => next(i + 1), 350);
      AU.src = u;
      const p = AU.play(); if (p && p.catch) p.catch(() => {});
    });
  })(0);
}
function stopAudio() { playToken++; try { AU && AU.pause(); } catch (e) {} }
function prefetch(id) { getUrl('audio/w-' + id + '.mp3'); getUrl('audio/x-' + id + '.mp3'); }

/* ---------- pieces ---------- */
const exHtml = w => esc(w.ex).replace(/\{([^}]+)\}/, '<b>$1</b>');
const exGap = w => esc(w.ex).replace(/\{([^}]+)\}/, '_____');
const exForm = w => (w.ex.match(/\{([^}]+)\}/) || [, w.w])[1];
function cardHtml(w, opts) {
  opts = opts || {};
  return `<div class="top"><div><div class="big">${esc(w.w)}</div><div class="pos">${esc(w.pos)}</div>${w.use ? `<div class="use">${esc(w.use)}</div>` : ''}</div>
    <button class="icon" data-say="${w.id}" aria-label="Hear it">🔊</button></div>
    <div class="lab">Meaning</div><div>${esc(w.en)}</div>
    <div class="lab">Türkçe</div><div class="tr">${esc(w.tr)}</div>
    <div class="lab">IELTS twins (the text may use these)</div><div class="chips">${w.tw.split(/,\s*/).map(t => `<span>${esc(t)}</span>`).join('')}</div>
    <div class="lab">Example</div><div class="ex">${exHtml(w)}</div>
    ${opts.extra || ''}`;
}
function bindSay(root) {
  root.querySelectorAll('[data-say]').forEach(b => b.onclick = e => { e.stopPropagation(); unlockAudio(); play(b.dataset.say, ['w', 'x']); });
}
// two words clash if they share a twin or one is the other's twin (amass / accumulate, thwart / deter)
const twins = w => w.tw.toLowerCase().split(/,\s*/);
function clash(a, b) {
  const ta = twins(a), tb = twins(b);
  return ta.some(t => tb.includes(t)) || ta.includes(b.w) || tb.includes(a.w);
}
function options(w, field) {
  const ok = o => o.id !== w.id && o[field] !== w[field] && !clash(w, o);
  const same = shuffle(W.filter(o => ok(o) && o.pos === w.pos));
  const other = shuffle(W.filter(o => ok(o) && o.pos !== w.pos));
  return shuffle([w].concat(same.concat(other).slice(0, 3)));
}

/* ---------- screens ---------- */
function daysLeft() { return Math.max(0, Math.ceil((EXAM - new Date()) / 864e5)); }
function counts(list) {
  let l = 0, k = 0;
  list.forEach(w => { const b = boxOf(w.id); if (b >= 1) l++; if (b >= 3) k++; });
  return { l, k, n: list.length };
}
function home() {
  S = null; stopAudio(); fixCur(); save();
  const p = plan(), all = counts(W), cur = P.find(x => x.id === st.cur), cc = counts(W.filter(w => w.pack === st.cur));
  const hard = W.filter(w => isHard(w.id)).length;
  const n = p.reviews.length + p.fresh.length;
  const standalone = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  $('#app').innerHTML = `
  <div class="top"><div><h1>Twin Words</h1><p class="sub">${daysLeft()} days to the exam · words for your next tests</p></div>
    <button class="icon" id="snd" aria-label="Sound">${st.sound ? '🔊' : '🔇'}</button></div>
  ${standalone || (TEST && !SHOT) ? '' : `<div class="install"><b>Put it on your home screen:</b> tap the Share button <b>⬆︎</b> at the bottom of Safari, then <b>Add to Home Screen</b>. Always open it from that icon. It works offline after the first open.</div>`}
  <div class="card">
    <h2>Today</h2>
    ${n ? `<p style="margin:0">${p.reviews.length ? `<b>${p.reviews.length}</b> to review` : 'Nothing to review yet'}${p.fresh.length ? ` · <b>${p.fresh.length}</b> new words` : ''}</p>
      <p class="note" style="margin:4px 0 0">About ${Math.max(3, Math.round((p.reviews.length * 12 + p.fresh.length * 70) / 60))} minutes.${p.dueAll > 30 ? ` ${p.dueAll - 30} more reviews wait for the next round.` : ''}</p>
      <button class="btn" id="go">Start</button>`
    : `<div class="done-big">✓</div><p style="text-align:center;margin:0">All done for today. New reviews come tomorrow.</p>
      ${W.some(w => isNew(w.id)) ? '<button class="btn ghost" id="more">Learn 5 more words</button>' : ''}`}
  </div>
  <div class="card">
    <div class="lab" style="margin-top:0">Now learning</div>
    <h2>${esc(cur.name)}</h2><p class="note" style="margin:0 0 6px">${esc(cur.note)}</p>
    <div class="prog"><span>${cc.l} of ${cc.n} learned</span><span>${cc.k} known</span></div>
    <div class="bar"><i style="width:${Math.round(cc.l / cc.n * 100)}%"></i></div>
    <button class="btn ghost" id="packs">Change pack</button>
  </div>
  <div class="card stat">
    <div><b>${all.l}</b><span>learned</span></div><div><b>${all.k}</b><span>known</span></div><div><b>${all.n}</b><span>words</span></div>
  </div>
  <div class="card">
    <button class="btn ghost" id="list" style="margin-top:0">All words</button>
    ${hard ? `<button class="btn ghost" id="hard">Hard words (${hard})</button>` : ''}
    <button class="btn ghost" id="set">Settings and progress</button>
  </div>
  <p class="note" id="off" style="text-align:center"></p>`;
  const go = $('#go'); if (go) go.onclick = () => startSession();
  const more = $('#more'); if (more) more.onclick = () => { const f = newWords(5).map(w => ({ id: w.id, k: 'learn', nw: 1 })); startSession(f); };
  $('#snd').onclick = () => { st.sound = !st.sound; save(); home(); };
  $('#packs').onclick = packs;
  $('#list').onclick = () => list('');
  const h = $('#hard'); if (h) h.onclick = hardPage;
  $('#set').onclick = settings;
  offlineStatus();
}
function packs() {
  $('#app').innerHTML = `<div class="top"><h1>Packs</h1><button class="icon" id="bk">✕</button></div>
   <p class="sub">Tip: before a Reading test, learn its pack. Then we can see if it helps.</p>
   ${P.map(p => { const c = counts(W.filter(w => w.pack === p.id));
     return `<button class="pk ${p.id === st.cur ? 'cur' : ''}" data-p="${p.id}"><b>${esc(p.name)}</b> ${p.id === st.cur ? '<span class="tag l">now</span>' : ''}<br>
       <small>${esc(p.note)}</small><div class="prog"><span>${c.l}/${c.n} learned</span><span>${c.k} known</span></div>
       <div class="bar"><i style="width:${Math.round(c.l / c.n * 100)}%"></i></div></button>`; }).join('')}`;
  $('#bk').onclick = home;
  document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { st.cur = b.dataset.p; save(); home(); });
}
const isHard = id => rec(id) && rec(id).x > 0 && rec(id).b < 3;
function tagFor(id) {
  const r = rec(id); if (!r || r.b === 0) return '<span class="tag">new</span>';
  if (isHard(id)) return '<span class="tag h">hard</span>';
  return r.b >= 3 ? '<span class="tag k">known</span>' : '<span class="tag l">learning</span>';
}
function list(qs, only) {
  const src = only || W;
  const f = qs.trim().toLowerCase();
  const rows = src.filter(w => !f || w.w.includes(f) || w.tr.toLowerCase().includes(f) || w.en.includes(f));
  $('#app').innerHTML = `<div class="top"><h1>${only ? 'Hard words' : 'All words'}</h1><button class="icon" id="bk">✕</button></div>
   <input class="search" id="sq" placeholder="Search (English or Türkçe)" value="${esc(qs)}" autocapitalize="off" autocorrect="off">
   <div class="card list">${rows.map(w => `<div class="it ${isNew(w.id) ? 'dim' : ''}" data-id="${w.id}"><div class="hd"><span><b>${esc(w.w)}</b> <span class="pos">${esc(w.pos)}</span></span>${tagFor(w.id)}</div>
     <div class="more" hidden></div></div>`).join('') || '<p class="note">No words.</p>'}</div>
   ${only ? '<button class="btn" id="ph">Practise these now</button>' : ''}`;
  $('#bk').onclick = home;
  const sq = $('#sq'); sq.oninput = () => { const v = sq.value; list(v, only); const n = $('#sq'); n.focus(); n.setSelectionRange(v.length, v.length); };
  document.querySelectorAll('.it').forEach(it => it.querySelector('.hd').onclick = () => {
    const m = it.querySelector('.more'), w = BY[it.dataset.id];
    if (m.hidden) { m.innerHTML = `<div class="card" style="margin:8px 0 0">${cardHtml(w)}</div>`; bindSay(m); m.hidden = false; unlockAudio(); play(w.id, ['w']); }
    else m.hidden = true;
  });
  const ph = $('#ph'); if (ph) ph.onclick = () => startSession(shuffle(only).map(w => ({ id: w.id, k: boxOf(w.id) >= 2 ? 'type' : 'gap', relearn: 1 })));
}
function hardPage() {
  const hard = W.filter(w => isHard(w.id)).sort((a, b) => rec(b.id).x - rec(a.id).x);
  list('', hard);
}
function settings() {
  const days = Object.keys(st.days).sort().slice(-7);
  $('#app').innerHTML = `<div class="top"><h1>Settings</h1><button class="icon" id="bk">✕</button></div>
   <div class="card"><h2>New words per session</h2><div class="row">${[5, 8, 10, 15].map(n => `<button class="btn small ${n === st.newPer ? '' : 'ghost'}" data-n="${n}">${n}</button>`).join('')}</div>
   <p class="note">A new word takes about a minute the first time (card + 2 checks).</p></div>
   <div class="card"><h2>Last days</h2>${days.length ? days.map(d => { const t = st.days[d]; const dt = new Date(+d * 864e5);
      return `<div class="prog"><span>${dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span><span>${t.n} new · ${t.r} right · ${t.x} wrong</span></div>`; }).join('') : '<p class="note">Nothing yet.</p>'}</div>
   <div class="card"><h2>Send my progress to Claude</h2><p class="note">Makes a small file. Pick AirDrop to your Mac, then send me the file from Downloads.</p>
     <button class="btn" id="share">Share my progress</button><p class="note" id="shmsg"></p></div>
   <div class="card"><h2>Start again</h2><p class="note">Deletes all progress on this phone.</p><button class="btn ghost" id="rs">Reset progress</button></div>`;
  $('#bk').onclick = home;
  document.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { st.newPer = +b.dataset.n; save(); settings(); });
  $('#share').onclick = shareProgress;
  let armed = false;
  $('#rs').onclick = () => { if (!armed) { armed = true; $('#rs').textContent = 'Tap again to delete everything'; return; } st = blank(); save(); home(); };
}
function shareProgress() {
  const data = { app: 'twin-words', saved: new Date().toISOString(), words: W.length, state: st };
  const txt = JSON.stringify(data);
  const name = 'twin-words-progress.json';
  let file = null;
  try { file = new File([txt], name, { type: 'application/json' }); } catch (e) {}
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  $('#shmsg').textContent = 'Saved as ' + name + '.';
}

/* ---------- one question ---------- */
function show() {
  stopAudio();
  if (S.i >= S.q.length) return finish();
  const it = S.q[S.i], w = BY[it.id];
  const left = S.q.length - S.i;
  const top = `<div class="topbar"><button class="icon" id="bk" aria-label="Stop">✕</button><span>${left} left · ✓ ${S.right} · ✗ ${S.wrong}</span>
    <button class="icon" id="snd" aria-label="Sound">${st.sound ? '🔊' : '🔇'}</button></div>`;
  prefetch(w.id);
  const nextIds = S.q.slice(S.i + 1, S.i + 3).map(x => x.id); nextIds.forEach(prefetch);
  let body = '';
  if (it.k === 'learn') {
    if (it.nw && !rec(w.id)) { st.w[w.id] = { b: 0, dd: today(), r: 0, x: 0, t0: Date.now() }; save(); }
    const head = it.again || it.relearn ? '<div class="fb warn" style="margin:0 0 10px">Look again. It comes back in a moment.</div>' : '<div class="lab" style="margin-top:0">New word</div>';
    body = `<div class="card">${head}${cardHtml(w)}</div><button class="btn" id="nx">Got it</button>`;
  } else if (it.k === 'mean') {
    const ops = options(w, 'en');
    body = `<div class="card"><div class="q">What does it mean?</div><div class="top"><div class="big">${esc(w.w)}</div><button class="icon" data-say="${w.id}">🔊</button></div>
      <div class="ex">${exHtml(w)}</div>${ops.map(o => `<button class="opt" data-id="${o.id}">${esc(o.en)}</button>`).join('')}<div id="fb"></div></div>`;
  } else if (it.k === 'twin') {
    const ops = options(w, 'tw');
    body = `<div class="card"><div class="q">The text says it in other words. Which word is the twin of:</div>
      <div class="prompt">"${esc(w.tw)}"</div>${ops.map(o => `<button class="opt" data-id="${o.id}">${esc(o.w)}</button>`).join('')}<div id="fb"></div></div>`;
  } else if (it.k === 'gap') {
    const ops = options(w, 'w');
    body = `<div class="card"><div class="q">Which word fits? (it may need -s, -ed or -ing)</div>
      <div class="ex" style="font-size:19px">${exGap(w)}</div>${ops.map(o => `<button class="opt" data-id="${o.id}">${esc(o.w)}</button>`).join('')}<div id="fb"></div></div>`;
  } else {   // type
    const hint = w.w.split('').map((c, i) => c === ' ' ? '&nbsp;' : (i === 0 ? esc(c) : '_')).join('');
    body = `<div class="card"><div class="q">Write the word</div>
      <div class="tr" style="font-size:20px">${esc(w.tr)}</div><div class="note" style="margin-top:2px">${esc(w.en)}</div>
      <div class="ex">${exGap(w)}</div><div class="hint">${hint} <span class="note">(${w.w.replace(/ /g, '').length} letters)</span></div>
      <input class="type" id="ty" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="type here">
      <div class="row"><button class="btn" id="ck" style="flex:2">Check</button><button class="btn ghost" id="idk" style="flex:1">I don't know</button></div><div id="fb"></div></div>`;
  }
  $('#app').innerHTML = top + body;
  $('#bk').onclick = home;
  $('#snd').onclick = () => { st.sound = !st.sound; save(); $('#snd').textContent = st.sound ? '🔊' : '🔇'; if (!st.sound) stopAudio(); };
  bindSay($('#app'));
  if (it.k === 'learn') {
    play(w.id, ['w', 'x']);
    $('#nx').onclick = () => { stopAudio(); if (it.nw) later({ id: w.id, k: 'mean', nw: 1 }, 2); S.i++; save(); show(); };
  } else if (it.k === 'mean' || it.k === 'twin' || it.k === 'gap') {
    if (it.k === 'mean') play(w.id, ['w']);
    document.querySelectorAll('.opt').forEach(b => b.onclick = () => choose(it, w, b));
  } else {
    const ty = $('#ty');
    if (!TEST) setTimeout(() => ty.focus(), 50);
    const check = () => typed(it, w, ty.value);
    $('#ck').onclick = check;
    ty.onkeydown = e => { if (e.key === 'Enter') check(); };
    $('#idk').onclick = () => typed(it, w, '');
  }
}
function choose(it, w, btn) {
  const ok = btn.dataset.id === w.id;
  document.querySelectorAll('.opt').forEach(b => { b.disabled = true; if (b.dataset.id === w.id) b.classList.add('ok'); else if (b === btn) b.classList.add('bad'); });
  settle(it, ok); save();
  feedback(it, w, ok, ok ? '' : `It is <b>${esc(w.w)}</b>.`);
}
function lev(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0)));
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function accepts(w) {
  const base = w.w.toLowerCase(), set = new Set([base, exForm(w).toLowerCase()]);
  [...set].forEach(s => { set.add(s.replace(/is(e|ed|es|ing|ation)\b/g, 'iz$1')); set.add(s.replace(/iz(e|ed|es|ing|ation)\b/g, 'is$1')); });
  if (base === 'stumble upon') set.add('stumble on');
  return set;
}
function typed(it, w, val) {
  const v = val.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  const acc = accepts(w);
  let ok = acc.has(v), note = '';
  if (!ok && v && w.w.length >= 6 && [...acc].some(a => lev(v, a) === 1)) { ok = true; note = `Almost perfect. The spelling is <b>${esc(w.w)}</b>.`; }
  $('#ty').disabled = true; $('#ck').disabled = true; $('#idk').disabled = true;
  settle(it, ok); save();
  feedback(it, w, ok, ok ? note : (v ? `You wrote "${esc(val.trim())}". It is <b>${esc(w.w)}</b>.` : `It is <b>${esc(w.w)}</b>.`));
}
function feedback(it, w, ok, msg) {
  const fb = $('#fb');
  if (ok && !msg) {
    fb.innerHTML = `<div class="fb ok">Right. <span class="note">${esc(w.tr)}</span></div>`;
    if (st.sound && it.k !== 'mean') play(w.id, ['w']);
    setTimeout(() => { if (S && S.q[S.i] === it) { S.i++; show(); } }, TEST ? 0 : 1100);
    return;
  }
  fb.innerHTML = `<div class="fb ${ok ? 'warn' : 'bad'}">${msg}</div>
    ${ok ? '' : `<div class="card" style="margin:10px 0 0">${cardHtml(w)}</div>`}
    <button class="btn" id="nx">Next</button>`;
  bindSay(fb);
  if (!ok) play(w.id, ['w', 'x']);
  setTimeout(() => { try { fb.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) {} }, 150);
  $('#nx').onclick = () => { stopAudio(); S.i++; show(); };
}
function finish() {
  const hard = [...S.hard].map(id => BY[id]);
  const all = counts(W);
  $('#app').innerHTML = `<div class="card" style="margin-top:24px"><div class="done-big">🎉</div>
    <h2 style="text-align:center">Session done</h2>
    <div class="stat"><div><b>${S.right}</b><span>right</span></div><div><b>${S.wrong}</b><span>wrong</span></div><div><b>${S.learned}</b><span>new learned</span></div></div>
    ${hard.length ? `<div class="lab">Look at these once more</div><div class="chips">${hard.map(w => `<span>${esc(w.w)} = ${esc(w.tr.split(',')[0])}</span>`).join('')}</div>` : ''}
    <p class="note" style="margin-top:12px">${all.l} of ${all.n} words learned so far.</p>
    <button class="btn" id="hm">Home</button></div>`;
  $('#hm').onclick = home;
  S = null; save();
}
function offlineStatus() {
  const el = $('#off'); if (!el || !('caches' in window)) return;
  const need = W.length * 2;
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('tw-')).map(k => caches.open(k).then(c => c.keys()))))
    .then(arr => { const n = new Set([].concat(...arr).map(r => r.url).filter(u => u.includes('/audio/'))).size;
      el.textContent = n >= need ? 'Offline ready ✓ (works without internet)' : `Saving for offline: ${Math.min(n, need)} of ${need} files...`;
      if (n < need) setTimeout(offlineStatus, 3000); })
    .catch(() => {});
}

/* ---------- start ---------- */
if ('serviceWorker' in navigator && !TEST && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.TW = { get st() { return st; }, set st(v) { st = v; }, get S() { return S; }, startSession, home, save, today, plan, BY, W, P, settle, show, options, clash, accepts, newWords, fixCur };
home();
if (TEST) { const s = document.createElement('script'); s.src = 'test.js'; document.body.appendChild(s); }
})();
