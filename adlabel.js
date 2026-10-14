/* ============================================================
 *  adlabel.js — 보상형 광고 단추에 '광고 보고' 붙이기 · 2026-10-14
 *
 *  왜. 성일님(10/12): "모르고 눌렀다가 광고가 뜨면 불쾌하다" → 광고가 나오는 단추는 전부 미리 알린다.
 *  · 앱(AdBridge 있음): 기존 TV 아이콘(assets/icons/ad_tv.webp) + "광고 보고 …"  — 이론 결과 화면과 같은 모양
 *  · 웹(광고 없음): '광고 보고' 없이 원래 말만
 *  이모지(📺)는 쓰지 않는다(앱 UI 이모지 금지 — 기존 아이콘 사용).
 *
 *  쓰는 법
 *   · 고정 단추: <button data-ad-label="+30초 더 받기">…</button> → 불러올 때 글자를 바꿔 준다
 *   · 글자를 자주 바꾸는 단추(시간 정지): el.innerHTML = AdLabel.html('시간 정지(5문제 시간제한 없음)', '⏸ ')
 *     (두 번째 인자는 웹에서만 앞에 붙일 글자)
 * ============================================================ */
(function (global) {
  'use strict';
  var ICON = '<img class="ad-ico" src="assets/icons/ad_tv.webp" alt="" aria-hidden="true">';
  function inApp() { return !!(global.AdBridge && typeof global.AdBridge.showRewarded === 'function'); }
  function html(text, webPrefix) { return inApp() ? ICON + '광고 보고 ' + text : (webPrefix || '') + text; }
  function apply(root) {
    (root || document).querySelectorAll('[data-ad-label]').forEach(function (el) {
      el.innerHTML = html(el.getAttribute('data-ad-label'), el.getAttribute('data-ad-web') || '');
    });
  }
  // 아이콘 크기는 글자에 맞춘다(단추마다 글자 크기가 달라서 em 단위)
  try {
    var st = document.createElement('style');
    st.textContent = '.ad-ico{width:1.3em;height:1.3em;vertical-align:-0.3em;margin-right:.3em;display:inline-block;object-fit:contain}';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(); });
  else apply();
  global.AdLabel = { html: html, apply: apply, inApp: inApp };
})(window);
