/* ============================================================
 *  review-prompt.js — 앱 별점 요청 (스토어 정식 방식)
 *
 *  ⚠ 규정 (직접 만든 팝업은 리젝된다):
 *   - 애플 가이드라인 1.1.7: **커스텀 리뷰 팝업 금지.** SKStoreReviewController 만 허용.
 *   - 구글 In-App Review 설계지침: 리뷰창 전/중에 **어떤 질문도 금지**.
 *     "앱 마음에 드세요?"(의견 묻기), "5점 주실래요?"(예측 질문) 둘 다 위반.
 *     긍정 리뷰어만 걸러내 평점을 부풀리는 패턴이라 막는다.
 *   - 즉 **"5점 주세요" 라고 할 수 없다.** 시스템 별점창을 띄우는 것만 가능하다.
 *   - 리뷰 유도 버튼(call-to-action)으로 띄우는 것도 구글은 권장하지 않는다.
 *     → 사용자 흐름 중 자연스러운 지점에서 띄운다.
 *
 *  띄우는 시점: **개인 최고기록을 갱신했을 때** (게임 종료 후).
 *  애플·구글 모두 "사용자가 만족을 느낄 만한 순간(과제·레벨 완료)"을 권한다.
 *
 *  OS 도 자체 제한을 건다:
 *   - iOS: 365일에 최대 3회. 호출해도 안 뜰 수 있다. **TestFlight 에선 절대 안 뜬다**(개발빌드는 항상 뜸).
 *   - Android: Play 가 자체 할당량으로 제한.
 *   - 떴는지/별점을 줬는지 **알 방법이 없다**(의도된 설계). 그래서 결과에 기대는 로직을 두면 안 된다.
 *
 *  아래 제한은 OS 제한 위에 얹는 우리 것 — 학생이 성가시지 않게.
 *
 *  (이 파일은 Capacitor 버전과 동일 로직 — AdBridge.requestReview() 를
 *   네이티브가 구현한다는 점만 다르다. window.AdBridge 는 구 iOS/Android
 *   래퍼가 WKScriptMessageHandler / addJavascriptInterface 로 주입한다.)
 * ============================================================ */
(function (global) {
  'use strict';

  var K_COUNT = 'review_ask_count';
  var K_LAST  = 'review_last_ts';

  var MIN_PLAYS      = 5;                    // 앱을 충분히 써본 뒤에만
  var MIN_DAYS_GAP   = 60;                   // 마지막 요청 후 최소 60일
  var MAX_ASKS       = 3;                    // 총 3회까지 (iOS 연 3회와 맞춤)
  var DELAY_MS       = 1600;                 // 결과 화면이 자리잡은 뒤

  function num(k) { return parseInt(localStorage.getItem(k) || '0', 10) || 0; }

  /* 총 플레이 판수 — 성장 이력(hub_growth)에서 센다. 없으면 0. */
  function totalPlays() {
    try {
      var d = JSON.parse(localStorage.getItem('hub_growth') || '{}');
      var n = 0;
      Object.keys(d).forEach(function (user) {
        Object.keys(d[user] || {}).forEach(function (g) {
          n += (d[user][g] || []).length;
        });
      });
      return n;
    } catch (e) { return 0; }
  }

  function eligible() {
    if (num(K_COUNT) >= MAX_ASKS) return false;
    if (totalPlays() < MIN_PLAYS) return false;
    var last = num(K_LAST);
    if (last && (Date.now() - last) < MIN_DAYS_GAP * 86400000) return false;
    return true;
  }

  var Review = {
    /* 최고기록 갱신 같은 '기분 좋은 순간'에만 호출한다.
       실제로 뜰지는 OS 가 정한다 — 안 떠도 정상이고, 알 방법도 없다. */
    maybeAsk: function () {
      try {
        var Ad = global.AdBridge;
        if (!Ad || typeof Ad.requestReview !== 'function') return;  // 웹/구버전은 조용히 무시
        if (!eligible()) return;

        setTimeout(function () {
          // 요청 사실을 먼저 기록 — 실패해도 반복해서 조르지 않게
          localStorage.setItem(K_COUNT, String(num(K_COUNT) + 1));
          localStorage.setItem(K_LAST, String(Date.now()));
          Ad.requestReview();
        }, DELAY_MS);
      } catch (e) { /* 별점 요청이 게임을 망치면 안 된다 */ }
    }
  };

  global.Review = Review;
})(window);
