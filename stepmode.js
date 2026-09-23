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
    var b = jGet('hub_wrongnotes', {})[user() || '게스트'] || {};
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
      '.am-step-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:44px;margin-top:10px;background:rgba(80,200,140,.1);border:1.5px solid rgba(80,200,140,.45);color:#9fe3c0;border-radius:12px;font-size:.9rem;font-weight:700;font-family:inherit}',
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
          round_key: this.key, user_name: user() || '게스트', group_id: groupId(), game_id: game,
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
            round_key: this.key, user_name: user() || '게스트', group_id: groupId(), game_id: game,
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
    sug.innerHTML = '요즘 이 게임이 좀 헷갈리죠?<br>차근차근 모드로 천천히 연습해 볼까요?' +
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
     지금까지 팝업은 "일상 용어예요"라고만 해서, 무엇으로 적어야 하는지 알려 주지 않았다.
     문구 규칙(대사_작법.md): 한 줄 30자 안쪽, 줄은 \n 으로 나눈다, 상황 → 이름 순서. */
  DATA.acidFake = {
    '월급':       { name: '급여', why: '직원에게 주는 월급.\n장부에는 \'급여\'라고 적어요.' },
    '보너스':     { name: '상여금', why: '명절·성과 보너스는\n\'상여금\'(급여의 한 종류)이에요.' },
    '식대':       { name: '복리후생비 / 기업업무추진비', why: '누구랑 먹었나가 갈라요.\n직원끼리면 복리후생비,\n거래처 접대면 기업업무추진비.' },
    '밥값':       { name: '복리후생비 / 기업업무추진비', why: '누구랑 먹었나가 갈라요.\n직원끼리면 복리후생비,\n거래처 접대면 기업업무추진비.' },
    '회식비':     { name: '복리후생비', why: '직원 회식은 복리후생비.\n거래처와 먹었다면 기업업무추진비.' },
    '기름값':     { name: '차량유지비', why: '업무용 차에 넣은 기름.\n차를 굴리는 돈이라 차량유지비예요.' },
    '차비':       { name: '여비교통비', why: '버스·택시비는\n여비교통비로 적어요.' },
    '교통비':     { name: '여비교통비', why: '앞에 \'여비\'가 붙어요.\n공식 이름은 여비교통비!' },
    '월세':       { name: '임차료', why: '빌려 쓰고 내는 돈 → 임차료(비용).\n빌려주고 받는 돈 → 임대료(수익).' },
    '가불금':     { name: '단기대여금', why: '직원에게 미리 빌려준 돈.\n돌려받을 돈이라 자산이에요.' },
    '외상값':     { name: '외상매출금 / 외상매입금', why: '팔고 받을 외상 → 외상매출금(자산).\n사고 갚을 외상 → 외상매입금(부채).' },
    '카드대금':   { name: '미지급금', why: '카드로 사고 나중에 갚을 돈. 부채예요.\n상품을 샀다면 외상매입금!' },
    '통장잔액':   { name: '보통예금', why: '통장에 든 돈은 보통예금.\n\'잔액\'은 금액일 뿐 이름이 아니에요.' },
    '수리비':     { name: '수선비', why: '건물·기계를 고친 돈은 수선비.\n차 수리는 차량유지비예요.' },
    '축의금':     { name: '복리후생비 / 기업업무추진비', why: '직원 축의금 → 복리후생비.\n거래처 축의금 → 기업업무추진비.' },
    '영수증':     { name: '증빙서류', why: '돈을 냈다는 종이(증빙)예요.\n장부엔 종이에 적힌 거래를 적어요.' },
    '청구서':     { name: '증빙서류', why: '돈을 달라고 보내는 종이예요.\n장부엔 그 거래를 적어요.' },
    '견적서':     { name: '증빙서류', why: '가격을 미리 알려 주는 종이.\n아직 거래가 아니라 분개도 안 해요.' },
    '주문서':     { name: '증빙서류', why: '주문만으론 거래가 아니에요.\n물건이 오갈 때 적어요.' },
    '계약서':     { name: '증빙서류', why: '계약만으론 거래가 아니에요.\n계약금이 오가면 선급금·선수금!' },
    '세금계산서': { name: '증빙서류', why: '부가세 붙은 거래의 증빙이에요.\n세금은 부가세예수금·대급금으로.' },
    '거래명세서': { name: '증빙서류', why: '무엇을 얼마나 주고받았나 적은 종이.\n장부엔 그 거래를 적어요.' },
    '현금영수증': { name: '증빙서류', why: '현금으로 냈다는 증빙이에요.\n장부엔 쓴 곳을 계정으로 적어요.' },
    '부가가치세': { name: '부가세예수금 / 부가세대급금', why: '팔 때 받아 둔 부가세 → 부가세예수금.\n살 때 낸 부가세 → 부가세대급금.' },
    '시산표':     { name: '장부(표) 이름', why: '잔액이 맞는지 맞춰 보는 표예요.\n계정과목은 그 표 안에 있어요.' },
    '재무상태표': { name: '재무제표 이름', why: '자산·부채·자본을 보여 주는 보고서.\n그 안의 항목이 계정과목이에요.' },
    '손익계산서': { name: '재무제표 이름', why: '수익·비용을 보여 주는 보고서.\n그 안의 항목이 계정과목이에요.' },
    '총계정원장': { name: '장부 이름', why: '계정과목별로 모아 적는\n장부예요.' },
    '분개장':     { name: '장부 이름', why: '거래를 차변·대변으로 나눠\n날짜 순으로 적는 장부예요.' },
    '순이익':     { name: '계산 결과', why: '수익 − 비용으로 나오는 값.\n따로 적는 계정이 아니에요.' },
    '매출총이익': { name: '계산 결과', why: '매출액 − 매출원가.\n계산해서 나오는 값이에요.' },
    '영업이익':   { name: '계산 결과', why: '매출총이익 − 판매비와관리비.\n계산해서 나오는 값이에요.' },
    '당기순이익': { name: '계산 결과', why: '이번 기간의 수익 − 비용.\n손익계산서 맨 아래 값이에요.' },
    '법인카드':   { name: '결제 수단', why: '돈을 내는 방법일 뿐이에요.\n쓴 곳은 비용, 갚을 돈은 미지급금.' },
    '사장님':     { name: '사람 (계정 아님)', why: '사람은 계정이 아니에요.\n사장이 가져간 돈은 인출금!' },
    '거래처':     { name: '상대방 (계정 아님)', why: '돈을 주고받는 상대 회사예요.\n거래처원장에서 따로 관리해요.' },
    '약속어음':   { name: '받을어음 / 지급어음', why: '어음을 받으면 → 받을어음(자산).\n내가 써 주면 → 지급어음(부채).' },
    '수표':       { name: '현금 / 당좌예금', why: '남이 쓴 수표를 받으면 현금.\n내가 쓰면 당좌예금이 줄어요.' },
    '마이너스통장': { name: '단기차입금', why: '은행에서 빌려 쓰는 돈이라 부채.\n결산 땐 단기차입금으로 적어요.' },
    '비상금':     { name: '현금', why: '회사가 가진 돈이면\n그냥 현금이에요.' }
  };

  /* 조립공장 결산 유형 카드 */
  DATA.factoryTypes = {
    '선급비용':   { rule: '돈은 냈는데, 내년 몫이 남았다', how: '내년 몫 → 자산(선급비용)으로.\n그만큼 올해 비용은 줄여요.', je: '(차) 선급비용 / (대) 보험료 등' },
    '선수수익':   { rule: '돈은 받았는데, 내년 몫이 섞였다', how: '내년 몫은 아직 번 게 아니에요.\n부채(선수수익)로 옮기고 수익을 줄여요.', je: '(차) 임대료 등 / (대) 선수수익' },
    '미수수익':   { rule: '올해 벌었는데, 돈은 아직 못 받았다', how: '받을 권리 → 자산(미수수익).\n올해 수익도 올려요.', je: '(차) 미수수익 / (대) 이자수익 등' },
    '미지급비용': { rule: '올해 썼는데, 돈은 아직 안 냈다', how: '갚을 의무 → 부채(미지급비용).\n올해 비용도 올려요.', je: '(차) 이자비용 등 / (대) 미지급비용' },
    '감가상각':   { rule: '건물·차·비품이 한 해 동안 낡았다', how: '줄어든 가치 → 감가상각비(비용).\n자산은 누계액에 모아서 깎아요.', je: '(차) 감가상각비 / (대) 감가상각누계액' },
    '대손충당금': { rule: '외상값 중 못 받을 돈을 미리 대비', how: '외상매출금·받을어음 → 대손상각비.\n대여금·미수금 → 기타의대손상각비.\n이미 넉넉하면 → 대손충당금환입.', je: '(차) 대손상각비 / (대) 대손충당금' },
    '소모품':     { rule: '사 둔 소모품, 쓴 것과 남은 것', how: '자산으로 샀으면 → 쓴 만큼 소모품비로.\n비용으로 샀으면 → 남은 만큼 소모품으로.', je: '(차) 소모품비 / (대) 소모품 (또는 반대)' },
    '유가증권평가': { rule: '단기매매증권 시가가 바뀌었다', how: '오르면 → 평가이익.\n내리면 → 평가손실.', je: '(차) 단기매매증권 / (대) 평가이익' },
    '현금과부족': { rule: '현금이 안 맞는데, 끝내 이유를 모른다', how: '모자라면 → 잡손실.\n남으면 → 잡이익.', je: '(차) 잡손실 / (대) 현금과부족' },
    '가계정정리': { rule: '임시로 적어 둔 돈의 정체가 밝혀졌다', how: '가지급금·가수금은 지우고\n진짜 계정으로 바꿔 적어요.', je: '(차) 여비교통비 / (대) 가지급금' },
    '유동성대체': { rule: '장기차입금 만기가 1년 안으로 왔다', how: '장기부채를 줄이고\n유동성장기부채로 옮겨요.', je: '(차) 장기차입금 / (대) 유동성장기부채' }
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

  /* 플라이트 장부 7종 — 무엇을 볼 때 쓰는 장부인가(2026-09-24 초안, 성일님 검토 대상) */
  DATA.flightLedgers = {
    '거래처원장': { use: '특정 거래처의 잔액', why: '거래처별로 외상·어음·선수금 잔액을\n따로 모아 둔 장부예요.' },
    '총계정원장': { use: '한 계정의 월별 금액 비교', why: '계정과목마다 월별 합계와 잔액을 보여 줘요.\n"가장 많은 월"은 여기서!' },
    '월계표':     { use: '기간 동안의 계정별 합계', why: '정한 기간(몇 월~몇 월)의 계정별 합계를\n현금·대체로 나눠 보여 줘요.' },
    '일계표':     { use: '며칠 동안의 계정별 합계', why: '정한 날짜 동안의 계정별 합계를 보여 줘요.' },
    '재무상태표': { use: '○월 말 현재 자산·부채·자본', why: '정한 날짜 현재의 잔액을 보여 주는 표예요.\n"~월 말 현재"는 여기서!' },
    '손익계산서': { use: '기간 동안의 수익·비용', why: '정한 기간에 번 돈(수익)과\n쓴 돈(비용)을 보여 줘요.' },
    '현금출납장': { use: '현금이 들어오고 나간 내역', why: '현금 입금·출금을 날짜순으로 적은 장부예요.' }
  };

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
