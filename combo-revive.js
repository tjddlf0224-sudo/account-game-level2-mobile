/* ============================================================
 *  combo-revive.js — 연속 정답 되살리기(보상형) · 2026-10-22
 *  전산회계 오락실
 *
 *  왜. 개발팀 제안 #6, 성일님 "연속 정답 되살리기 광고는 넣자".
 *  한국사 게임 juice.js offerRevive() 를 옮겼다 — 연속이 끊기는 '가장 아까운 순간'이라
 *  한국사 보상형 중 시청률이 가장 높다(권함 35 중 11, 약 31%). 전산회계 debit·factory 보상형은 2% 안팎.
 *
 *  규칙
 *   · 5연속 이상 쌓였다가 끊긴 순간에만, 6초 동안 작은 창. 그동안 게임은 그대로 흐른다(막지 않음).
 *   · 앱에서만(광고가 있는 곳). 웹엔 광고가 없어 창도 안 띄운다.
 *   · 보상형을 못 불러오면 막지 않고 그냥 되살린다 — 오프라인만 막는다(전 앱 공통 규칙).
 *   · 넣은 곳(성일님 10/22 선택): 산성비 · 조립공장 · 1급 분개의 탑. 차변대변은 '광고 보고 실수 지우기'가
 *     이미 콤보까지 되돌려 줘서 겹치므로 뺐다. 차근차근(STEP) 모드에선 부르지 않는다(게임 쪽에서 거른다).
 *   · 기록(DayLog 'ad', 자리 combo_<게임>): rw_offer / rw_skip(그냥 갈래요) / rw_expire(6초 지남) /
 *     rw_free(못 불러와 그냥 줌) / rw_offline. 시작·시청(rw_start/rw_earn)은 브리지가 __adPlace 로 남긴다.
 *
 *  게임은 이렇게 부른다:
 *    ComboRevive.offer(had, { place:'acid', pos:'bottom'|'top'|'low', isPlaying:()=>isPlaying,
 *      pause(){ isPaused=true; armResumeOnReturn(); },   // 광고를 띄울 때(게임의 기존 '광고 보는 동안 멈춤' 그대로)
 *      resume(){ ... },                                    // 광고가 안 뜨고 끝났을 때 바로 다시 돌리기
 *      restore(n){ combo=n; updateUI(); } });
 *  광고 콜백(onRewardGranted/onRewardedFailed)은 게임 것을 잠깐 바꿔 끼웠다가 돌려놓는다 —
 *  게임 것을 부르면 +15초·+30초가 같이 붙어 버리므로 부르지 않는다.
 * ============================================================ */
