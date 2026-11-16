/* ============================================================
 *  stepmode.js — 차근차근 모드 공통 엔진 (2026-09-23)
 *  기획: docs/차근차근모드_기획.md
 *
 *  ⚠ 2026-09-24 개편: 따로 뜨는 카드 창을 없앴다. 각 게임이 **자기 화면 그대로** 속도를 늦추고
 *  말풍선으로 한 단계씩 짚어 준다(성일님: "아예 다른 창이 나오면 어떻게 해").
 *  이 파일은 시작 화면 버튼·본인에게만 보이는 권유·문제 고르기·전용 테이블 기록·게임별 해설 데이터만 맡는다.
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
 *    StepMode.mount({ game:'acid', host: 요소, onStart })   // 시작 화면에 버튼+권유
 *    var S = StepMode.session('acid')                      // 한 판 기록(아래 session() 설명)
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
    var b = jGet('hub_wrongnotes', {})[user() || '訪客'] || {};
    return Object.keys(b).map(function (k) { return b[k]; })
      .filter(function (r) { return r.game === g; })
      .sort(function (a, c) { return (c.count || 1) - (a.count || 1); })
      .map(function (r) { return String(r.key).replace(/_cat$/, ''); });   // 산성비 분류오답('_cat')은 같은 단어로
  }

  /* ── 버튼·권유 말풍선 모양(시작 화면에만 쓴다) ───────────────── */
  function css() {
    if (document.getElementById('am-step-css')) return;
    var s = document.createElement('style');
    s.id = 'am-step-css';
    s.textContent = [
      /* 2026-09-27 성일님 "차근차근 버튼이 못생겼네" → 조종모 쓴 거북이 + 나사 박힌 패널(시안 C 차용, docs/디자인시안_2026-09-27_산성비) */
      '.am-step-btn{position:relative;display:flex;align-items:center;width:100%;min-height:66px;margin-top:10px;padding:0 18px 0 86px;overflow:hidden;background:linear-gradient(180deg,#1a2420 0%,#131a18 100%);border:1.5px solid rgba(80,200,140,.5);border-radius:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 2px 0 rgba(0,0,0,.35);color:#9fe3c0;font-family:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.am-step-btn:active{transform:translateY(1px)}',
      '.am-step-btn .sb-mascot{position:absolute;left:4px;bottom:-9px;width:80px;height:68px;pointer-events:none;z-index:2}',
      '.am-step-btn .sb-txt{position:relative;z-index:2;display:flex;flex-direction:column;gap:3px;flex:1;align-items:center}',
      ".am-step-btn .sb-t{font-family:'Noto Sans TC', 'Black Han Sans',sans-serif;font-size:1.12rem;letter-spacing:.02em;color:#a8f0cb}",
      '.am-step-btn .sb-s{font-size:.78rem;font-weight:500;color:rgba(168,240,203,.62)}',
      '.am-step-btn .sb-go{position:relative;z-index:2;font-size:1.1rem;color:rgba(168,240,203,.55);margin-left:6px}',
      '.am-step-btn i.sc{position:absolute;z-index:1;width:5px;height:5px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#6f8c80,#2c3a35);box-shadow:0 0 0 1px rgba(0,0,0,.4)}',
      '.am-step-btn i.sc:nth-of-type(1){top:6px;left:6px}.am-step-btn i.sc:nth-of-type(2){top:6px;right:6px}.am-step-btn i.sc:nth-of-type(3){bottom:6px;left:6px}.am-step-btn i.sc:nth-of-type(4){bottom:6px;right:6px}',
      '.am-step-sug{margin-top:8px;background:rgba(255,209,102,.08);border:1px solid rgba(255,209,102,.35);border-radius:12px;padding:12px 14px;font-size:.86rem;line-height:1.75;color:#ffe6a6;text-align:left}',
      '.am-step-sug .row{display:flex;gap:8px;margin-top:8px}',
      '.am-step-sug button{flex:1;min-height:38px;border-radius:10px;font-size:.84rem;font-family:inherit;border:1px solid rgba(255,255,255,.2);background:none;color:#eaf2ff}',
      '.am-step-sug button.y{background:#3ddc97;color:#062016;border:none;font-weight:700}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ── 한 판 기록(세션) ─────────────────────────────────────────
     2026-09-24 성일님: "아예 다른 창이 나오면 어떻게 해. 기존 게임에서 한 단계씩 알려줘야지."
     → 화면은 **각 게임이 자기 화면 그대로** 그린다(속도를 늦추고 말풍선으로 짚어 줌).
       여기서는 문제 고르기 · 판 기록(전용 테이블) · 이 기기 오답노트만 맡는다.

     var S = StepMode.session('acid');
     S.pick(문항배열, 10, q => q.key)          // 이 기기 오답노트에서 자주 틀린 것 절반 먼저
     S.begin(key) … S.hint(n) … S.wrong() … S.done(key, {q, correct, type})   // 한 문항
     S.finish(끝까지 했는가)                    // 판 끝 — 서버 전송 */
  var cur = null;
  function session(game) {
    active = true;
    var S = {
      game: game,
      key: game + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      startedAt: new Date().toISOString(),
      answers: [], res: {}, wrongs: [], hints: 0, cards: 0, sent: false,
      _it: null,
      pick: function (pool, n, keyOf) {
        keyOf = keyOf || function (q) { return q.key; };
        var wk = localWrongKeys(game), byKey = {}, out = [], used = {};
        pool.forEach(function (q) { byKey[keyOf(q)] = q; });
        for (var i = 0; i < wk.length && out.length < Math.ceil(n / 2); i++) {
          var q = byKey[wk[i]];
          if (q && !used[wk[i]]) { out.push(q); used[wk[i]] = 1; }
        }
        shuffle(pool.slice()).forEach(function (q) { var k = keyOf(q); if (out.length < n && !used[k]) { out.push(q); used[k] = 1; } });
        return shuffle(out);
      },
      begin: function (key) { this._it = { key: String(key), t0: Date.now(), hint: 0, wrong: 0 }; },
      hint: function (level) { if (!this._it) return; this.hints++; this._it.hint = Math.max(this._it.hint, level); },
      wrong: function () { if (!this._it) return; this._it.wrong++; this.cards++; },
      /* 한 문항 끝. 반환값: 힌트 없이 처음에 맞혔는가 */
      done: function (key, note) {
        var it = this._it || { key: String(key), t0: Date.now(), hint: 0, wrong: 0 };
        this._it = null;
        var clean = it.hint === 0 && it.wrong === 0;
        this.answers.push({
          round_key: this.key, user_name: user() || '訪客', group_id: groupId(), game_id: game,
          q_key: String(key).slice(0, 200), first_try_correct: clean,
          hint_level: Math.min(3, it.hint), wrong_tries: Math.min(50, it.wrong),
          ms: Math.min(3600000, Date.now() - it.t0)
        });
        var r = this.res[key] || (this.res[key] = { clean: false, first: false, tries: 0, label: (note && note.label) || String(key) });
        r.tries++;
        if (clean) r.clean = true;
        if (clean && r.tries === 1) r.first = true;
        if (!clean && (it.wrong > 0 || it.hint >= 3) && note) this.wrongs.push({ key: String(key), note: note });
        return clean;
      },
      learned: function () { var R = this.res; return Object.keys(R).filter(function (k) { return R[k].clean; }).map(function (k) { return R[k].label; }); },
      again: function () { var R = this.res; return Object.keys(R).filter(function (k) { return !R[k].clean; }).map(function (k) { return R[k].label; }); },
      finish: function (finished, keepalive) {
        if (this.sent) return;
        this.sent = true;
        if (cur === this) cur = null;
        active = false;
        var R = this.res, seen = Object.keys(R);
        if (this.answers.length) {
          post('step_rounds', [{
            round_key: this.key, user_name: user() || '訪客', group_id: groupId(), game_id: game,
            started_at: this.startedAt, questions: Math.min(500, seen.length),
            correct_nohint: Math.min(500, seen.filter(function (k) { return R[k].first; }).length),
            hints_used: Math.min(2000, this.hints), cards_seen: Math.min(2000, this.cards),
            finished: !!finished, source: platform()
          }], keepalive);
          post('step_answers', this.answers, keepalive);
        }
        // 틀린 문제는 이 기기 오답노트에만(서버 wrong_answers 에는 안 감)
        var W = global.WrongNote;
        if (W && this.wrongs.length) {
          try {
            var seenW = {};
            W.reset();
            this.wrongs.forEach(function (w) {
              if (seenW[w.key]) return; seenW[w.key] = 1;
              W.add({ game: game, key: w.key, q: w.note.q || '', correct: w.note.correct || '', wrong: null, type: w.note.type || '' });
            });
            W.flush(game, { localOnly: true });
          } catch (e) {}
        }
      }
    };
    cur = S;
    return S;
  }
  // 판 도중에 앱을 닫거나 다른 화면으로 가도 푼 만큼은 남긴다
  global.addEventListener('pagehide', function () { if (cur && !cur.sent && cur.answers.length) cur.finish(false, true); });

  /* ── 시작 화면 버튼 + 본인에게만 보이는 권유 ────────────────── */
  // 조종모·고글 쓴 거북이(그림 파일 없이 SVG — 화면 배율과 상관없이 선명)
  var TURTLE = '<svg class="sb-mascot" viewBox="0 0 84 72" aria-hidden="true"> <ellipse cx="28" cy="58" rx="27" ry="19" fill="#2f7a4a" stroke="#18402a" stroke-width="2"/> <path d="M6 56 Q28 26 52 56 Z" fill="#46a066" opacity=".9"/> <path d="M18 50 l6-6 h8 l6 6 l-6 6 h-8 z" fill="#5fbf7e" stroke="#2a6b40" stroke-width="1.4"/> <path d="M4 58 Q28 66 53 58" fill="none" stroke="#d8c48a" stroke-width="3" stroke-linecap="round"/> <ellipse cx="49" cy="66" rx="8" ry="5" fill="#8fd49a" stroke="#2d6b3f" stroke-width="1.6"/> <path d="M46 52 Q50 44 56 42" stroke="#2d6b3f" stroke-width="12" stroke-linecap="round" fill="none"/> <path d="M46 52 Q50 44 56 42" stroke="#8fd49a" stroke-width="9" stroke-linecap="round" fill="none"/> <circle cx="59" cy="33" r="17" fill="#8fd49a" stroke="#2d6b3f" stroke-width="2"/> <path d="M41.5 33 Q42 14 59 13 Q76 14 76.5 33 Q70 25 59 25 Q48 25 41.5 33 Z" fill="#8a5a32" stroke="#4a2e16" stroke-width="1.8" stroke-linejoin="round"/> <path d="M42 31 q-2 8 2 12 q4 -1 4 -8" fill="#8a5a32" stroke="#4a2e16" stroke-width="1.6" stroke-linejoin="round"/> <path d="M76 31 q2 8 -2 12 q-4 -1 -4 -8" fill="#8a5a32" stroke="#4a2e16" stroke-width="1.6" stroke-linejoin="round"/> <path d="M47 17 Q59 12 71 17" fill="none" stroke="#b07a48" stroke-width="1.2" opacity=".8"/> <rect x="44" y="18.5" width="30" height="4" rx="2" fill="#3a2716"/> <circle cx="52" cy="20" r="6" fill="#d9ad5c" stroke="#5a3d12" stroke-width="1.6"/> <circle cx="66" cy="20" r="6" fill="#d9ad5c" stroke="#5a3d12" stroke-width="1.6"/> <circle cx="52" cy="20" r="4" fill="#7fd6ff"/><circle cx="66" cy="20" r="4" fill="#7fd6ff"/> <path d="M50 18.3 l2.2 -1.2" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/> <path d="M64 18.3 l2.2 -1.2" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/> <ellipse cx="53" cy="34" rx="2.6" ry="3.2" fill="#10261a"/><ellipse cx="65" cy="34" rx="2.6" ry="3.2" fill="#10261a"/> <circle cx="53.9" cy="32.8" r="1" fill="#fff"/><circle cx="65.9" cy="32.8" r="1" fill="#fff"/> <ellipse cx="48.5" cy="39.5" rx="3" ry="1.8" fill="#ff9fb0" opacity=".7"/><ellipse cx="69.5" cy="39.5" rx="3" ry="1.8" fill="#ff9fb0" opacity=".7"/> <path d="M56 40 Q59 43 62 40" fill="none" stroke="#10261a" stroke-width="1.6" stroke-linecap="round"/> </svg>';
  function mount(opt) {
    hook();
    retryPending();
    css();
    var host = opt.host;
    if (!host || host.querySelector('.am-step-btn')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'am-step-btn';
    b.setAttribute('aria-label', '慢慢學模式' + (opt.sub ? ', ' + opt.sub : ''));
    b.innerHTML = TURTLE + '<i class="sc"></i><i class="sc"></i><i class="sc"></i><i class="sc"></i>' +
      '<span class="sb-txt"><span class="sb-t">慢慢學模式</span><span class="sb-s">' + esc(opt.sub || '一步一步慢慢練習') + '</span></span><span class="sb-go" aria-hidden="true">›</span>';
    b.onclick = function () { opt.onStart(); };
    host.appendChild(b);

    var reason = suggestReason(opt.game);
    if (!reason || lsGet(DISMISS_KEY + opt.game) === today()) return;
    var sug = document.createElement('div');
    sug.className = 'am-step-sug';
    sug.innerHTML = '最近這個遊戲有點難嗎？<br>要不要用慢慢學模式，一步一步練習？' +
      '<div class="row"><button type="button" class="n">先不用</button><button type="button" class="y">試試看</button></div>';
    host.appendChild(sug);
    var logged = false;
    function log(acc) {
      if (logged) return; logged = true;
      post('step_prompts', [{ user_name: user() || '訪客', group_id: groupId(), game_id: opt.game, reason: reason, accepted: acc }], acc === null);
    }
    sug.querySelector('.n').onclick = function () { lsSet(DISMISS_KEY + opt.game, today()); sug.remove(); log(false); };
    sug.querySelector('.y').onclick = function () { lsSet(DISMISS_KEY + opt.game, today()); sug.remove(); log(true); opt.onStart(); };
    global.addEventListener('pagehide', function () { if (sug.isConnected) log(null); });
  }

  /* 게임별 문항 만들기에 쓰는 데이터 ─────────────────────────── */
  var DATA = {};

  /* 산성비 함정 단어 → 장부에 쓰는 공식 이름과 이유 (2026-09-23 초안, 성일님 검토 대상)
     지금까지 팝업은 "일상 용어예요"라고만 해서, 무엇으로 적어야 하는지 알려 주지 않았다.
     문구 규칙(대사_작법.md): 한 줄 30자 안쪽, 줄은 \n 으로 나눈다, 상황 → 이름 순서. */
  /* 台灣版：各遊戲的說明資料從 tw/tw_data.js(原為 tw/step_tw.json)讀取 */
  var JS = (global.JA && global.JA.step) || {};
  DATA.acidFake = JS.acidFake || {};
  DATA.factoryTypes = JS.factoryTypes || {};
  DATA.factoryTypeLabel = JS.factoryTypeLabel || {};
  DATA.factoryTypeOf = function (L, R) {
    var s = L + '|' + R, rules = JS.factoryRules || [];
    for (var i = 0; i < rules.length; i++) if (new RegExp(rules[i][0]).test(s)) return rules[i][1];
    return null;
  };
  DATA.flightLedgers = JS.flightLedgers || {};

  /* 해설을 줄 단위 HTML 로(글은 이스케이프, \n 은 줄바꿈) — readable.js 가 있으면 문단·"더 보기"로 */
  function lines(arr, keep) {
    if (global.Readable) return Readable.lines(arr, { keep: keep == null ? 0 : keep });
    return arr.filter(Boolean).join('<br>');
  }
  function txt(s) { return esc(s).replace(/\n/g, '<br>'); }

  global.StepMode = {
    lines: lines, txt: txt,
    session: session, mount: mount, DATA: DATA, esc: esc, shuffle: shuffle,
    isActive: function () { return active; },
    current: function () { return cur; },
    suggestReason: suggestReason, noteRound: noteRound, noteWrong: noteWrong,
    _hook: hook
  };
  hook();
})(window);
