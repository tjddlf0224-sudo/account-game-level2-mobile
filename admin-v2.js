/* ============================================================
 *  admin-v2.js — 교수자 대시보드 새 화면(탭·요약·챙겨 볼 학생·게임별 현황·폰 카드·수업 자료) · 2026-10-13
 *
 *  왜. 예전 대시보드는 어두운 네온 화면에 회색 작은 글씨·장식 숫자 글꼴·영어 라벨(STUDENTS, AVG SCORE 195%)이라
 *  읽기 어려웠다(성일님 "대시보드도 가독성 좋게"). 시안(docs/대시보드_시안_2026-10-13.png)을 승인받아 이렇게 바꾼다.
 *   · PC: 탭(반 현황 / 학생별 / 팀전 / 수업 자료 / 설정)
 *   · 폰(앱): 같은 탭을 화면 아래 막대로, 학생별은 넓은 표 대신 카드(성일님 "스마트폰용 앱용 대시보드도 따로")
 *
 *  admin.html 의 전역(db·currentGid·GAMES·canon·theoryScoreByStudent·lvEff·openModal·escHTML …)을 **이름으로** 읽는다.
 *  (let/const 전역은 window 속성이 아니다 — teambattle.js 머리 주석 참고)
 *  데이터는 읽기만 한다. 새로 읽는 것: score_history·level_rounds 의 최근 60일(언제 했는지·판별 정답률).
 * ============================================================ */
