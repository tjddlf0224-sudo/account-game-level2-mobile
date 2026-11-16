/* ============================================================
 *  installref.js — 설치 경로 합계(Install Referrer), 안드로이드만 — 2026-11-13 성일님 "2, 3 모두"(홍보팀 전달)
 *  전산회계 오락실 · 지시서 ~/개발팀/넘김/홍보팀_설치경로_InstallReferrer_2026-11-13.md · 보카 shared/installref.js(town 2b27c49)를 옮김
 *
 *  · 새 설치일 때만, 설치당 한 번만 보낸다(localStorage am_iref: new → sent).
 *    이 파일이 처음 읽힐 때 이미 놀던 흔적(닉네임·첫 판 안내·연속 정답 등)이 있으면 업데이트로 받은 기존 사용자 → 'old' 로 적고 끝.
 *    그래서 index·index_lv1·login 에서 daylog.js 바로 뒤(다른 저장보다 먼저)에 읽는다.
 *    + Play 가 알려 준 설치 시작 시각이 이 기능이 들어간 판보다 앞(2026-11-14 00:00 KST 전)이면 역시 'old'.
 *  · 시험판·디버그·점검 기기(Test Lab)·성일님 폰(owner_device)은 보내지 않는다 — AmEnv 답을 기다린 뒤 DayLog.statOff() 로 판정.
 *  · 보내는 것: app·utm_source·utm_medium·utm_campaign·app_version 다섯 칸뿐(날짜는 서버가 KST 로). 기기 ID·광고 ID·닉네임·uid 없음.
 *  · 실패하면 다음 실행 때 다시, 3번 실패하면 포기(am_iref=gave_up). 앱 시작을 막지 않는다(load 3초 뒤·조용히 실패).
 *  · 보내는 곳: 전산 Supabase public.install_referrers(anon insert 전용, 홍보팀이 만듦). 시험 하네스는 /rest/v1/** 를 가로챈다.
 * ============================================================ */
(function (g) {
  'use strict';
  if (g.__amIrefLoaded) return; g.__amIrefLoaded = true;
  var LS = null; try { LS = g.localStorage; } catch (e) {}
  function get(k) { try { return LS ? LS.getItem(k) : null; } catch (e) { return null; } }
  function set(k, v) { try { if (LS) LS.setItem(k, v); } catch (e) {} }
  /* 예전 판이 남기는 '써 본 흔적' — 첫 화면 열기만으로는 생기지 않는 것만(am_env_chk·am_daylog 는 첫 페이지에서 바로 생겨 넣지 않음) */
  var OLD = ['hub_nickname', 'hub_uid', 'hub_level', 'am_firstrun_done', 'am_played_once', 'streak_days', 'accGame_myName', 'hub_muted', '_synced_identity', 'am_remind_asked'];
  var CUTOFF = 1794582000;   // 2026-11-14 00:00 KST(초) — 이보다 먼저 설치 시작이면 이 판 전 설치
  var st = get('am_iref');
  if (!st) {
    var old = false; for (var i = 0; i < OLD.length; i++) if (get(OLD[i]) !== null) { old = true; break; }
    st = old ? 'old' : 'new'; set('am_iref', st);
  }
  if (st !== 'new') return;
  var C = g.Capacitor;
  try { if (!(C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform && C.getPlatform() === 'android')) return; } catch (e) { return; }
  var URL = 'https://pjagaulfivafamhhiveg.supabase.co/rest/v1/install_referrers', KEY = 'sb_publishable_yck2tAKApEjVSJOJMVSXuQ_AGaNatuI';
  var tries = +(get('am_iref_try') || 0);
  if (tries >= 3) { set('am_iref', 'gave_up'); return; }
  var busy = false;
  function fail() { set('am_iref_try', String(tries + 1)); if (tries + 1 >= 3) set('am_iref', 'gave_up'); }
  function clean(v) { v = String(v == null ? '' : v).slice(0, 40); if (!v) return undefined; return /^[A-Za-z0-9_.()\-]{1,40}$/.test(v) ? v : 'other'; }
  /* 시험판인지 — AmEnv(점검 기기 물어보기) 답이 온 뒤 DayLog.statOff(). 판정 도구가 없으면 true(이번엔 안 보냄, 횟수도 안 셈) */
  function quiet() {
    return new Promise(function (res) {
      function judge() { try { return g.DayLog && g.DayLog.statOff ? !!g.DayLog.statOff() : true; } catch (e) { return true; } }
      try { if (g.AmEnv && g.AmEnv.whenReady) return g.AmEnv.whenReady(function () { res(judge()); }); } catch (e) {}
      res(judge());
    });
  }
  function run() {
    if (busy || get('am_iref') !== 'new') return;
    var P = (C.Plugins || {}).InstallReferrer, A = (C.Plugins || {}).App;
    if (!P || !P.get) return;
    busy = true;
    quiet().then(function (q) {
      if (q) return;
      return P.get().then(function (r) {
        if (!r || r.error || r.referrer == null) { fail(); return; }
        if (r.installBegin > 0 && r.installBegin < CUTOFF) { set('am_iref', 'old'); return; }
        var u = {}; String(r.referrer).split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i <= 0) return;
          var k = kv.slice(0, i), v = kv.slice(i + 1); try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {} u[k] = v; });
        var ver = A && A.getInfo ? Promise.resolve().then(function () { return A.getInfo(); }).then(function (i) { return (i && i.version) || ''; }, function () { return ''; }) : Promise.resolve('');
        return ver.then(function (v) {
          var body = { app: 'accounting' }, s = clean(u.utm_source), m = clean(u.utm_medium), c = clean(u.utm_campaign), av = clean(v);
          set('am_iref_src', s || 'organic');   // 행동 기록 첫 줄 in 칸용(11/15 분석팀 규격) — 기기 안에만, 서버엔 위 다섯 칸 그대로
          if (s) body.utm_source = s; if (m) body.utm_medium = m; if (c) body.utm_campaign = c; if (av) body.app_version = av;
          return fetch(URL, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify(body) }).then(function (res) { if (res && res.ok) set('am_iref', 'sent'); else fail(); }, fail);
        });
      }, fail);
    }).catch(function () {}).then(function () { busy = false; });
  }
  function later() { setTimeout(function () { try { run(); } catch (e) {} }, 3000); }
  if (g.document && g.document.readyState === 'complete') later(); else g.addEventListener('load', later);
  g.AmInstallRef = { _run: run };   // 시험용
})(window);
