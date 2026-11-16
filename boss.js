/* ============================================================
 *  boss.js — 오답노트로 열리는 숨은 보스 '감사관'
 *  전산회계 오락실 · 2026-11-03 신설 (팀장 #45, 성일님 "진행해. 좋아." · 안: ~/개발팀/넘김/전산_숙련4단계_숨은보스_안_2026-11-03.md)
 *
 *  오답노트에서 다시 맞혀 지운 문제(=정복)가 CONFIG.NEED 개 이상이고 정복률(정복 ÷ (정복 + 남은 오답))이
 *  CONFIG.RATE 이상이면 '감사관'이 열린다(한 번 열리면 계속). 보스전은 오답노트 화면 안 모드(review.html):
 *  내가 틀렸던·정복한 문제에서만 CONFIG.QN 문제, 4지선다(보기는 같은 게임의 다른 정답), 목숨 CONFIG.LIVES,
 *  CONFIG.WIN 개 이상 맞히면 칭호 '감사관도 인정한 회계사'. 기존 등급·랭킹·점수엔 안 섞는다. 광고 없음.
 *
 *  저장: 기기 안 localStorage am_boss = { 닉네임: { n: 정복 수, items: [정복한 문제 최대 200], rem: 남은 오답 수, open, won, best } }
 *        (오답노트는 맞힌 문제를 지워 버려 정복 기록이 안 남으므로 여기 따로 둔다. 서버 칸 없음)
 *  행동 기록: AmEv.log('boss_open') · AmEv.log('boss_end', { res: 'win'|'lose', ok })
 * ============================================================ */
(function (global) {
  'use strict';
  if (global.Boss) return;

  /* ── 숫자는 여기 한 곳 ── */
  var CONFIG = { NEED: 20, RATE: 0.6, QN: 10, LIVES: 3, WIN: 8, KEEP: 200 };
  var TITLE = '감사관도 인정한 회계사';

  var LS = 'am_boss';
  function user() { try { return (localStorage.getItem('hub_nickname') || '').trim() || '게스트'; } catch (e) { return '게스트'; } }
  function loadAll() { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } }
  function saveAll(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} }
  function me(o) { var u = user(); return (o[u] = o[u] || { n: 0, items: [], rem: 0, open: false, won: false, best: 0 }); }
  function ev(e, f) { try { if (global.AmEv) global.AmEv.log(e, f || {}); } catch (x) {} }

  /* 오답노트에서 다시 맞혀 지운 문제 하나 */
  function conquer(r) {
    if (!r || !r.game || r.key == null) return;
    var o = loadAll(), m = me(o);
    m.n = (m.n || 0) + 1;
    var id = r.game + '|' + r.key;
    m.items = (m.items || []).filter(function (x) { return x.id !== id; });
    m.items.push({ id: id, game: r.game, key: String(r.key), q: String(r.q || ''), correct: String(r.correct == null ? '' : r.correct), wrong: r.wrong == null ? null : String(r.wrong), type: r.type || '' });
    if (m.items.length > CONFIG.KEEP) m.items = m.items.slice(-CONFIG.KEEP);
    saveAll(o);
  }

  /* 오답노트를 열 때 남은 오답 수를 알려 주면 열림 여부를 계산해 돌려준다 */
  function state(remaining) {
    var o = loadAll(), m = me(o);
    if (typeof remaining === 'number') m.rem = remaining;
    var n = m.n || 0, rem = m.rem || 0;
    var rate = (n + rem) ? n / (n + rem) : 0;
    var justOpened = false;
    if (!m.open && n >= CONFIG.NEED && rate >= CONFIG.RATE) { m.open = true; justOpened = true; }
    saveAll(o);
    if (justOpened) ev('boss_open');
    return { n: n, rem: rem, rate: rate, open: !!m.open, won: !!m.won, best: m.best || 0, justOpened: justOpened,
             need: CONFIG.NEED, rateNeed: CONFIG.RATE, title: TITLE };
  }

  function shuffle(a, rnd) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* 문제 만들기 — current: 지금 남은 오답(WrongNote.list), 내가 정복한 문제와 합쳐 CONFIG.QN 개 */
  function build(current, rnd) {
    rnd = rnd || Math.random;
    var o = loadAll(), m = me(o), seen = {}, pool = [];
    (current || []).concat(m.items || []).forEach(function (r) {
      var id = r.game + '|' + r.key;
      if (seen[id] || r.correct == null || String(r.correct) === '') return;
      seen[id] = 1; pool.push(r);
    });
    var picks = shuffle(pool.slice(), rnd).slice(0, CONFIG.QN);
    return picks.map(function (r) {
      var same = pool.filter(function (x) { return x.game === r.game && String(x.correct) !== String(r.correct); }).map(function (x) { return String(x.correct); });
      var any = pool.filter(function (x) { return String(x.correct) !== String(r.correct); }).map(function (x) { return String(x.correct); });
      var opts = [String(r.correct)];
      if (r.wrong && String(r.wrong) !== String(r.correct)) opts.push(String(r.wrong));
      shuffle(same, rnd).concat(shuffle(any, rnd)).forEach(function (c) { if (opts.length < 4 && opts.indexOf(c) < 0) opts.push(c); });
      return { game: r.game, key: r.key, q: r.q, type: r.type, correct: String(r.correct), options: shuffle(opts, rnd) };
    });
  }

  /* 한 판 끝 */
  function finish(ok, total) {
    var o = loadAll(), m = me(o);
    var win = ok >= CONFIG.WIN;
    var first = win && !m.won;
    if (win) m.won = true;
    if (ok > (m.best || 0)) m.best = ok;
    saveAll(o);
    ev('boss_end', { res: win ? 'win' : 'lose', ok: ok });
    return { win: win, firstWin: first, ok: ok, total: total, best: m.best, title: TITLE };
  }

  global.Boss = { CONFIG: CONFIG, TITLE: TITLE, conquer: conquer, state: state, build: build, finish: finish };
})(window);