(function (global) {
  'use strict';
  var DAY = 86400000;
  var A = { rows: [], lv: [], at: 0 };          // 최근 활동(score_history), 최근 판(level_rounds)
  var TAB_KEY = 'admin_tab';
  var WS = { acid: 1, memory: 2, debit: 3, factory: 4, flight: 5, theory: 6 };
  var WS_NAME = { 1: '① 계정과목 분류', 2: '② 계정과목의 뜻', 3: '③ 거래의 8요소와 분개', 4: '④ 결산정리분개', 5: '⑤ 장부조회', 6: '⑥ 이론 객관식' };

  function h(s) { return typeof escHTML === 'function' ? escHTML(s) : String(s == null ? '' : s); }
  function ha(s) { return typeof escAttr === 'function' ? escAttr(s) : h(s); }
  function cn(n) { return typeof canon === 'function' ? canon(n) : n; }
  function games() { return typeof GAMES !== 'undefined' ? GAMES : []; }
  function theoryId() { return typeof THEORY_GAME_ID !== 'undefined' ? THEORY_GAME_ID : 'theory'; }
  function pct(c, t) { return t ? Math.round(c / t * 100) : null; }
  function ago(ts) {
    if (!ts) return null;
    var d = Math.floor((Date.now() - ts) / DAY);
    return d <= 0 ? '오늘' : d === 1 ? '어제' : d + '일 전';
  }
  function tone(p) { return p == null ? 'none' : p >= 70 ? 'good' : p >= 55 ? 'warn' : 'bad'; }

  /* ── 읽기 ───────────────────────────────────────────── */
  async function pageAll(build) {
    var out = [];
    for (var from = 0; ; from += 1000) {
      var r = await build().order('id', { ascending: true }).range(from, from + 999);
      if (r.error) return out;
      out.push.apply(out, r.data || []);
      if (!r.data || r.data.length < 1000) return out;
    }
  }
  async function loadActivity(gid) {
    A = { rows: [], lv: [], at: Date.now() };
    if (typeof db === 'undefined' || !gid) return;
    var since = new Date(Date.now() - 60 * DAY).toISOString();
    try {
      var res = await Promise.all([
        pageAll(function () { return db.from('score_history').select('id,user_name,game_id,played_at,correct,total').eq('group_id', gid).gte('played_at', since); }),
        pageAll(function () { return db.from('level_rounds').select('id,user_name,game_id,correct,total,played_at').eq('group_id', gid).gte('played_at', since); })
      ]);
      A.rows = res[0]; A.lv = res[1];
    } catch (e) { /* 오프라인 — 새 칸만 비어 보인다 */ }
  }

  /* ── 계산 ───────────────────────────────────────────── */
  function baseId(g) { return String(g || '').replace(/_d2$/, ''); }
  function lastSeenMap() {
    var m = {};
    A.rows.concat(A.lv).forEach(function (r) {
      var n = cn(r.user_name), t = Date.parse(r.played_at);
      if (!isNaN(t) && (!m[n] || t > m[n])) m[n] = t;
    });
    return m;
  }
  // 학생·게임별 정답률 (from~to 일 전) — 기억의 전당은 누적 스냅샷이라 정답률로 못 쓴다(SESSION_LOG 데이터 함정 ②)
  function accBy(fromDays, toDays) {
    var lo = Date.now() - fromDays * DAY, hi = Date.now() - (toDays || 0) * DAY, m = {};
    function add(n, g, c, t, ts) {
      if (!t || ts < lo || ts > hi || g === 'memory') return;
      var s = m[n] || (m[n] = {}), x = s[g] || (s[g] = { c: 0, t: 0 });
      x.c += c || 0; x.t += t;
    }
    A.lv.forEach(function (r) { add(cn(r.user_name), baseId(r.game_id), r.correct, r.total, Date.parse(r.played_at)); });
    // level_rounds 가 없는 게임(이론·1급 등)은 끝까지 한 판(score_history)의 정답 수로
    A.rows.forEach(function (r) {
      var g = baseId(r.game_id);
      if (r.total && !A.lv.some(function (x) { return baseId(x.game_id) === g; })) add(cn(r.user_name), g, r.correct, r.total, Date.parse(r.played_at));
    });
    return m;
  }
  function classAcc(m, g) {
    var c = 0, t = 0;
    Object.keys(m).forEach(function (n) { var x = m[n][g]; if (x) { c += x.c; t += x.t; } });
    return t >= 20 ? { p: pct(c, t), t: t } : null;
  }

  function recommend(name, scores, acc30) {
    var st = scores[name] || {}, any = Object.keys(st).length || (theoryScoreByStudent && theoryScoreByStudent[name]);
    if (!any) return 1;
    var a = acc30[name] || {}, worst = null;
    Object.keys(a).forEach(function (g) {
      if (!WS[g] || a[g].t < 10) return;
      var p = pct(a[g].c, a[g].t);
      if (p < 70 && (!worst || p < worst.p)) worst = { g: g, p: p };
    });
    if (worst) return WS[worst.g];
    var gs = games().filter(function (g) { return WS[g.id]; });
    for (var i = 0; i < gs.length; i++) if (!st[gs[i].id]) return WS[gs[i].id];   // 안 해 본 게임 중 앞 단계부터
    if (typeof theoryScoreByStudent !== 'undefined' && !theoryScoreByStudent[name]) return 6;
    return null;
  }

  /* ── 그리기 ─────────────────────────────────────────── */
  function render(ranked, names, students) {
    try {
      var acc30 = accBy(30), acc7 = accBy(7), accPrev = accBy(30, 7), seen = lastSeenMap();
      var n = names.length, now = Date.now();
      // 이름별 점수 묶음(renderDashboard 가 만든 students)
      var scores = students || {};
      // 최근 60일에 판이 없으면 저장된 최고점의 날짜로 '마지막으로 한 날'을 잡는다(8월에 하고 멈춘 학생이 '기록 없음'으로 보이지 않게)
      names.forEach(function (x) {
        if (seen[x]) return;
        Object.keys(scores[x] || {}).forEach(function (g) {
          var r = scores[x][g], t = Date.parse((r && (r.updated_at || r.date)) || '');
          if (!isNaN(t) && (!seen[x] || t > seen[x])) seen[x] = t;
        });
      });

      // 1) 요약 4칸
      var act7 = {}, actPrev = {}, plays7 = 0;
      A.rows.forEach(function (r) {
        var t = Date.parse(r.played_at), u = cn(r.user_name);
        if (now - t <= 7 * DAY) { act7[u] = 1; plays7++; }
        else if (now - t <= 14 * DAY) actPrev[u] = 1;
      });
      A.lv.forEach(function (r) { var t = Date.parse(r.played_at); if (now - t <= 7 * DAY) act7[cn(r.user_name)] = 1; });
      var a7 = Object.keys(act7).filter(function (x) { return names.indexOf(x) >= 0; }).length;
      var aP = Object.keys(actPrev).filter(function (x) { return names.indexOf(x) >= 0; }).length;
      var diff = a7 - aP;
      var gl = games().concat([{ id: theoryId(), name: '이론 객관식' }]);
      var weak = null;
      gl.forEach(function (g) { var c = classAcc(acc30, g.id); if (c && (!weak || c.p < weak.p)) weak = { g: g, p: c.p }; });
      var noTheory = names.filter(function (x) { return !(typeof theoryScoreByStudent !== 'undefined' && theoryScoreByStudent[x]); }).length;
      setHTML('v2-sum',
        card('최근 7일 참여', a7 + '<small> / ' + n + '명</small>', (diff >= 0 ? '지난주보다 +' : '지난주보다 ') + diff + '명', '') +
        card('최근 7일 판 수', plays7.toLocaleString() + '<small>판</small>', a7 ? '한 명당 평균 ' + Math.round(plays7 / a7) + '판' : '이번 주 기록 없음', '') +
        card('가장 약한 게임', weak ? h(weak.g.name) : '—', weak ? '반 정답률 ' + weak.p + '% (최근 30일)' : '최근 30일 판별 기록이 적어요', weak && weak.p < 55 ? 'bad' : 'warn') +
        card('이론 아직 안 함', noTheory + '<small>명</small>', '필기 30% — 이론 객관식 미도전', noTheory ? 'warn' : ''));

      // 2) 챙겨 볼 학생
      var idle = names.map(function (x) { return { n: x, t: seen[x] || 0 }; })
        .filter(function (o) { return !o.t || now - o.t > 7 * DAY; })
        .sort(function (a, b) { return a.t - b.t; });
      var low = [];
      names.forEach(function (x) {
        var a = acc30[x] || {}, w = null;
        Object.keys(a).forEach(function (g) { if (a[g].t >= 20) { var p = pct(a[g].c, a[g].t); if (p < 55 && (!w || p < w.p)) w = { g: g, p: p }; } });
        if (w) low.push({ n: x, g: w.g, p: w.p });
      });
      low.sort(function (a, b) { return a.p - b.p; });
      var up = [];
      names.forEach(function (x) {
        var a = acc7[x] || {}, b = accPrev[x] || {}, best = null;
        Object.keys(a).forEach(function (g) {
          if (!b[g] || a[g].t < 10 || b[g].t < 10) return;
          var d = pct(a[g].c, a[g].t) - pct(b[g].c, b[g].t);
          if (d >= 10 && (!best || d > best.d)) best = { g: g, d: d };
        });
        if (best) up.push({ n: x, g: best.g, d: best.d });
      });
      up.sort(function (a, b) { return b.d - a.d; });
      var rec = {};
      names.forEach(function (x) { var r = recommend(x, scores, acc30); if (r) (rec[r] = rec[r] || []).push(x); });
      global.__dashRec = rec;
      function gname(id) { var g = gl.filter(function (x) { return x.id === id; })[0]; return g ? g.name : id; }
      function chips(list, sub, max) {
        if (!list.length) return '<span class="v2-none">없음</span>';
        var more = list.length > max ? '<span class="chip more">외 ' + (list.length - max) + '명</span>' : '';
        return list.slice(0, max).map(function (o) {
          return '<button class="chip" onclick="openModal(\'' + ha(o.n) + '\')">' + h(o.n) + '<small>' + h(sub(o)) + '</small></button>';
        }).join('') + more;
      }
      setHTML('v2-watch',
        watch('bad', '7일 넘게 안 함', chips(idle, function (o) { return o.t ? ago(o.t) : '기록 없음'; }, 10)) +
        watch('warn', '정답률 낮음', chips(low, function (o) { return gname(o.g) + ' ' + o.p + '%'; }, 8)) +
        watch('good', '많이 오름', chips(up, function (o) { return gname(o.g) + ' +' + o.d + '%p'; }, 8)) +
        watch('blue', '추천 학습지', Object.keys(rec).sort().map(function (k) {
          return '<button class="chip" onclick="DashV2.tab(\'materials\')">' + WS_NAME[k] + '<small>' + rec[k].length + '명</small></button>';
        }).join('') || '<span class="v2-none">없음</span>'));

      // 3) 게임별 현황 표
      var rows = gl.map(function (g) {
        var cnt = 0;
        names.forEach(function (x) {
          var st = scores[x] || {};
          if (g.id === theoryId() ? (typeof theoryScoreByStudent !== 'undefined' && theoryScoreByStudent[x]) : (st[g.id] || (typeof lvEff === 'function' && lvEff(x, g.id)))) cnt++;
        });
        var c = classAcc(acc30, g.id), accCell;
        if (g.id === 'memory') accCell = '<span class="v2-note">점수형</span>';
        else if (c) accCell = '<span class="bar"><i class="' + tone(c.p) + '" style="width:' + c.p + '%"></i></span>' + c.p + '%';
        else accCell = '<span class="v2-note">' + (/flight/.test(g.id) ? '점수형' : '기록 적음') + '</span>';
        var p2 = '—';
        if (typeof LV2_GAMES !== 'undefined' && LV2_GAMES.indexOf(g.id) >= 0 && typeof lvEff === 'function') {
          var k = names.filter(function (x) { var e = lvEff(x, g.id); return e && e.l2 && e.l2.passed; }).length;
          p2 = '<span class="pill ' + (k ? (k * 3 >= n ? 'good' : 'warn') : 'bad') + '">' + k + '명 통과</span>';
        }
        return '<tr><td>' + h(g.name) + '</td><td class="n">' + cnt + '명</td><td>' + accCell + '</td><td>' + p2 + '</td></tr>';
      }).join('');
      setHTML('v2-games', '<table class="v2-t"><tr><th>게임</th><th class="n">참여</th><th>정답률</th><th>2단계</th></tr>' + rows + '</table>');

      // 4) 폰용 학생 카드
      var gs = games();
      setHTML('v2-cards', (ranked || []).map(function (r) {
        var st = r.scores || {}, last = seen[r.name] ? ago(seen[r.name]) : '기록 없음';
        var pills = gs.map(function (g) {
          var s = st[g.id], p = s ? s.score / g.max * 100 : null;
          var cls = !s ? 'none' : p >= (typeof CLEAR_PCT !== 'undefined' ? CLEAR_PCT : 70) ? 'good' : p >= 40 ? 'warn' : 'bad';
          return '<span class="pc ' + cls + '"><em>' + h(g.name) + '</em><b>' + (s ? s.score.toLocaleString() : '안 함') + '</b></span>';
        }).join('');
        var ti = typeof theoryScoreByStudent !== 'undefined' ? theoryScoreByStudent[r.name] : null;
        pills += '<span class="pc ' + (!ti ? 'none' : ti.passed ? 'good' : 'bad') + '"><em>이론</em><b>' + (ti ? Math.round(ti.bestRate * 100) + '%' : '안 함') + '</b></span>';
        var rc = recommend(r.name, scores, acc30);
        return '<button class="v2-card" onclick="openModal(\'' + ha(r.name) + '\')"><div class="hd"><b>' + h(r.name) + '</b>' +
          '<span class="' + (seen[r.name] && now - seen[r.name] <= 7 * DAY ? '' : 'idle') + '">' + last + '</span>' +
          (rc ? '<span class="rc">추천 ' + WS_NAME[rc].split(' ')[0] + '</span>' : '') + '</div><div class="pcs">' + pills + '</div></button>';
      }).join('') || '<div class="v2-none">아직 기록이 없습니다</div>');

      renderMaterials();
      var code = document.getElementById('v2-code');
      if (code && typeof currentGroup !== 'undefined' && currentGroup) code.textContent = currentGroup.join_code || currentGroup.id;
    } catch (e) { console.warn('대시보드 새 화면 그리기 실패', e); }
  }

  function card(label, val, sub, cls) {
    return '<div class="sc2 ' + (cls || '') + '"><div class="l">' + label + '</div><div class="v">' + val + '</div><div class="s">' + sub + '</div></div>';
  }
  function watch(color, label, body) {
    return '<div class="watch"><div class="k"><i class="dot ' + color + '"></i>' + label + '</div><div class="chips">' + body + '</div></div>';
  }
  function setHTML(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }

  /* ── 수업 자료 ───────────────────────────────────────── */
  var MAT_BASE = 'https://tjddlf0224-sudo.github.io/accounting-materials/';
  // 교사용(정답) 파일 이름엔 짐작 못 할 꼬리를 붙인다 — 학생이 'ws4_teacher.pdf' 로 바로 찾아 들어가지 않게. 검색에도 안 걸리게 robots 로 막아 둠.
  var T_KEY = 'e05c982030';
  var MATS = [
    [1, '계정과목 분류', '계정과목 산성비', 'raincloud'], [2, '계정과목의 뜻', '기억의 전당', 'puzzle'],
    [3, '거래의 8요소와 분개', '회계 차변대변', 'bolt'], [4, '결산정리분개', '결산분개 조립공장', 'factory'],
    [5, '장부조회', '플라이트 장부조회', 'plane'], [6, '이론 객관식', '이론 객관식', 'receipt']
  ];
  function renderMaterials() {
    var rec = global.__dashRec || {};
    setHTML('v2-materials',
      '<div class="mat-head"><b>전산회계 2급 게임 학습지</b><span>게임과 함께 쓰는 수업용 학습지예요. 학급을 만든 선생님은 무료로 받을 수 있어요. ' +
      '학생용은 인쇄해서 나눠 주고, 교사용에는 같은 자리에 정답과 해설이 있어요.</span></div>' +
      '<div class="mats">' + MATS.map(function (m) {
        var k = rec[m[0]] ? '<span class="mrec">이 반 추천 ' + rec[m[0]].length + '명</span>' : '';
        return '<div class="mat"><img src="assets/icons/' + m[3] + '.webp" alt=""><div class="mt"><em>학습지 ' + '①②③④⑤⑥'[m[0] - 1] + '</em><b>' + m[1] + '</b><span>함께하는 게임 · ' + m[2] + '</span>' + k + '</div>' +
          '<div class="mb"><a class="tb-btn primary" href="' + MAT_BASE + 'ws' + m[0] + '_student.pdf" target="_blank" rel="noopener">학생용 PDF</a>' +
          '<a class="tb-btn" href="' + MAT_BASE + 'ws' + m[0] + '_teacher_' + T_KEY + '.pdf" target="_blank" rel="noopener">교사용 (정답·해설)</a></div></div>';
      }).join('') + '</div>');
  }

  /* ── 탭 ─────────────────────────────────────────────── */
  function tab(name) {
    var ok = ['overview', 'students', 'team', 'materials', 'settings'];
    if (ok.indexOf(name) < 0) name = 'overview';
    document.querySelectorAll('#dashboard .dtab').forEach(function (s) { s.hidden = s.dataset.tab !== name; });
    document.querySelectorAll('#dtabs [data-tab]').forEach(function (b) {
      var on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    try { localStorage.setItem(TAB_KEY, name); } catch (e) {}
    if (name === 'materials') renderMaterials();
    if (global.scrollTo) global.scrollTo(0, 0);
  }
  function initTab() { var t = 'overview'; try { t = localStorage.getItem(TAB_KEY) || t; } catch (e) {} tab(t); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTab); else initTab();

  global.DashV2 = { loadActivity: loadActivity, render: render, tab: tab, _A: function () { return A; } };
})(window);
