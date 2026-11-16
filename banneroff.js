/* ============================================================
 *  banneroff.js — 광고 보고 하단 배너 끄기 (2026-11-06 성일님 승인, 팀장 전달)
 *  전산회계 오락실
 *
 *  보상형 광고 1편을 끝까지 보면 하단 배너를 24시간 숨긴다(성일님 "하루 정도"). 전면·보상형 등 다른 광고는 그대로.
 *  · 끝나는 시각은 capacitor-bridge.js 가 localStorage(am_banner_off_until)에 두고 지킨다 — 재실행·복귀·다른 화면도.
 *  · 단추 자리: 허브(index·index_lv1) ⚙️ 설정 안에만(11/6 성일님 "메인 화면에 광고보고~ 이건 없애자. 설정에서만." — 닉네임 줄 단추는 뺐다).
 *    배너 바로 위·옆에는 두지 않는다(AdMob 실수 클릭 정책).
 *  · 광고를 못 불러오면 막지 않고 그냥 24시간 끈다(오프라인만 막음 — 한국사 1.0 심사 거절 2.1(a) 규칙).
 *  · 광고 기록 자리는 'banner_off'(DayLog ad 하루 합계 — rw_start/earn/close/fail/offline, 못 불러와 그냥 끈 것은 rw_free).
 *  · 앱에서만 보인다(웹에는 배너가 없다). 글자 단추만 — 이모지·그린 아이콘 없음.
 * ============================================================ */
