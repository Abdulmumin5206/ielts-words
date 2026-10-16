/* Self-test: open index.html?test (own storage key). Clicks through real sessions and checks the boxes.
   Result goes to <pre id="testout"> and document.title (PASS / FAIL n). */
(async function () {
  const T = window.TW, out = [], fails = [];
  const shot = new URLSearchParams(location.search).get('shot');
  if (shot) {   // screenshot states for build checks
    T.st = Object.assign(T.st, { w: {}, cur: T.P[0].id, newPer: 10, sound: false, log: [], days: {}, shift: 0 }); T.save();
    const put = k => { T.startSession(); T.S.q[0] = { id: 'exacerbate', k }; T.show(); };
    if (shot === 'home') T.home();
    else if (shot === 'learn') T.startSession();
    else if (['mean', 'twin', 'gap', 'type'].includes(shot)) put(shot);
    else if (shot === 'wrong') { put('gap'); [...document.querySelectorAll('.opt')].find(b => b.dataset.id !== 'exacerbate').click(); window.scrollTo(0, 0); }
    else {
      T.W.slice(0, 26).forEach((w, i) => T.st.w[w.id] = { b: i < 6 ? 3 : 1, dd: T.today(), r: 1, x: i % 5 === 0 ? 2 : 0 });
      T.save(); T.home();
      if (shot === 'packs') document.getElementById('packs').click();
      if (shot === 'list') { document.getElementById('list').click(); document.querySelector('.it .hd').click(); }
      if (shot === 'finish') { T.startSession(); T.S.right = 23; T.S.wrong = 3; T.S.learned = 10; ['bleak','halt','urge'].forEach(i => T.S.hard.add(i)); T.S.i = T.S.q.length; T.show(); }
    }
    return;
  }
  const ok = (c, m) => { out.push((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };
  const tick = () => new Promise(r => setTimeout(r, 0));
  T.st = Object.assign(T.st, { w: {}, cur: T.P[0].id, newPer: 10, sound: false, log: [], days: {}, shift: 0 });
  T.save();
  const cur = () => T.S && T.S.q[T.S.i];
  async function run(wrongIds) {   // answer the whole session; wrongIds: answer these wrong once
    wrongIds = new Set(wrongIds || []); let steps = 0;
    while (T.S && steps++ < 400) {
      const it = cur(); if (!it) break;
      const w = T.BY[it.id];
      if (it.k === 'learn') document.getElementById('nx').click();
      else if (it.k === 'type') {
        const bad = wrongIds.delete(it.id);
        document.getElementById('ty').value = bad ? 'zzz' : w.w; document.getElementById('ck').click();
      } else {
        const bad = wrongIds.delete(it.id);
        const b = [...document.querySelectorAll('.opt')].find(x => bad ? x.dataset.id !== it.id : x.dataset.id === it.id);
        b.click();
      }
      await tick(); await tick();
      const nx = document.getElementById('nx'); if (nx && cur() && cur().k !== 'learn') { nx.click(); await tick(); }
    }
    return steps;
  }
  // 1. first session: 10 new words from the first pack
  let p = T.plan();
  ok(p.reviews.length === 0 && p.fresh.length === 10 && p.fresh.every(w => w.pack === 'c20t4'), 'day 1 plan = 10 new from C20 T4');
  T.startSession();
  ok(T.S.q.length === 10 && T.S.q.every(x => x.k === 'learn'), 'session starts with 10 learn cards');
  const steps = await run();
  ok(steps === 30, 'new words: learn + meaning + gap = 30 steps (got ' + steps + ')');
  const ten = p.fresh.map(w => T.st.w[w.id]);
  ok(ten.every(r => r && r.b === 1 && r.dd === T.today() + 1), 'all 10 in box 1, due tomorrow');
  ok(T.plan().reviews.length === 0, 'nothing due again today');
  // 2. next day: 10 reviews + 10 new; answer one review wrong
  T.st.shift = 1; T.save(); T.home();
  p = T.plan();
  ok(p.reviews.length === 10 && p.fresh.length === 10, 'day 2 plan = 10 reviews + 10 new');
  const wrongId = p.reviews[0].id;
  T.startSession(); await run([wrongId]);
  const rw = T.st.w[wrongId];
  ok(rw.b === 1 && rw.x === 1 && rw.dd === T.today() + 1, 'wrong review goes back to box 1');
  ok(p.reviews.slice(1).every(w => T.st.w[w.id].b === 2 && T.st.w[w.id].dd === T.today() + 2), 'right reviews go to box 2 (+2 days)');
  ok(Object.values(T.st.w).filter(r => r.b >= 1).length === 20, '20 words learned after day 2');
  // 3. pack finished -> next pack
  T.st.shift = 3; T.save(); T.home();
  p = T.plan();
  ok(p.fresh.length === 10 && p.fresh.every(w => w.pack === 'q'), 'C20 T4 finished, new words come from Question words');
  ok(T.st.cur === 'q', 'current pack moved to Question words');
  const box2 = p.reviews.filter(w => T.st.w[w.id].b === 2).map(w => w.id);
  T.startSession();
  ok(T.S.q.filter(x => box2.includes(x.id)).every(x => x.k === 'type'), 'box 2 words are asked by typing');
  await run();
  ok(box2.length === 9 && box2.every(id => T.st.w[id].b === 3 && T.st.w[id].dd === T.today() + 4), 'typed right -> box 3 "known", +4 days');
  // 4. leaving in the middle keeps unfinished new words as new
  T.st.w['bleak'] = { b: 0, dd: T.today(), r: 0, x: 0 };
  ok(T.newWords(500).some(w => w.id === 'bleak'), 'a word seen but not finished counts as new again');
  // 5. options never contain a twin-word clash and always 4 different words
  let bad = 0;
  for (const w of T.W) for (let i = 0; i < 20; i++) for (const f of ['en', 'tw', 'w']) {
    const o = T.options(w, f); const ids = new Set(o.map(x => x.id));
    if (o.length !== 4 || ids.size !== 4 || !ids.has(w.id) || o.some(x => x.id !== w.id && T.clash(w, x))) bad++;
  }
  ok(bad === 0, 'answer options: 4 different, no twin clashes (' + bad + ' bad)');
  ok(T.clash(T.BY['amass'], T.BY['accumulate']) && T.clash(T.BY['thrive'], T.BY['prosper']), 'clash finds amass/accumulate and thrive/prosper');
  // 6. typing accepts
  const acc = id => T.accepts(T.BY[id]);
  ok(acc('mechanise').has('mechanize') && acc('ostracise').has('ostracize'), 'typing accepts -ize spelling');
  ok(acc('stumble-upon').has('stumble on'), 'typing accepts "stumble on"');
  ok(acc('accumulate').has('accumulates'), 'typing accepts the form in the example');
  ok(T.W.length === 177, '177 words');
  document.body.insertAdjacentHTML('beforeend', '<pre id="testout">' + out.join('\n') + '\n' + (fails.length ? 'FAILED ' + fails.length : 'ALL PASSED') + '</pre>');
  document.title = fails.length ? 'FAIL ' + fails.length : 'PASS';
})();
