/* ============================================================
 * adsense.js — 웹(GitHub Pages)에서만 AdSense 배너를 띄운다.
 *
 * ⚠ 네이티브 앱(iOS/Android WebView) 안에서 AdSense 가 뜨면 정책 위반이다.
 *   앱은 이미 AdMob 을 쓰고 있고(capacitor-bridge.js), 같은 화면에 웹 광고 SDK가
 *   중첩되면 Google 정책 위반으로 계정 정지 사유가 된다. growth.js 의 platform()과
 *   같은 방식으로 Capacitor.isNativePlatform() 을 확인해서, 네이티브면 이 파일은
 *   아무 것도 하지 않는다(로더 스크립트조차 넣지 않는다).
 *
 * ⚠ "게시자 콘텐츠 없는 화면의 광고"로 2026-08-28 AdSense 검토에서 거절된 적이
 *   있다(전산회계 오락실 사이트 자체가 아니라 루트 랜딩 페이지 사유였지만, 같은
 *   실수를 게임 쪽에서도 반복하지 않는다) — 그래서 이 스크립트는 페이지 쪽에서
 *   '.ad-slot[data-adsense]' 를 직접 심어 둔 곳에만 반응한다. 게임 진행 화면에는
 *   이 클래스를 절대 넣지 않는다(허브·오답노트 목록·이론 주제선택 같은, 콘텐츠가
 *   있는 화면에만 둔다).
 *
 * 사용법: 페이지에 아래를 넣는다(다른 공용 스크립트들과 같은 자리, body 하단).
 *   <script src="adsense.js?v=NN"></script>
 * 그리고 콘텐츠 화면 안에:
 *   <div class="ad-slot" data-adsense style="display:none">
 *     <div class="ad-slot-label">광고</div>
 *     <ins class="adsbygoogle" style="display:block"
 *          data-ad-client="ca-pub-7418287954060066"
 *          data-ad-slot="__ADSENSE_SLOT_ID__"
 *          data-ad-format="auto" data-full-width-responsive="true"></ins>
 *   </div>
 * ============================================================ */
(function (global) {
  'use strict';

  function isNative() {
    try {
      var C = global.Capacitor;
      return !!(C && C.isNativePlatform && C.isNativePlatform());
    } catch (e) { return false; }
  }

  function init() {
    if (isNative()) return;   // 앱 WebView — 아무 것도 안 한다(로더도 안 넣음)

    var slots = document.querySelectorAll('.ad-slot[data-adsense]');
    if (!slots.length) return;

    // 실제 광고 단위 ID 를 아직 안 넣은 자리는 건너뛴다(플레이스홀더로 push 하면 콘솔에 오류만 쌓인다).
    var ready = [];
    for (var i = 0; i < slots.length; i++) {
      var ins = slots[i].querySelector('ins.adsbygoogle');
      if (ins && ins.getAttribute('data-ad-slot') && ins.getAttribute('data-ad-slot').indexOf('_') === -1) {
        slots[i].style.display = '';
        ready.push(ins);
      }
    }
    if (!ready.length) return;

    var s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7418287954060066';
    s.onload = function () {
      try {
        for (var j = 0; j < ready.length; j++) (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {}
    };
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