(function (global) {
  'use strict';
  var PLACE = 'banner_off';
  var pending = false, hooked = false, guard = null;

  function bridge() {
    var B = global.AdBridge;
    if (!B || typeof B.bannerOffLeft !== 'function' || typeof B.showRewarded !== 'function') return null;
    try { if (B.isAdsRemoved && B.isAdsRemoved()) return null; } catch (e) {}
    return B;
  }
  function left() { var B = bridge(); try { return B ? B.bannerOffLeft() : 0; } catch (e) { return 0; } }
  function leftText(ms) {
    var h = Math.floor(ms / 3600000);
    if (h >= 1) return h + '시간 남음';
    return Math.max(1, Math.ceil(ms / 60000)) + '분 남음';
  }
  function hit(ev) { try { if (global.DayLog) global.DayLog.hit('ad', PLACE, ev); } catch (e) {} }
  function say(msg) { try { if (global.Ask) global.Ask.alert(msg, { face: 'fire' }); } catch (e) {} }

  function finish(viaAd) {
    if (!pending) return;
    pending = false;
    if (guard) { clearTimeout(guard); guard = null; }
    if (!viaAd) hit('rw_free');
    var B = bridge(); if (B) { try { B.bannerOffStart(); } catch (e) {} }
    paintAll();
    say('24시간 동안 배너가 사라져요');
  }

  /* 화면의 onRewardGranted/onRewardedFailed(허브의 '광고 보고 스테이지 열기')는 그대로 살리고, 이 단추로 띄운 광고만 가로챈다 */
  function hook() {
    if (hooked) return; hooked = true;
    var g = global.onRewardGranted, f = global.onRewardedFailed;
    global.onRewardGranted = function () { if (pending) return finish(true); if (typeof g === 'function') return g.apply(this, arguments); };
    global.onRewardedFailed = function () { if (pending) return finish(false); if (typeof f === 'function') return f.apply(this, arguments); };
    /* 중간에 닫음 → 배너 그대로(끄지 않음), 단추만 바로 다시 쓸 수 있게. 보상 신호가 닫힘보다 살짝 늦게 와도 받도록 0.8초 기다린다 */
    var c = global.onRewardedClosed, sf = global.onRewardedShowFailed;
    global.onRewardedClosed = function () {
      if (pending) { setTimeout(function () { if (pending) { pending = false; if (guard) { clearTimeout(guard); guard = null; } paintAll(); } }, 800); return; }
      if (typeof c === 'function') return c.apply(this, arguments);
    };
    /* 띄우다 실패(화면에 못 나옴) → 광고 실패와 같이 그냥 끈다 */
    global.onRewardedShowFailed = function () { if (pending) return finish(false); if (typeof sf === 'function') return sf.apply(this, arguments); };
  }

  function watch() {
    var B = bridge();
    if (!B || pending || left() > 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      try { if (global.Ask) global.Ask.alert('인터넷에 연결된 뒤 다시 눌러주세요.'); } catch (e) {}
      return;
    }
    hook();
    pending = true;
    guard = setTimeout(function () { pending = false; guard = null; }, 180000);   // 신호가 끝내 안 오면 단추만 다시 살린다
    /* 광고 준비 기다리기(11/6 성일님 승인 "그렇게 고쳐" — 상담 S9 재현): 닫자마자 다시 누르면 다음 광고가 아직 받는 중이라
       예전(5초 기다린 뒤 showRewarded → 못 띄움 → 그냥 끔)엔 광고 없이 24시간 꺼졌다.
       이제 받는 중이면 "광고를 불러오는 중이에요"를 띄우고 최대 8초 기다렸다 보여 준다.
       그냥 끄는 것(rw_free)은 셋뿐: ① 실제로 받아 오기 실패 ② 8초 지나도 준비 안 됨 ③ SDK 시작 전. (다른 보상형 자리는 그대로) */
    var t0 = Date.now(), shown = false;
    function stateOf() {
      try { if (B.isRewardedReady && B.isRewardedReady()) return 'ready'; } catch (e) {}   // isRewardedReady 는 준비 안 됐으면 다시 받기도 시작한다
      try { return typeof B.rewardedState === 'function' ? B.rewardedState() : 'loading'; } catch (e) { return 'loading'; }
    }
    function free(why) { try { window.__amRwWhy = why; } catch (e) {} hideToast(); finish(false); }   // 기록은 finish 의 rw_free 하나 + daylog 가 까닭 줄(rw_free_<why>)을 따로(합계는 안 갈림, 11/15)
    (function wait() {
      if (!pending) { hideToast(); return; }
      var s = stateOf();
      if (s === 'ready') {
        hideToast();
        global.__adPlace = PLACE;
        try { B.showRewarded(); } catch (e) { finish(false); } finally { global.__adPlace = null; }
        return;
      }
      if (s === 'init') return free('init');
      if (s === 'failed') return free('fail');
      if (Date.now() - t0 >= 8000) return free('timeout');
      if (!shown) { shown = true; showToast('광고를 불러오는 중이에요'); }
      setTimeout(wait, 250);
    })();
  }

  /* 짧은 안내(누르는 것 없음) — 화면 위쪽, 배너와 먼 자리 */
  var toastEl = null;
  function showToast(t) {
    try {
      if (!toastEl) {
        toastEl = document.createElement('div'); toastEl.id = 'bo-toast'; toastEl.setAttribute('role', 'status');
        toastEl.style.cssText = 'position:fixed;left:50%;top:calc(96px + env(safe-area-inset-top));transform:translateX(-50%);z-index:99998;pointer-events:none;' +
          'padding:10px 18px;border-radius:999px;background:rgba(27,31,46,.96);border:1px solid rgba(255,255,255,.14);color:#eef1f7;font-size:.9rem;font-weight:600;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.45);';
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = t; toastEl.style.display = '';
    } catch (e) {}
  }
  function hideToast() { try { if (toastEl) toastEl.style.display = 'none'; } catch (e) {} }

  /* ── 그리기 ── */
  var STYLE = [
    '.set-item .bo-sub{display:block;font-size:0.68rem;font-weight:400;color:rgba(255,255,255,0.45);margin-top:2px;}',
    '#bo-set.off{cursor:default;}'
  ].join('');
  var NOTE = '광고 1편 · 24시간 동안 하단 배너 없음';
  var painters = [];
  function paintAll() { painters.forEach(function (p) { try { p(); } catch (e) {} }); }

  function mountSetting() {
    var anchor = document.getElementById('remind-btn') || document.getElementById('hub-mute-btn');
    if (!anchor || document.getElementById('bo-set')) return;
    var b = document.createElement('button');
    b.className = 'set-item'; b.id = 'bo-set';
    b.innerHTML = '<span class="set-ico"></span><span class="set-label"><span class="bo-main"></span><span class="bo-sub"></span></span>';
    b.addEventListener('click', function () {
      if (left() > 0) return;
      try { if (typeof global.closeSettings === 'function') global.closeSettings(); } catch (e) {}
      watch();
    });
    anchor.parentNode.insertBefore(b, anchor.nextSibling);
    painters.push(function () {
      var ms = left();
      b.classList.toggle('off', ms > 0); b.classList.toggle('muted', ms > 0);
      b.querySelector('.bo-main').textContent = ms > 0 ? '배너 꺼짐 · ' + leftText(ms) : '광고 보고 배너 끄기';
      b.querySelector('.bo-sub').textContent = ms > 0 ? '' : NOTE;
      b.querySelector('.bo-sub').style.display = ms > 0 ? 'none' : '';
    });
  }

  function mount() {
    if (!bridge()) return;   // 웹·광고 없는 판이면 아무것도 안 붙인다
    if (!document.getElementById('bo-style')) {
      var s = document.createElement('style'); s.id = 'bo-style'; s.textContent = STYLE; document.head.appendChild(s);
    }
    setTimeout(mountSetting, 0);   // remind.js 가 '저녁 알림' 줄을 먼저 붙이면 그 아래로
    setTimeout(paintAll, 0);
    paintAll();
    setInterval(function () { if (document.visibilityState === 'visible') paintAll(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') paintAll(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  global.BannerOff = { left: left, watch: watch, leftText: leftText };
})(window);