(function (global) {
  'use strict';
  var FROM = 5, MS = 6000;
  var open = null;

  function inApp() { return !!(global.AdBridge && typeof global.AdBridge.showRewarded === 'function'); }
  function hit(place, ev) { try { if (global.DayLog) DayLog.hit('ad', 'combo_' + place, ev); } catch (e) {} }

  function css() {
    if (document.getElementById('crv-style')) return;
    var s = document.createElement('style'); s.id = 'crv-style';
    s.textContent =
      '.crv{position:fixed;left:50%;bottom:calc(118px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9600;' +
      'width:min(330px,90vw);box-sizing:border-box;padding:12px 12px 10px;border-radius:16px;text-align:center;' +
      'background:rgba(16,22,40,.94);border:1px solid rgba(255,190,90,.45);box-shadow:0 10px 30px rgba(0,0,0,.45);' +
      'color:#fff4dc;font-family:"Noto Sans KR",sans-serif;animation:crvIn .22s cubic-bezier(.2,1.3,.4,1);' +
      '-webkit-user-select:none;user-select:none}' +
      '@keyframes crvIn{from{transform:translate(-50%,16px);opacity:0}to{transform:translateX(-50%);opacity:1}}' +
      /* 게임마다 비어 있는 자리가 다르다 — 답 단추를 가리면 6초 동안 못 푼다(10/22 캡처에서 조립공장·분개의 탑이 가렸음) */
      '.crv.top{bottom:auto;top:calc(104px + env(safe-area-inset-top))}' +
      '.crv.low{bottom:calc(178px + env(safe-area-inset-bottom))}' +   /* 분개의 탑: 차변·대변 단추 바로 위(문제·풀이 카드를 안 가림) */
      '.crv b{display:block;font-size:1rem;font-weight:800;margin-bottom:9px;color:#ffd27a}' +
      '.crv .row{display:flex;gap:8px}' +
      '.crv button{flex:1 1 0;min-width:0;min-height:42px;border-radius:11px;font:700 .86rem/1.15 inherit;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;padding:6px 8px}' +
      '.crv .go{flex:1.6 1 0;border:0;background:linear-gradient(135deg,#ffb347,#f0782a);color:#2a1204}' +
      '.crv .no{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:#d7dcea}' +
      '.crv .ad-ico{width:1.3em;height:1.3em;margin-right:.3em;object-fit:contain}' +
      '.crv .bar{height:3px;border-radius:2px;background:rgba(255,255,255,.12);margin-top:9px;overflow:hidden}' +
      '.crv .bar i{display:block;height:100%;background:#ffb347;transform-origin:left;animation:crvBar ' + MS + 'ms linear forwards}' +
      '@keyframes crvBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}' +
      '@media (prefers-reduced-motion:reduce){.crv{animation:none}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function close() {
    if (!open) return;
    clearTimeout(open.timer);
    if (open.el && open.el.parentNode) open.el.parentNode.removeChild(open.el);
    open = null;
  }

  /* 광고 보고 되살리기 */
  function watch(had, o) {
    var Ad = global.AdBridge;
    var playing = function () { try { return !o.isPlaying || o.isPlaying(); } catch (e) { return true; } };
    function give(free) {
      if (free) hit(o.place, 'rw_free');
      if (playing()) { try { o.restore(had); } catch (e) {} }
    }
    // 광고를 못 불러왔으면 기다리게 하지 않고 바로 — 오프라인만 막는다
    if (typeof Ad.isRewardedReady === 'function' && !Ad.isRewardedReady()) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        hit(o.place, 'rw_offline');
        if (global.Ask) Ask.alert('인터넷에 연결된 뒤 다시 시도해 주세요.');
        return;
      }
      give(true);
      return;
    }
    var prevOk = global.onRewardGranted, prevNo = global.onRewardedFailed, settled = false;
    function restoreHandlers() { global.onRewardGranted = prevOk; global.onRewardedFailed = prevNo; }
    global.onRewardGranted = function () {
      if (settled) return; settled = true; restoreHandlers();
      give(false);   // 재개는 게임이 광고 닫힘(focus·visibility)으로 한다 — pause() 에서 건 그대로
    };
    global.onRewardedFailed = function () {
      if (settled) return; settled = true; restoreHandlers();
      // 광고가 아예 안 떴다 → 복귀 신호가 안 오니 바로 다시 돌린다
      try { o.resume && o.resume(); } catch (e) {}
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        hit(o.place, 'rw_offline');
        if (global.Ask) Ask.alert('인터넷에 연결된 뒤 다시 시도해 주세요.');
        return;
      }
      give(true);
    };
    try { o.pause && o.pause(); } catch (e) {}
    global.__adPlace = 'combo_' + o.place;
    try { Ad.showRewarded(); } finally { global.__adPlace = null; }
  }

  /* had 연속이 방금 끊겼다 */
  function offer(had, o) {
    if (!o || !o.place || !(had >= FROM) || !inApp()) return false;
    try { if (global.AdBridge.isAdsRemoved && global.AdBridge.isAdsRemoved()) return false; } catch (e) {}
    close();
    css();
    var el = document.createElement('div');
    el.className = 'crv' + (o.pos === 'top' || o.pos === 'low' ? ' ' + o.pos : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '연속 정답 되살리기');
    var label = global.AdLabel ? AdLabel.html('되살리기') : '광고 보고 되살리기';
    el.innerHTML = '<b>' + had + '연속이 끊겼어요</b>' +
      '<div class="row"><button type="button" class="go">' + label + '</button>' +
      '<button type="button" class="no">그냥 갈래요</button></div>' +
      '<div class="bar"><i></i></div>';
    document.body.appendChild(el);
    open = { el: el, timer: setTimeout(function () { hit(o.place, 'rw_expire'); close(); }, MS) };
    hit(o.place, 'rw_offer');
    // 화면 터치가 게임 판정으로 새지 않게 이 창 안에서 끝낸다
    ['pointerdown', 'touchstart', 'mousedown', 'click'].forEach(function (t) {
      el.addEventListener(t, function (e) { e.stopPropagation(); }, false);
    });
    el.querySelector('.no').addEventListener('click', function () { hit(o.place, 'rw_skip'); close(); });
    el.querySelector('.go').addEventListener('click', function () { close(); watch(had, o); });
    return true;
  }

  global.ComboRevive = { offer: offer, close: close, FROM: FROM, MS: MS };
})(window);
