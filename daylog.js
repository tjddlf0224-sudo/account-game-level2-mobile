/* ============================================================
 *  daylog.js — 하루 합계 기록(광고 · 화면 · 시작/완료)
 *  전산회계 오락실 · 2026-10-09 신설
 *
 *  왜. AdMob 은 앱·광고 종류별 합계만 준다 → 어느 자리에서 광고를 권했고, 몇 번 봤고,
 *  몇 번 못 불러왔는지 모른다. 또 play_events 엔 '끝까지 한 판'만 남아서 오답노트·랭킹을
 *  둘러보거나 게임을 하다 그만둔 사람은 '아무것도 안 한 사람'으로 보였다(분석팀 10/9).
 *
 *  무엇을. **기기·계정 아이디 없이** 'KST 날짜 × 종류 × 자리 × 사건 × 플랫폼' 합계에 +1 만.
 *    kind 'ad'     — key=자리(페이지 이름 또는 streak 등), event=offer/start/earn/close/fail/offline/show/notready
 *    kind 'screen' — key=페이지 이름, event=view
 *    kind 'act'    — key=게임 id, event=start/finish
 *    kind 'remind' — key=daily, event=asked/on/off/denied/opened
 *
 *  어떻게. 기기 안(localStorage)에 모아 두었다가
 *    · 앱이 뒤로 가거나 탭이 가려질 때(visibilitychange hidden) 한 번에 보낸다 — 화면을 옮길 때마다 보내지 않는다.
 *    · 페이지를 열 때, 지난 날짜 몫이 남아 있거나 5분 넘게 묵은 게 있으면 보낸다.
 *  보내는 곳: Supabase RPC usage_bump(rows) — 표 usage_daily 에 더하기만 한다(docs/sql/2026-10-09_usage_daily.sql).
 *  보내다 실패하면 다음 기회에 다시(보낸 몫만 지운다). 테스트 하네스는 /rest/v1/** 를 가로챈다.
 *
 *  window.DayLog.hit(kind, key, event)
 * ============================================================ */
(function (global) {
  'use strict';
  if (global.DayLog) return;

  var URL = 'https://pjagaulfivafamhhiveg.supabase.co/rest/v1/rpc/usage_bump';
  var KEY = 'sb_publishable_yck2tAKApEjVSJOJMVSXuQ_AGaNatuI';
  var LS = 'am_daylog', LS_FIRST = 'am_daylog_first';
  var STALE_MS = 5 * 60 * 1000;

  function day() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
  function platform() {
    try {
      var C = global.Capacitor;
      if (C && C.isNativePlatform && C.isNativePlatform()) return (C.getPlatform && C.getPlatform()) || 'app';
    } catch (e) {}
    return 'web';
  }
  function load() { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } }
  function save(o) {
    try {
      if (Object.keys(o).length) localStorage.setItem(LS, JSON.stringify(o));
      else { localStorage.removeItem(LS); localStorage.removeItem(LS_FIRST); }
    } catch (e) {}
  }
  function clean(s) { return String(s == null ? '' : s).replace(/[|]/g, '_').slice(0, 40); }

  function hit(kind, key, event) {
    try {
      if (!kind || !key || !event) return;
      var o = load(), k = [day(), clean(kind), clean(key), clean(event), platform()].join('|');
      o[k] = (o[k] || 0) + 1;
      save(o);
      if (!localStorage.getItem(LS_FIRST)) localStorage.setItem(LS_FIRST, String(Date.now()));
    } catch (e) {}
  }

  function rowsOf(o) {
    return Object.keys(o).map(function (k) {
      var p = k.split('|');
      return { day: p[0], kind: p[1], key: p[2], event: p[3], platform: p[4], n: o[k] };
    });
  }
  /* 보낸 만큼만 뺀다 — 보내는 동안 새로 쌓인 몫은 남는다 */
  function subtract(sent) {
    var o = load();
    Object.keys(sent).forEach(function (k) {
      if (!o[k]) return;
      o[k] -= sent[k];
      if (o[k] <= 0) delete o[k];
    });
    save(o);
  }

  var busy = false;
  function flush(leaving) {
    try {
      if (busy && !leaving) return;
      var o = load(), keys = Object.keys(o);
      if (!keys.length || typeof fetch !== 'function') return;
      if (keys.length > 200) { var cut = {}; keys.slice(0, 200).forEach(function (k) { cut[k] = o[k]; }); o = cut; }
      var body = JSON.stringify({ rows: rowsOf(o) });
      var opts = { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }, body: body };
      if (leaving) {
        // 화면이 사라지는 중 — 응답을 기다릴 수 없으니 먼저 빼고 보낸다(중복보다 유실이 낫다)
        opts.keepalive = true;
        subtract(o);
        fetch(URL, opts).catch(function () {});
        return;
      }
      busy = true;
      fetch(URL, opts).then(function (r) {
        busy = false;
        if (r && r.ok) subtract(o);
      }, function () { busy = false; });
    } catch (e) { busy = false; }
  }

  function dueOnOpen() {
    try {
      var o = load(), keys = Object.keys(o);
      if (!keys.length) return false;
      var t = day();
      if (keys.some(function (k) { return k.slice(0, 10) !== t; })) return true;
      var first = parseInt(localStorage.getItem(LS_FIRST) || '0', 10);
      return first > 0 && Date.now() - first > STALE_MS;
    } catch (e) { return false; }
  }

  global.DayLog = {
    hit: hit,
    flush: flush,
    _pending: function () { return load(); }   // 시험용
  };

  /* 화면 방문 — 페이지 이름(확장자 뺌) */
  try {
    var page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    hit('screen', page, 'view');
  } catch (e) {}

  /* 게임 끝(=play_events 한 줄)도 같은 표에 — Growth.logPlay 를 감싼다. 시작은 각 게임이 DayLog.hit('act', id, 'start') */
  (function hookFinish() {
    var tries = 0;
    function tryHook() {
      var G = global.Growth;
      if (!G || typeof G.logPlay !== 'function') return false;
      if (G.__daylogHooked) return true;
      var orig = G.logPlay;
      G.logPlay = function (gameId) {
        try { if (gameId) hit('act', gameId, 'finish'); } catch (e) {}
        return orig.apply(G, arguments);
      };
      G.__daylogHooked = true;
      return true;
    }
    if (!tryHook()) { var t = setInterval(function () { if (tryHook() || ++tries > 40) clearInterval(t); }, 50); }
  })();

  try {
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });
    setTimeout(function () { if (dueOnOpen()) flush(false); }, 3000);
  } catch (e) {}
})(window);
