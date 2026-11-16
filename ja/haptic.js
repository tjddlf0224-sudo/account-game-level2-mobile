/* ============================================================
 *  haptic.js — 정답·오답 진동(햅틱) · 2026-11-05
 *  전산회계 오락실
 *
 *  왜. 게임 6개가 navigator.vibrate 로 진동을 냈는데
 *   · 아이폰(WKWebView)은 이 기능 자체가 없어(WebKit 미구현) 조용히 건너뛰었고
 *   · 안드로이드 웹뷰는 앱에 VIBRATE 권한이 없어 울리지 않았다.
 *  조사 ~/개발팀/넘김/전산_광고·진동·SRS_조사_2026-11-05.md 2절 → 성일님 11/5 "진동 고쳐".
 *
 *  앱이면 @capacitor/haptics(아이폰 탭틱 엔진·안드 Vibrator — 플러그인이 VIBRATE 권한을 넣는다),
 *  웹이면 예전처럼 navigator.vibrate(되는 브라우저에서만). 실패해도 게임은 그대로.
 *
 *  게임은 이렇게 부른다:  Haptic.correct()  /  Haptic.wrong()
 * ============================================================ */
(function (global) {
  'use strict';
  if (global.Haptic) return;

  function plugin() {
    try {
      var C = global.Capacitor;
      return (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.Haptics) || null;
    } catch (e) { return null; }
  }
  function web(pattern) {
    try { if (global.navigator && navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  }
  function call(p, fn, arg) {
    try { var r = p[fn](arg); if (r && r.catch) r.catch(function () {}); } catch (e) {}
  }

  // 정답: 짧고 가볍게(웹 15ms 와 같은 느낌)
  function correct() {
    var H = plugin();
    if (H) call(H, 'impact', { style: 'LIGHT' });
    else web(15);
  }
  // 오답: 두 번 톡톡(웹 [30,40,30] 과 같은 느낌) — 아이폰은 '오류' 알림 햅틱이 그 모양이다
  function wrong() {
    var H = plugin();
    if (H) call(H, 'notification', { type: 'ERROR' });
    else web([30, 40, 30]);
  }

  global.Haptic = { correct: correct, wrong: wrong };
})(window);
