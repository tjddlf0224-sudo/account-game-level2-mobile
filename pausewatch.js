/* ============================================================
 *  pausewatch.js — "지금 화면이 가려져 있나"를 한 곳에서 판단한다
 *  전산회계 오락실
 *
 *  왜 만들었나. 2026-09-15 실기기 제보:
 *    "신고의 문 게임 하고 있었는데 갑자기 전면광고가 뜨네. 게임 하고 있을 때는
 *     광고 뜨면 안되지. 그거때문에 시간제한에 걸려서 죽었잖아"
 *
 *  전면광고가 웹뷰를 덮는 동안에도 setInterval 은 계속 돌아서 제한 시간이 깎였다.
 *  광고만의 문제가 아니다 — 전화가 오거나 홈으로 나갔다 와도 똑같이 죽는다.
 *
 *  ⚠ WKWebView 에서는 visibilitychange 가 **항상 오지는 않는다.** 네이티브 전면광고는
 *    웹뷰 위에 얹히는 것이라 문서가 'hidden' 이 안 되는 경우가 있다. 그래서
 *      · document visibilitychange
 *      · window pagehide / pageshow / blur / focus
 *      · Capacitor App.appStateChange  (네이티브가 직접 알려주는 가장 믿을 만한 신호)
 *    를 모두 듣고, 하나라도 "가려졌다"고 하면 가려진 것으로 본다.
 *    (bgm.js 가 오디오에서 같은 이유로 3중으로 거는 것과 같은 판단이다.)
 *
 *  쓰는 법 — 시간을 깎는 자리에서 한 줄만 보면 된다:
 *      function tick(){
 *        if (window.AMPause && AMPause.hidden()) return;   // 가려져 있으면 시간 안 깎는다
 *        ...
 *      }
 *
 *  타이머를 멈췄다 되살리는 방식이 아니라 **"시간을 안 깎는다"** 로 한 이유:
 *  게임마다 타이머 구조(setInterval·rAF·직접 계산)가 제각각이라, 멈췄다 되살리는
 *  코드를 게임마다 다르게 넣으면 되살리기를 빠뜨리는 쪽이 더 위험하다. 이 방식은
 *  타이머가 계속 돌아도 결과가 같고, 복귀 처리를 잊을 자리가 없다.
 * ============================================================ */
(function (global) {
  'use strict';

  var nativeHidden = false;   // Capacitor 가 알려준 상태(가장 믿을 만하다)
  var blurred = false;        // 창이 포커스를 잃음

  function hidden() {
    return nativeHidden || blurred || (typeof document !== 'undefined' && document.hidden === true);
  }

  function setNative(isActive) { nativeHidden = !isActive; }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) blurred = false;   // 돌아왔으면 blur 도 풀어 준다
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', function () { blurred = true; });
    window.addEventListener('pageshow', function () { blurred = false; nativeHidden = false; });
    window.addEventListener('blur',  function () { blurred = true; });
    window.addEventListener('focus', function () { blurred = false; nativeHidden = false; });
  }

  /* Capacitor 앱 상태 — 플러그인이 늦게 붙을 수 있어 DOMContentLoaded 에서 한 번 더 시도한다
     (capacitor-bridge.js 가 admob() 을 지연 바인딩하는 것과 같은 이유). */
  function bindCapacitor() {
    try {
      var App = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.App;
      if (!App || bindCapacitor._done) return;
      bindCapacitor._done = true;
      App.addListener('appStateChange', function (st) { setNative(!!(st && st.isActive)); });
    } catch (e) {}
  }
  bindCapacitor();
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', bindCapacitor);
  }

  global.AMPause = { hidden: hidden, _setNative: setNative };
})(typeof window !== 'undefined' ? window : globalThis);
