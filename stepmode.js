/* ============================================================
 *  stepmode.js — 차근차근 모드 공통 엔진 (2026-09-23)
 *  기획: docs/차근차근모드_기획.md
 *
 *  게임 화면 위에 카드형 연습 화면을 띄운다. 시간 제한 없음 · 힌트 3단계 · 틀리면 해설 카드 ·
 *  틀린 문제는 3문제 뒤에 한 번 더 · 끝나면 점수 대신 "오늘 익힌 것 / 다시 볼 것".
 *
 *  ⚠ 기록 원칙(성일님 결정)
 *   - 누가 썼는지 **다른 사람에게 보이지 않게**: 점수(scores·score_history)·판별(level_rounds)·
 *     오답(wrong_answers)·주제통계(topic_attempts)·팀전에 **아무것도 쓰지 않는다.**
 *     게임의 endGame/저장 함수를 아예 부르지 않는 별도 화면이라 저절로 지켜진다.
 *   - 대신 성장 분석용 전용 테이블(step_rounds·step_answers·step_prompts)에만 insert 한다.
 *     이 테이블들은 anon 이 select 할 수 없다(RLS insert 전용) — 학생이 남의 사용 여부를 못 본다.
 *   - 틀린 문제는 **이 기기 오답노트에만** 남긴다(WrongNote.flush(game,{localOnly:true})).
 *
 *  게임 쪽 사용:
 *    StepMode.mount({ game:'acid', host: 요소, label:'🐢 차근차근 모드' })   // 시작 화면에 버튼+권유
 *    StepMode.start({ game, title, pool:[문항…], n:10 })
 *
 *  문항 형식:
 *    { key, type, learn:'요약 한 줄', wrong:{q, correct},
 *      steps:[ { prompt:html, options:[{label, html?}], answer:idx,
 *                hints:[ '문장' | {text, eliminate:true} ],   // 최대 2개 + 자동 ③정답 보기
 *                explain:function(chosen, ok){ return html } } ] }
 * ============================================================ */
