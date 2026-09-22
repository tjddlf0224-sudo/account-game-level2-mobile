/* ============================================================
 * adsense.js — 웹(GitHub Pages)에서만 AdSense 배너를 띄운다.
 *
 * ⚠ 네이티브 앱(iOS/Android WebView) 안에서는 아무것도 안 한다(로더조차 안 넣음).
 *   앱은 AdMob 을 쓰고(capacitor-bridge.js), WebView 안의 AdSense 는 정책 위반이다.
 *
 * 광고 자리는 두 종류다.
 *   1) 콘텐츠 화면에 직접 심어 둔 자리 — 허브·오답노트 목록·이론 주제선택
 *      (<div class="ad-slot" data-adsense> … <ins class="adsbygoogle"> …)
 *   2) 게임 시작·결과 화면 — 아래 SCREENS 표의 컨테이너 **안쪽 맨 아래**에 이 스크립트가 넣는다.
 *      이 컨테이너들은 게임을 하는 동안 숨겨지므로 "플레이 중엔 광고 없음"이 저절로 지켜진다
 *      (2026-09-22 사용자: "기존 게임 앱처럼, 게임플레이 중에는 안 나오게").
 *      ⚠ 앱처럼 화면 아래 **고정** 배너는 AdSense 정책상 모바일 금지라(수동 고정 광고는 PC 사이드바·
 *        폭 300px 이하만) 흐름 안에 넣는 일반 배너로 한다.
 *      결과 화면이 innerHTML 로 통째로 다시 그려져도 MutationObserver 가 자리를 다시 넣는다.
 *
 * 광고 요청은 **자리가 실제로 보일 때(폭>0)만** 한다 — 숨은 컨테이너 안에서 push 하면
 * "availableWidth=0" 으로 영영 안 채워진다. 채워지지 않은 자리(미승인·노필)는 라벨까지 숨긴다
 * (2026-09-22: 미승인인데 허브 하단에 "광고 ." 라벨만 떠 있었다).
 * ============================================================ */
(function (global) {
  'use strict';

  var CLIENT = 'ca-pub-7418287954060066';
  var SLOT = '2076355142';   // 디스플레이 반응형 "전산회계오락실_콘텐츠화면_반응형"

  // 게임 시작·결과 화면 — 게임 진행 화면(보드·HUD)은 절대 넣지 않는다
  var SCREENS = {
    'game1_acid.html':     ['#start-screen', '#result-screen'],
    'game2_memory.html':   ['#start-screen', '#result-screen'],
    'game3_debit.html':    ['#start-screen', '#result-screen'],
    'game4_factory.html':  ['#start-screen', '#result-screen'],
    'game5_flight.html':   ['#ss', '#gs'],
    'stage1_cost.html':    ['#result-panel'],
    'stage3_capital.html': ['#screen-start', '#screen-ending'],
    'stage4_voucher.html': ['#home', '#result'],
    'stage5_vat.html':     ['#home', '#result'],
    'stage6_alloc.html':   ['#home', '#result'],
    'theory.html':         ['#result'],
    'theory_lv1.html':     ['#result']
  };

  function isNative() {
    try {
      var C = global.Capacitor;
      return !!(C && C.isNativePlatform && C.isNativePlatform());
    } catch (e) { return false; }
  }

  function css() {
    if (document.getElementById('am-adsense-css')) return;
    var s = document.createElement('style');
    s.id = 'am-adsense-css';
    s.textContent =
      '.ad-slot.am-auto{margin:22px auto 6px;max-width:728px;width:100%;text-align:center;flex:0 0 auto}' +
      '.ad-slot .ad-slot-label{display:none;font-size:.68rem;color:rgba(255,255,255,.35);margin-bottom:4px;letter-spacing:.05em}' +
      '.ad-slot.am-filled .ad-slot-label{display:block}' +
      'ins.adsbygoogle[data-ad-status="unfilled"]{display:none!important}';
    document.head.appendChild(s);
  }

  function makeSlot() {
    var d = document.createElement('div');
    d.className = 'ad-slot am-auto';
    d.setAttribute('data-adsense', '');
    d.innerHTML = '<div class="ad-slot-label">광고</div>' +
      '<ins class="adsbygoogle" style="display:block" data-ad-client="' + CLIENT + '" data-ad-slot="' + SLOT + '"' +
      ' data-ad-format="horizontal" data-full-width-responsive="true"></ins>';
    return d;
  }

  var loaderAdded = false;
  function addLoader() {
    if (loaderAdded) return;
    loaderAdded = true;
    var s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + CLIENT;
    document.head.appendChild(s);
  }

  function realSlot(ins) {
    var id = ins && ins.getAttribute('data-ad-slot');
    return !!id && id.indexOf('_') === -1;   // __ADSENSE_SLOT_ID__ 같은 자리표시자는 건너뛴다
  }

  // 채워졌는지(data-ad-status) 보고 라벨을 켠다
  function watchStatus(slot, ins) {
    if (typeof MutationObserver === 'undefined') return;
    var mo = new MutationObserver(function () {
      var st = ins.getAttribute('data-ad-status');
      if (st === 'filled') slot.classList.add('am-filled');
      else if (st === 'unfilled') slot.classList.remove('am-filled');
    });
    mo.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
  }

  // 보일 때(폭>0) 딱 한 번 push
  function arm(slot) {
    var ins = slot.querySelector('ins.adsbygoogle');
    if (!ins || ins.__amArmed || !realSlot(ins)) return;
    ins.__amArmed = true;
    slot.style.display = '';
    watchStatus(slot, ins);
    function tryPush() {
      if (ins.__amPushed || ins.offsetWidth <= 0) return false;
      ins.__amPushed = true;
      addLoader();
      try { (global.adsbygoogle = global.adsbygoogle || []).push({}); } catch (e) {}
      return true;
    }
    if (tryPush()) return;
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () { if (tryPush()) ro.disconnect(); });
      ro.observe(ins);
    }
  }

  function ensureIn(container) {
    if (!container) return;
    var last = container.lastElementChild;
    if (!(last && last.classList && last.classList.contains('am-auto'))) {
      var old = container.querySelector(':scope > .ad-slot.am-auto');
      if (old) old.remove();
      container.appendChild(makeSlot());
    }
    arm(container.lastElementChild);
  }

  function init() {
    if (isNative()) return;
    css();
    var list = document.querySelectorAll('.ad-slot[data-adsense]');
    for (var i = 0; i < list.length; i++) arm(list[i]);

    var page = location.pathname.split('/').pop() || 'index.html';
    (SCREENS[page] || []).forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      ensureIn(el);
      if (typeof MutationObserver !== 'undefined') {
        // 결과 화면을 innerHTML 로 다시 그리면 자리가 지워진다 → 다시 넣는다
        new MutationObserver(function () { ensureIn(el); }).observe(el, { childList: true });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