(function (global) {
  'use strict';

  var SUPABASE_URL = 'https://pjagaulfivafamhhiveg.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_yck2tAKApEjVSJOJMVSXuQ_AGaNatuI';
  var STATS_KEY = 'am_step_stats';        // 권유 판단용 이 기기 기록 { game:{ r:[[c,t,day]], w:{key:[day…]} } }
  var DISMISS_KEY = 'am_step_dismiss_';   // + game → 'YYYY-MM-DD' (그날은 다시 안 띄움)
  var PENDING_KEY = 'am_step_pending';    // 못 보낸 기록(오프라인) — 다음 방문 때 재전송

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function jGet(k, d) { try { return JSON.parse(lsGet(k) || '') || d; } catch (e) { return d; } }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function user() { return (lsGet('hub_nickname') || '').trim(); }
  function groupId() { return lsGet('hub_group_id') || null; }
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function platform() {
    try { var C = global.Capacitor; if (C && C.isNativePlatform && C.isNativePlatform()) return (C.getPlatform && C.getPlatform()) || 'app'; } catch (e) {}
    return 'web';
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ── 서버 기록(전용 테이블, insert 만) ─────────────────────────
     fetch keepalive 로 보낸다 — 페이지를 떠나는 순간(pagehide)에도 끝까지 간다.
     실패하면 이 기기에 쌓아 두었다가 다음에 다시 보낸다(수업 중 와이파이 끊김). */
  function post(table, rows, keepalive) {
    if (!rows || !rows.length) return Promise.resolve(true);
    if (global.__AM_STEP_NO_NET) { (global.__AM_STEP_SENT = global.__AM_STEP_SENT || []).push({ table: table, rows: rows }); return Promise.resolve(true); }
    try {
      return fetch(SUPABASE_URL + '/rest/v1/' + table, {
        method: 'POST', keepalive: !!keepalive,
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(rows)
      }).then(function (r) { if (!r.ok) throw new Error(r.status); return true; })
        .catch(function () { queue(table, rows); return false; });
    } catch (e) { queue(table, rows); return Promise.resolve(false); }
  }
  function queue(table, rows) {
    var p = jGet(PENDING_KEY, []);
    p.push({ t: table, r: rows });
    if (p.length > 30) p = p.slice(-30);
    lsSet(PENDING_KEY, JSON.stringify(p));
  }
  function retryPending() {
    var p = jGet(PENDING_KEY, []);
    if (!p.length) return;
    lsSet(PENDING_KEY, '[]');
    p.forEach(function (x) { post(x.t, x.r); });
  }

  /* ── 권유 판단(이 기기 기록만, 서버 조회 없음) ──────────────────
     ① 그 게임 최근 판들 정답률 50% 미만(10문항 이상)  ② 같은 문제를 3일 이상 틀림 */
  var active = false;
  function stats() { return jGet(STATS_KEY, {}); }
  function saveStats(s) { lsSet(STATS_KEY, JSON.stringify(s)); }
  function gs(s, g) { if (!s[g]) s[g] = { r: [], w: {} }; return s[g]; }
  function noteRound(g, c, t) {
    if (active || !g || !(t > 0)) return;
    g = String(g).replace(/_d2$/, '');
    var s = stats(), x = gs(s, g);
    x.r.push([c | 0, t | 0, today()]);
    if (x.r.length > 5) x.r = x.r.slice(-5);
    saveStats(s);
  }
  function noteWrong(g, key) {
    if (active || !g || key == null) return;
    var s = stats(), x = gs(s, g), d = today(), k = String(key).slice(0, 80);
    var arr = x.w[k] || [];
    if (arr.indexOf(d) === -1) arr.push(d);
    x.w[k] = arr.slice(-6);
    // 14일 지난 기록은 버린다
    var cut = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
    Object.keys(x.w).forEach(function (kk) {
      x.w[kk] = x.w[kk].filter(function (dd) { return dd >= cut; });
      if (!x.w[kk].length) delete x.w[kk];
    });
    saveStats(s);
  }
  /* 게임 코드를 고치지 않고 기존 기록 호출을 엿들어 권유 근거를 모은다.
     차근차근 모드 진행 중(active)에는 세지 않는다. */
  function hook() {
    var D = global.Difficulty;
    if (D && D.logRound && !D.logRound.__step) {
      var o = D.logRound;
      D.logRound = function (g, lv, c, t) { try { noteRound(g, c, t); } catch (e) {} return o.apply(this, arguments); };
      D.logRound.__step = true;
    }
    var W = global.WrongNote;
    if (W && W.add && !W.add.__step) {
      var a = W.add;
      W.add = function (rec) { try { if (rec) noteWrong(rec.game, rec.key); } catch (e) {} return a.apply(this, arguments); };
      W.add.__step = true;
    }
    var G = global.Growth;
    if (G && G.logTopicAttempt && !G.logTopicAttempt.__step) {   // 이론 퀴즈: 문항 단위로 온다 → 판으로 묶어 센다
      var lt = G.logTopicAttempt, buf = {};
      G.logTopicAttempt = function (o) {
        try {
          if (o && o.game) {
            var b = buf[o.game] || (buf[o.game] = { c: 0, t: 0 });
            b.t++; if (o.correct) b.c++;
            if (b.t >= 10) { noteRound(o.game, b.c, b.t); buf[o.game] = { c: 0, t: 0 }; }
          }
        } catch (e) {}
        return lt.apply(this, arguments);
      };
      G.logTopicAttempt.__step = true;
    }
  }
  function suggestReason(g) {
    var x = stats()[g];
    if (!x) return null;
    var c = 0, t = 0;
    x.r.forEach(function (r) { c += r[0]; t += r[1]; });
    if (t >= 10 && c / t < 0.5) return 'acc<50';
    var keys = Object.keys(x.w);
    for (var i = 0; i < keys.length; i++) if (x.w[keys[i]].length >= 3) return 'repeat3days';
    return null;
  }

  /* 이 기기 오답노트에서 이 게임 문제 키(많이 틀린 순) */
  function localWrongKeys(g) {
    var b = jGet('hub_wrongnotes', {})[user() || '게스트'] || {};
    return Object.keys(b).map(function (k) { return b[k]; })
      .filter(function (r) { return r.game === g; })
      .sort(function (a, c) { return (c.count || 1) - (a.count || 1); })
      .map(function (r) { return String(r.key).replace(/_cat$/, ''); });   // 산성비 분류오답('_cat')은 같은 단어로
  }

  /* ── 화면 ───────────────────────────────────────────────── */
  function css() {
    if (document.getElementById('am-step-css')) return;
    var s = document.createElement('style');
    s.id = 'am-step-css';
    s.textContent = [
      '#am-step{position:fixed;inset:0;z-index:99990;background:#081322;color:#eaf2ff;display:none;flex-direction:column;',
      ' font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;word-break:keep-all;overflow-wrap:anywhere;',
      ' -webkit-user-select:none;user-select:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}',
      '#am-step.open{display:flex}',
      '#am-step .st-top{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.08)}',
      '#am-step .st-badge{font-size:.72rem;font-weight:700;color:#9fe3c0;background:rgba(80,200,140,.12);border:1px solid rgba(80,200,140,.35);border-radius:999px;padding:3px 10px;white-space:nowrap}',
      '#am-step .st-title{flex:1;font-size:.86rem;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#am-step .st-prog{font-size:.8rem;opacity:.7;font-variant-numeric:tabular-nums}',
      '#am-step .st-x{background:none;border:1px solid rgba(255,255,255,.18);color:#eaf2ff;border-radius:10px;padding:6px 12px;font-size:.8rem}',
      '#am-step .st-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:18px 16px 28px}',
      '#am-step .st-wrap{max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:14px}',
      '#am-step .st-card{background:#0f1f36;border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:18px 16px}',
      '#am-step .st-stepno{font-size:.72rem;opacity:.6;margin-bottom:6px;letter-spacing:.04em}',
      '#am-step .st-prompt{font-size:1.02rem;line-height:1.6;white-space:pre-line}',
      '#am-step .st-prompt .big{display:block;font-size:1.6rem;font-weight:800;text-align:center;margin:6px 0 2px;white-space:normal}',
      '#am-step .st-opts{display:flex;flex-direction:column;gap:10px}',
      '#am-step .st-opt{min-height:52px;text-align:left;background:#12284a;border:1.5px solid rgba(120,170,255,.25);color:#eaf2ff;border-radius:14px;padding:12px 14px;font-size:.98rem;line-height:1.45}',
      '#am-step .st-opt:disabled{opacity:.35}',
      '#am-step .st-opt.ok{border-color:#3ddc97;background:rgba(61,220,151,.14);opacity:1}',
      '#am-step .st-opt.no{border-color:#ff6b8a;background:rgba(255,107,138,.12)}',
      '#am-step .st-opt.show{border-color:#ffd166;box-shadow:0 0 0 2px rgba(255,209,102,.35)}',
      '#am-step .st-hints{display:flex;flex-direction:column;gap:8px}',
      '#am-step .st-hbtn{align-self:flex-start;background:none;border:1px dashed rgba(255,209,102,.6);color:#ffd166;border-radius:12px;padding:9px 14px;font-size:.88rem}',
      '#am-step .st-hint{background:rgba(255,209,102,.08);border-left:3px solid #ffd166;border-radius:8px;padding:10px 12px;font-size:.9rem;line-height:1.55}',
      '#am-step .st-exp{background:#0c2a24;border:1px solid rgba(61,220,151,.3);border-radius:14px;padding:14px;font-size:.92rem;line-height:1.65}',
      '#am-step .st-exp.bad{background:#2a1020;border-color:rgba(255,107,138,.35)}',
      '#am-step .st-exp b.v{display:block;font-size:1rem;margin-bottom:6px}',
      '#am-step .st-go{min-height:50px;border:none;border-radius:14px;background:#3ddc97;color:#062016;font-weight:800;font-size:1rem}',
      '#am-step .st-note{font-size:.78rem;opacity:.6;line-height:1.5}',
      '#am-step .st-list{margin:6px 0 0;padding-left:18px;line-height:1.7;font-size:.92rem}',
      '#am-step h3{margin:0 0 6px;font-size:1rem}',
      '.am-step-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:44px;margin-top:10px;background:rgba(80,200,140,.1);border:1.5px solid rgba(80,200,140,.45);color:#9fe3c0;border-radius:12px;font-size:.9rem;font-weight:700;font-family:inherit}',
      '.am-step-sug{margin-top:8px;background:rgba(255,209,102,.08);border:1px solid rgba(255,209,102,.35);border-radius:12px;padding:10px 12px;font-size:.84rem;line-height:1.5;color:#ffe6a6;text-align:left}',
      '.am-step-sug .row{display:flex;gap:8px;margin-top:8px}',
      '.am-step-sug button{flex:1;min-height:38px;border-radius:10px;font-size:.84rem;font-family:inherit;border:1px solid rgba(255,255,255,.2);background:none;color:#eaf2ff}',
      '.am-step-sug button.y{background:#3ddc97;color:#062016;border:none;font-weight:700}'
    ].join('\n');
    document.head.appendChild(s);
  }

  var el = null;
  function root() {
    if (el) return el;
    css();
    el = document.createElement('div');
    el.id = 'am-step';
    el.setAttribute('role', 'dialog');
    el.innerHTML = '<div class="st-top"><span class="st-badge">차근차근 모드</span><span class="st-title"></span>' +
      '<span class="st-prog"></span><button class="st-x" type="button">그만하기</button></div>' +
      '<div class="st-body"><div class="st-wrap"></div></div>';
    document.body.appendChild(el);
    el.querySelector('.st-x').onclick = function () { finish(false); };
    return el;
  }
  function wrap() { return root().querySelector('.st-wrap'); }
  function scrollBottom() { var b = root().querySelector('.st-body'); setTimeout(function () { b.scrollTop = b.scrollHeight; }, 30); }

  /* ── 한 판 진행 ─────────────────────────────────────────── */
  var R = null;   // 현재 판

  function pickQuestions(pool, n, game) {
    var wk = localWrongKeys(game), byKey = {};
    pool.forEach(function (q) { byKey[q.key] = q; });
    var out = [], used = {};
    // 이 기기 오답노트에서 자주 틀린 문제를 절반까지 먼저
    for (var i = 0; i < wk.length && out.length < Math.ceil(n / 2); i++) {
      var q = byKey[wk[i]];
      if (q && !used[q.key]) { out.push(q); used[q.key] = 1; }
    }
    shuffle(pool.slice()).forEach(function (q) { if (out.length < n && !used[q.key]) { out.push(q); used[q.key] = 1; } });
    return shuffle(out);
  }

  function start(opt) {
    if (!opt || !opt.pool || !opt.pool.length) return;
    hook();
    active = true;
    var n = opt.n || 10;
    R = {
      game: opt.game, title: opt.title || '', onClose: opt.onClose,
      key: opt.game + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      startedAt: new Date().toISOString(),
      list: pickQuestions(opt.pool, n, opt.game).map(function (q) { return { q: q, again: false }; }),
      i: 0, answers: [], cards: 0, hints: 0, res: {}, wrongs: [], sent: false, pool0: opt.pool, n: n
    };
    try { if (global.AdBridge && AdBridge.hide) AdBridge.hide(); } catch (e) {}
    root().classList.add('open');
    root().querySelector('.st-title').textContent = R.title;
    document.documentElement.style.overflow = 'hidden';
    intro();
  }

  function intro() {
    var w = wrap();
    w.innerHTML = '<div class="st-card"><h3>천천히, 하나씩 풀어 봐요</h3>' +
      '<div class="st-note" style="opacity:.85;font-size:.9rem">⏳ 시간 제한이 없어요.<br>💡 막히면 힌트를 한 단계씩 열어 보세요.<br>' +
      '📘 틀려도 괜찮아요. 왜 그런지 설명을 보고 다시 골라요.<br>🔁 틀린 문제는 조금 뒤에 한 번 더 나와요.</div></div>' +
      '<div class="st-note">차근차근 모드 기록은 점수·랭킹·팀전 점수에 들어가지 않아요. 틀린 문제는 내 오답노트에만 남아요.</div>' +
      '<button class="st-go" type="button">시작하기 (' + R.list.length + '문제)</button>';
    w.querySelector('.st-go').onclick = function () { showItem(); };
  }

  function prog() {
    root().querySelector('.st-prog').textContent = Math.min(R.i + 1, R.list.length) + ' / ' + R.list.length;
  }

  function showItem() {
    if (R.i >= R.list.length) return finish(true);
    var it = R.list[R.i];
    it.si = 0; it.hintMax = 0; it.wrongTries = 0; it.t0 = Date.now(); it.cleanAll = true;
    showStep();
  }

  function showStep() {
    prog();
    var it = R.list[R.i], q = it.q, st = q.steps[it.si];
    var w = wrap();
    var multi = q.steps.length > 1;
    var h = '<div class="st-card">' + (multi ? '<div class="st-stepno">' + (it.si + 1) + '단계 / ' + q.steps.length + '단계' + (st.stepName ? ' · ' + esc(st.stepName) : '') + '</div>' : '') +
      '<div class="st-prompt">' + st.prompt + '</div></div>' +
      '<div class="st-opts">';
    st.options.forEach(function (o, i) {
      h += '<button class="st-opt" type="button" data-i="' + i + '">' + (o.html || esc(o.label)) + '</button>';
    });
    h += '</div><div class="st-hints"></div><div class="st-after"></div>';
    w.innerHTML = h;
    it.used = 0; it.stepWrong = false; it.elim = {};
    renderHints();
    w.querySelectorAll('.st-opt').forEach(function (b) { b.onclick = function () { choose(parseInt(b.getAttribute('data-i'), 10)); }; });
    root().querySelector('.st-body').scrollTop = 0;
  }

  function hintList(st) {
    var hs = (st.hints || []).slice(0, 2).map(function (h) { return typeof h === 'string' ? { text: h } : h; });
    hs.push({ text: '정답을 표시했어요. 표시된 보기를 눌러 보세요.', reveal: true });
    return hs;
  }

  function renderHints() {
    var it = R.list[R.i], st = it.q.steps[it.si], hs = hintList(st);
    var box = wrap().querySelector('.st-hints');
    var h = '';
    for (var k = 0; k < it.used; k++) h += '<div class="st-hint">💡 ' + (k + 1) + '. ' + hs[k].text + '</div>';
    if (it.used < hs.length) {
      var lab = hs[it.used].reveal ? '👀 정답 보기' : '💡 힌트 ' + (it.used + 1) + ' 보기';
      h += '<button class="st-hbtn" type="button">' + lab + '</button>';
    }
    box.innerHTML = h;
    var hb = box.querySelector('.st-hbtn');
    if (hb) hb.onclick = function () {
      var x = hs[it.used];
      it.used++; R.hints++;
      it.hintMax = Math.max(it.hintMax, it.used);
      if (x.eliminate != null && x.eliminate !== false) eliminateOne(x.eliminate);
      if (x.reveal) { var ob = wrap().querySelector('.st-opt[data-i="' + st.answer + '"]'); if (ob) ob.classList.add('show'); }
      renderHints();
    };
  }

  function eliminateOne(which) {
    var it = R.list[R.i], st = it.q.steps[it.si];
    if (typeof which === 'number') {   // 문항이 지울 보기를 정해 준 경우(그 보기가 틀린 이유를 힌트로 같이 보여 줄 때)
      var t = wrap().querySelector('.st-opt[data-i="' + which + '"]');
      if (t && which !== st.answer) { t.disabled = true; return; }
    }
    var cand = [];
    wrap().querySelectorAll('.st-opt').forEach(function (b) {
      var i = parseInt(b.getAttribute('data-i'), 10);
      if (i !== st.answer && !b.disabled) cand.push(b);
    });
    if (cand.length) cand[Math.floor(Math.random() * cand.length)].disabled = true;
  }

  function choose(i) {
    var it = R.list[R.i], q = it.q, st = q.steps[it.si];
    var ok = i === st.answer;
    var btn = wrap().querySelector('.st-opt[data-i="' + i + '"]');
    var after = wrap().querySelector('.st-after');
    var body = '';
    try { body = st.explain ? st.explain(i, ok) : ''; } catch (e) { body = ''; }
    if (ok) {
      btn.classList.add('ok');
      wrap().querySelectorAll('.st-opt').forEach(function (b) { b.disabled = true; });
      wrap().querySelector('.st-hints').querySelectorAll('.st-hbtn').forEach(function (b) { b.remove(); });
      if (it.used > 0 || it.stepWrong) it.cleanAll = false;
      var last = it.si >= q.steps.length - 1;
      after.innerHTML = '<div class="st-exp"><b class="v">✓ 맞았어요!</b>' + body + '</div>' +
        '<button class="st-go" type="button" style="margin-top:12px;width:100%">' + (last ? (R.i + 1 >= R.list.length ? '끝내기' : '다음 문제 →') : '다음 단계 →') + '</button>';
      after.querySelector('.st-go').onclick = function () {
        if (!last) { it.si++; showStep(); return; }
        doneItem();
      };
      scrollBottom();
    } else {
      btn.classList.add('no'); btn.disabled = true;
      it.wrongTries++; it.stepWrong = true; it.cleanAll = false; R.cards++;
      after.innerHTML = '<div class="st-exp bad"><b class="v">✗ 아쉬워요. 이유를 보고 다시 골라 봐요</b>' + body + '</div>' +
        '<button class="st-go" type="button" style="margin-top:12px;width:100%;background:#ffd166;color:#2a1d00">알겠어요</button>';
      wrap().querySelectorAll('.st-opt').forEach(function (b) { b.style.pointerEvents = 'none'; });
      after.querySelector('.st-go').onclick = function () {
        after.innerHTML = '';
        wrap().querySelectorAll('.st-opt').forEach(function (b) { b.style.pointerEvents = ''; });
        wrap().querySelector('.st-prompt').scrollIntoView({ block: 'nearest' });
      };
      scrollBottom();
    }
  }

  function doneItem() {
    var it = R.list[R.i], q = it.q;
    R.answers.push({
      round_key: R.key, user_name: user() || '게스트', group_id: groupId(), game_id: R.game,
      q_key: String(q.key).slice(0, 200), first_try_correct: !!it.cleanAll,
      hint_level: Math.min(3, it.hintMax), wrong_tries: Math.min(50, it.wrongTries),
      ms: Math.min(3600000, Date.now() - it.t0)
    });
    var r = R.res[q.key] || (R.res[q.key] = { q: q, clean: false, first: false, tries: 0 });
    r.tries++;
    if (it.cleanAll) r.clean = true;                 // 요약 "오늘 익힌 것"(다시 풀어 맞힌 것 포함)
    if (it.cleanAll && r.tries === 1) r.first = true; // 서버 correct_nohint — 처음 볼 때 힌트 없이 맞힌 것만
    if (!it.cleanAll) {
      if (it.wrongTries > 0 || it.hintMax >= 3) R.wrongs.push(q);
      // 처음 틀린 문제는 3문제 뒤에 한 번 더(두 번째에도 틀리면 더 넣지 않는다 — 끝이 안 나는 판 방지)
      if (!it.again) {
        var pos = Math.min(R.list.length, R.i + 4);
        R.list.splice(pos, 0, { q: q, again: true });
      }
    }
    R.i++;
    showItem();
  }

  function flushServer(finished, keepalive) {
    if (!R || R.sent) return;
    R.sent = true;
    var seen = Object.keys(R.res);
    var clean = seen.filter(function (k) { return R.res[k].first; }).length;
    var u = user() || '게스트';
    if (R.answers.length || finished) {
      post('step_rounds', [{
        round_key: R.key, user_name: u, group_id: groupId(), game_id: R.game,
        started_at: R.startedAt, questions: Math.min(500, seen.length), correct_nohint: Math.min(500, clean),
        hints_used: Math.min(2000, R.hints), cards_seen: Math.min(2000, R.cards),
        finished: !!finished, source: platform()
      }], keepalive);
      post('step_answers', R.answers, keepalive);
    }
    // 이 기기 오답노트에만(서버 wrong_answers 에는 안 감)
    var W = global.WrongNote;
    if (W && R.wrongs.length) {
      var seenW = {};
      try {
        W.reset();
        R.wrongs.forEach(function (q) {
          if (seenW[q.key]) return; seenW[q.key] = 1;
          var wr = q.wrong || {};
          W.add({ game: R.game, key: q.key, q: wr.q || '', correct: wr.correct || '', wrong: null, type: q.type || '' });
        });
        W.flush(R.game, { localOnly: true });
      } catch (e) {}
    }
  }

  function finish(completed) {
    if (!R) return close();
    if (!completed && R.answers.length) {
      var ask = global.Ask && Ask.confirm ? Ask.confirm('여기까지 할까요? 지금까지 푼 것은 저장돼요.') : Promise.resolve(global.confirm('여기까지 할까요?'));
      Promise.resolve(ask).then(function (y) { if (y) summary(false); });
      return;
    }
    if (!completed) { flushServer(false); return close(); }
    summary(true);
  }

  function summary(completed) {
    flushServer(completed);
    root().querySelector('.st-prog').textContent = '';
    var learned = [], again = [];
    Object.keys(R.res).forEach(function (k) {
      var r = R.res[k];
      (r.clean ? learned : again).push(r.q.learn || r.q.key);
    });
    var w = wrap();
    var h = '<div class="st-card"><h3>🌱 오늘 익힌 것</h3>' +
      (learned.length ? '<ul class="st-list">' + learned.slice(0, 5).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
        (learned.length > 5 ? '<div class="st-note">외 ' + (learned.length - 5) + '개</div>' : '')
        : '<div class="st-note" style="font-size:.9rem">아직 없어요. 힌트 없이 한 번 맞히면 여기에 쌓여요.</div>') + '</div>';
    if (again.length) h += '<div class="st-card"><h3>🔁 다시 볼 것</h3><ul class="st-list">' +
      again.slice(0, 3).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<div class="st-note">오답노트에서 다시 볼 수 있어요.</div></div>';
    h += '<button class="st-go" type="button">한 번 더 하기</button>' +
      '<button class="st-x" type="button" style="min-height:46px">게임 화면으로 돌아가기</button>';
    w.innerHTML = h;
    var last = { game: R.game, title: R.title, pool: R.pool0, n: R.n, onClose: R.onClose };
    w.querySelector('.st-go').onclick = function () { var o = last; R = null; start(o); };
    w.querySelector('.st-x').onclick = function () { close(); };
  }

  function close() {
    var cb = R && R.onClose;
    R = null; active = false;
    if (el) el.classList.remove('open');
    document.documentElement.style.overflow = '';
    try { if (global.AdBridge && AdBridge.show) AdBridge.show(); } catch (e) {}
    if (typeof cb === 'function') try { cb(); } catch (e) {}
  }

  // 판 도중에 앱을 닫거나 다른 화면으로 가도 푼 만큼은 남긴다
  function onHide() { if (R && !R.sent && R.answers.length) flushServer(false, true); }
  global.addEventListener('pagehide', onHide);

  /* ── 시작 화면 버튼 + 본인에게만 보이는 권유 ────────────────── */
  function mount(opt) {
    hook();
    retryPending();
    css();
    var host = opt.host;
    if (!host || host.querySelector('.am-step-btn')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'am-step-btn';
    b.innerHTML = '🐢 차근차근 모드' + (opt.sub ? ' <span style="font-weight:400;opacity:.75;font-size:.78rem">' + esc(opt.sub) + '</span>' : '');
    b.onclick = function () { opt.onStart(); };
    host.appendChild(b);

    var reason = suggestReason(opt.game);
    if (!reason || lsGet(DISMISS_KEY + opt.game) === today()) return;
    var sug = document.createElement('div');
    sug.className = 'am-step-sug';
    sug.innerHTML = '이 부분이 계속 헷갈리네요. 차근차근 모드로 천천히 연습해 볼까요?' +
      '<div class="row"><button type="button" class="n">괜찮아요</button><button type="button" class="y">해 볼게요</button></div>';
    host.appendChild(sug);
    var logged = false;
    function log(acc) {
      if (logged) return; logged = true;
      post('step_prompts', [{ user_name: user() || '게스트', group_id: groupId(), game_id: opt.game, reason: reason, accepted: acc }], acc === null);
    }
    sug.querySelector('.n').onclick = function () { lsSet(DISMISS_KEY + opt.game, today()); sug.remove(); log(false); };
    sug.querySelector('.y').onclick = function () { lsSet(DISMISS_KEY + opt.game, today()); sug.remove(); log(true); opt.onStart(); };
    global.addEventListener('pagehide', function () { if (sug.isConnected) log(null); });
  }

  /* 게임별 문항 만들기에 쓰는 데이터 ─────────────────────────── */
  var DATA = {};

  /* 산성비 함정 단어 → 장부에 쓰는 공식 이름과 이유 (2026-09-23 초안, 성일님 검토 대상)
     지금까지 팝업은 "일상 용어예요"라고만 해서, 무엇으로 적어야 하는지 알려 주지 않았다. */
  var PROOF = '거래가 있었다는 걸 보여 주는 서류(증빙)예요. 장부에는 서류 이름이 아니라, 서류에 적힌 거래를 계정과목으로 적어요.';
  DATA.acidFake = {
    '월급':       { name: '급여', why: '직원에게 주는 월급은 장부에 \'급여\'(비용)로 적어요.' },
    '보너스':     { name: '상여금 (급여)', why: '직원 보너스는 \'상여금\' 또는 급여(비용)로 적어요.' },
    '식대':       { name: '복리후생비 / 기업업무추진비', why: '직원 식사는 복리후생비, 거래처 접대 식사는 기업업무추진비예요.' },
    '밥값':       { name: '복리후생비 / 기업업무추진비', why: '누구랑 먹었는지로 나눠요. 직원이면 복리후생비, 거래처면 기업업무추진비.' },
    '회식비':     { name: '복리후생비', why: '직원 회식은 복리후생비예요. 거래처와 먹었다면 기업업무추진비.' },
    '기름값':     { name: '차량유지비', why: '업무용 차에 넣은 주유비는 차량유지비예요.' },
    '차비':       { name: '여비교통비', why: '버스·택시·출장 교통비는 여비교통비예요.' },
    '교통비':     { name: '여비교통비', why: '공식 이름은 앞에 \'여비\'가 붙은 여비교통비예요.' },
    '월세':       { name: '임차료', why: '빌려 쓰고 내는 쪽은 임차료(비용), 빌려주고 받는 쪽은 임대료(수익)예요.' },
    '가불금':     { name: '단기대여금', why: '직원에게 미리 빌려준 돈은 나중에 돌려받을 돈이라 자산(단기대여금)이에요.' },
    '외상값':     { name: '외상매출금 / 외상매입금', why: '상품을 외상으로 팔고 받을 돈은 외상매출금(자산), 사고 갚을 돈은 외상매입금(부채)이에요.' },
    '카드대금':   { name: '미지급금 (상품이면 외상매입금)', why: '카드로 사고 나중에 갚을 돈이라 부채예요. 상품이 아닌 물건이면 미지급금, 상품을 샀으면 외상매입금.' },
    '통장잔액':   { name: '보통예금', why: '통장에 든 돈은 보통예금(자산)이에요. \'잔액\'은 금액일 뿐 계정 이름이 아니에요.' },
    '수리비':     { name: '수선비', why: '건물·기계를 고친 돈의 공식 이름은 수선비예요. (업무용 차 수리는 차량유지비)' },
    '축의금':     { name: '복리후생비 / 기업업무추진비', why: '직원 경조사비는 복리후생비, 거래처 경조사비는 기업업무추진비예요.' },
    '영수증':     { name: '증빙서류', why: PROOF },
    '청구서':     { name: '증빙서류', why: '돈을 달라고 보내는 서류예요. ' + PROOF },
    '견적서':     { name: '증빙서류', why: '가격을 미리 알려 주는 서류예요. 아직 거래가 아니라서 분개하지 않아요.' },
    '주문서':     { name: '증빙서류', why: '주문만으로는 회계상 거래가 아니라 분개하지 않아요. 상품을 주고받을 때 적어요.' },
    '계약서':     { name: '증빙서류', why: '계약만으로는 회계상 거래가 아니에요. 돈(계약금)이 오가면 그때 선급금·선수금 등으로 적어요.' },
    '세금계산서': { name: '증빙서류', why: '부가세가 붙은 거래의 증빙이에요. 그 안의 세금은 부가세예수금·부가세대급금으로 적어요.' },
    '거래명세서': { name: '증빙서류', why: '무엇을 얼마나 주고받았는지 적은 서류예요. ' + PROOF },
    '현금영수증': { name: '증빙서류', why: '현금으로 냈다는 증빙이에요. ' + PROOF },
    '부가가치세': { name: '부가세예수금 / 부가세대급금', why: '팔 때 받아 둔 부가세는 부가세예수금(부채), 살 때 낸 부가세는 부가세대급금(자산)이에요.' },
    '시산표':     { name: '장부(표) 이름', why: '계정 잔액이 맞는지 확인하려고 만드는 표예요. 계정과목이 아니에요.' },
    '재무상태표': { name: '재무제표 이름', why: '자산·부채·자본을 보여 주는 보고서예요. 그 안에 적힌 항목들이 계정과목이에요.' },
    '손익계산서': { name: '재무제표 이름', why: '수익·비용을 보여 주는 보고서예요. 그 안에 적힌 항목들이 계정과목이에요.' },
    '총계정원장': { name: '장부 이름', why: '계정과목별로 모아 적는 장부예요.' },
    '분개장':     { name: '장부 이름', why: '거래를 차변·대변으로 나눠 날짜 순서대로 적는 장부예요.' },
    '순이익':     { name: '계산 결과(이익)', why: '수익에서 비용을 빼서 나오는 결과예요. 따로 적는 계정과목이 아니에요.' },
    '매출총이익': { name: '계산 결과(이익)', why: '매출액 − 매출원가로 계산한 결과예요. 계정과목이 아니에요.' },
    '영업이익':   { name: '계산 결과(이익)', why: '매출총이익 − 판매비와관리비로 계산한 결과예요. 계정과목이 아니에요.' },
    '당기순이익': { name: '계산 결과(이익)', why: '이번 기간 수익 − 비용의 결과예요. 손익계산서 맨 아래 나오는 값이지 계정과목이 아니에요.' },
    '법인카드':   { name: '결제 수단', why: '카드는 돈을 내는 방법일 뿐이에요. 쓴 곳에 따라 비용 계정으로, 갚을 돈은 미지급금으로 적어요.' },
    '사장님':     { name: '사람 (계정 아님)', why: '사장이 회사 돈을 개인적으로 가져가면 그 돈을 인출금(자본)으로 적어요.' },
    '거래처':     { name: '상대방 (계정 아님)', why: '돈을 주고받는 상대 회사예요. 계정과목이 아니라 거래처원장에서 따로 관리해요.' },
    '약속어음':   { name: '받을어음 / 지급어음', why: '어음을 받으면 받을어음(자산), 내가 발행해 주면 지급어음(부채)이에요.' },
    '수표':       { name: '현금 / 당좌예금', why: '남이 발행한 수표를 받으면 현금이에요. 내가 수표를 발행하면 당좌예금이 줄어요.' },
    '마이너스통장': { name: '단기차입금 (당좌차월)', why: '은행에서 한도만큼 빌려 쓰는 것이라 부채예요. 결산 때 단기차입금으로 나타내요.' },
    '비상금':     { name: '현금', why: '회사가 가진 돈이면 그냥 현금이에요.' }
  };

  /* 조립공장 결산 유형 카드 */
  DATA.factoryTypes = {
    '선급비용':   { rule: '돈은 이미 냈는데, 그중 내년 몫이 남았다', how: '내년 몫을 자산(선급비용)으로 옮기고, 그만큼 올해 비용을 줄인다.', je: '(차) 선급비용 / (대) 보험료·임차료 등' },
    '선수수익':   { rule: '돈은 이미 받았는데, 그중 내년 몫이 섞였다', how: '내년 몫은 아직 번 게 아니라 부채(선수수익)로 옮기고, 그만큼 올해 수익을 줄인다.', je: '(차) 임대료·이자수익 등 / (대) 선수수익' },
    '미수수익':   { rule: '올해 벌었는데, 돈은 아직 못 받았다', how: '받을 권리를 자산(미수수익)으로 적고 올해 수익을 올린다.', je: '(차) 미수수익 / (대) 이자수익·임대료 등' },
    '미지급비용': { rule: '올해 썼는데, 돈은 아직 안 냈다', how: '갚을 의무를 부채(미지급비용)로 적고 올해 비용을 올린다.', je: '(차) 이자비용·급여·임차료 등 / (대) 미지급비용' },
    '감가상각':   { rule: '건물·차량·비품의 가치가 한 해 동안 줄었다', how: '줄어든 만큼 비용(감가상각비)으로 올리고, 자산을 직접 깎지 않고 감가상각누계액에 모은다.', je: '(차) 감가상각비 / (대) 감가상각누계액' },
    '대손충당금': { rule: '외상값·대여금 중 못 받을 것 같은 돈을 미리 준비한다', how: '매출채권(외상매출금·받을어음)이면 대손상각비, 그 밖의 채권(대여금·미수금)이면 기타의대손상각비. 이미 충분히 쌓여 있으면 남는 만큼 대손충당금환입.', je: '(차) 대손상각비 / (대) 대손충당금' },
    '소모품':     { rule: '사 둔 소모품 중 쓴 것과 남은 것을 나눈다', how: '살 때 자산(소모품)으로 적었으면 쓴 만큼 소모품비로, 비용(소모품비)으로 적었으면 남은 만큼 소모품으로 옮긴다.', je: '(차) 소모품비 / (대) 소모품  또는 반대' },
    '유가증권평가': { rule: '갖고 있는 단기매매증권의 시가가 바뀌었다', how: '오르면 단기매매증권을 늘리고 평가이익, 내리면 평가손실을 적고 단기매매증권을 줄인다.', je: '(차) 단기매매증권 / (대) 단기매매증권평가이익' },
    '현금과부족': { rule: '현금이 장부와 안 맞는데 끝까지 이유를 모른다', how: '모자라면 잡손실, 남으면 잡이익으로 정리한다.', je: '(차) 잡손실 / (대) 현금과부족' },
    '가계정정리': { rule: '임시로 적어 둔 가지급금·가수금의 정체가 밝혀졌다', how: '임시 계정을 없애고 원래 계정(여비교통비·외상매출금 등)으로 바꿔 적는다.', je: '(차) 여비교통비 / (대) 가지급금' },
    '유동성대체': { rule: '장기차입금의 만기가 1년 안으로 다가왔다', how: '장기부채를 줄이고 유동부채(유동성장기부채)로 옮긴다.', je: '(차) 장기차입금 / (대) 유동성장기부채' }
  };
  DATA.factoryTypeOf = function (L, R) {
    var s = L + '|' + R;
    if (/선급비용/.test(s)) return '선급비용';
    if (/선수수익/.test(s)) return '선수수익';
    if (/미수수익/.test(s)) return '미수수익';
    if (/미지급비용/.test(s)) return '미지급비용';
    if (/감가상각/.test(s)) return '감가상각';
    if (/대손/.test(s)) return '대손충당금';
    if (/소모품/.test(s)) return '소모품';
    if (/단기매매증권/.test(s)) return '유가증권평가';
    if (/현금과부족|잡손실|잡이익/.test(s)) return '현금과부족';
    if (/가지급금|가수금/.test(s)) return '가계정정리';
    if (/유동성/.test(s)) return '유동성대체';
    return null;
  };
  DATA.factoryTypeLabel = {
    '선급비용': '선급비용 (미리 낸 비용)', '선수수익': '선수수익 (미리 받은 수익)', '미수수익': '미수수익 (못 받은 수익)',
    '미지급비용': '미지급비용 (안 낸 비용)', '감가상각': '감가상각', '대손충당금': '대손충당금 설정·환입', '소모품': '소모품 정리',
    '유가증권평가': '단기매매증권 평가', '현금과부족': '현금과부족 정리', '가계정정리': '가지급금·가수금 정리', '유동성대체': '유동성 대체'
  };

  global.StepMode = {
    start: start, mount: mount, DATA: DATA, esc: esc, shuffle: shuffle,
    isActive: function () { return active; },
    suggestReason: suggestReason, noteRound: noteRound, noteWrong: noteWrong,
    _hook: hook,
    _answer: function () { var it = R && R.list[R.i]; return it && it.q.steps[it.si || 0] ? it.q.steps[it.si || 0].answer : null; },   // 테스트용
    _len: function () { return R ? R.list.length : 0; }
  };
  hook();
})(window);
