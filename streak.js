/* ============================================================
 *  streak.js — 연속 학습(스트릭)
 *  전산회계 오락실
 *
 *  왜. 시험 대비 앱은 매일 오는 것이 전부인데 이 앱엔 다시 올 이유가 없었다.
 *  한국사 게임의 streak.js 를 이 앱 구조에 맞게 옮겼다(그 프로젝트 SESSION_LOG 4번).
 *
 *  ── 지킨 것 ────────────────────────────────────────────────
 *  1. **허브만 열어도 안 늘어난다.** 실제로 한 판을 끝냈을 때만 찍힌다.
 *     연결 지점은 `Growth.record()` 하나다 — 게임·스테이지·이론 12개 파일이
 *     라운드를 끝낼 때 이걸 부르므로, 그 파일들을 하나도 안 고쳐도 된다.
 *  2. **한국시간으로 센다.** growth.js 가 UTC 로 날짜를 재는 바람에 자정~오전 9시
 *     접속이 '어제'로 기록되던 버그가 있었다(2026-09-01에 고침). 같은 실수를
 *     반복하지 않으려고 여기서도 KST 로 맞춘다.
 *  3. **학습을 막지 않는다.** 스트릭이 끊겨도 잠기는 것은 아무것도 없다.
 *  4. **광고는 끊긴 순간에만 한 번 뜬다.**
 *     처음엔 "광고 보고 보충권 받기"를 항상 띄웠다가 뺐다 — 스트릭이 살아 있는데
 *     보충권을 파는 것은 **"어제 안 했지"를 상기시킨 뒤 파는 것**이라, 학습을 못 한
 *     죄책감을 수익화하는 구조가 된다. 게다가 허브에 상시 노출됐다.
 *     지금은 **실제로 끊긴 그날에만** 되살리기를 제안한다. 이건 게임5의 부활과
 *     같은 자리다 — "지금 되돌리고 싶다"는 순간이라 결이 다르다.
 *     · 3일 미만이 끊긴 것은 제안하지 않는다(아까울 것이 없다).
 *     · 끊긴 그날(한국시간)이 지나면 사라진다. 상시 상점이 되면 안 되므로.
 *  5. 7일 연속마다 보충권 1개를 그냥 준다(최대 2개) — 광고와 무관한 별개 장치.
 *
 *  window.Streak 로 노출.
 * ============================================================ */
(function (global) {
  'use strict';

  var K_DAYS = 'streak_days', K_LAST = 'streak_last',
      K_BEST = 'streak_best', K_FREEZE = 'streak_freeze',
      K_LOST = 'streak_lost', K_LOST_AT = 'streak_lost_at';
  var REVIVE_MIN = 3;        // 이만큼은 쌓였어야 되살리기를 제안한다

  /* 한국시간 기준 YYYY-MM-DD. growth.js todayStr() 과 같은 방식으로 맞춘다. */
  function today() {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }
  function dayNum(s) {                       // YYYY-MM-DD → 일 단위 정수
    if (!s) return null;
    var p = s.split('-');
    return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }
  function num(k, d) {
    try { var v = parseInt(localStorage.getItem(k), 10); return isNaN(v) ? d : v; }
    catch (e) { return d; }
  }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function state() {
    var t = today();
    var last = null;
    try { last = localStorage.getItem(K_LAST); } catch (e) {}
    var days = num(K_DAYS, 0);
    var gap = (last && dayNum(last) != null) ? dayNum(t) - dayNum(last) : null;
    // 오늘 아직 안 했고, 하루라도 비면 끊긴다 → 위험 표시
    var lostAt = null;
    try { lostAt = localStorage.getItem(K_LOST_AT); } catch (e) {}
    var lost = num(K_LOST, 0);
    return {
      days: days,
      best: num(K_BEST, 0),
      freeze: num(K_FREEZE, 0),
      last: last,
      doneToday: gap === 0,
      atRisk: days > 0 && gap !== 0,
      lost: lost,
      // 끊긴 그날에만 되살릴 수 있다. 하루가 지나면 그 기록은 없던 것이 된다.
      canRevive: lost >= REVIVE_MIN && lostAt === t
    };
  }

  /* 한 판을 끝냈을 때만 부른다. 돌려주는 값: {changed, days, gained, usedFreeze} */
  function checkIn() {
    var s = state(), t = today(), d = dayNum(t), ld = dayNum(s.last);
    if (ld === d) return { changed: false, days: s.days };   // 오늘 이미 찍음

    var days, usedFreeze = false;
    if (ld == null || s.days === 0) {
      days = 1;
    } else if (d - ld === 1) {
      days = s.days + 1;                                     // 어제 하고 오늘 함
    } else if (d - ld === 2 && s.freeze > 0) {
      // 딱 하루 빠진 것만 보충권으로 메운다. 이틀 이상은 메우지 않는다 —
      // 오래 안 온 것을 없던 일로 해 주면 매일 오는 의미가 사라진다.
      days = s.days + 1; usedFreeze = true;
      put(K_FREEZE, s.freeze - 1);
    } else {
      days = 1;                                              // 끊겼다
      // 끊긴 그날에만 되살리기를 제안하려고 남겨 둔다. 짧은 것은 남기지 않는다.
      if (s.days >= REVIVE_MIN) { put(K_LOST, s.days); put(K_LOST_AT, t); }
    }
    put(K_DAYS, days); put(K_LAST, t);
    if (days > s.best) put(K_BEST, days);
    // 7일 연속마다 보충권 하나. 쌓아 두고 오래 쉬는 데 쓰이지 않게 2개까지만 보관한다.
    var gotFreeze = false;
    if (days > 0 && days % 7 === 0) {
      var fz = num(K_FREEZE, 0);
      if (fz < 2) { put(K_FREEZE, fz + 1); gotFreeze = true; }
    }
    return { changed: true, days: days, gained: days - s.days,
             usedFreeze: usedFreeze, gotFreeze: gotFreeze };
  }

  /* ── 되살리기 ───────────────────────────────────────────────
     끊긴 그날에만 부를 수 있다. 광고 SDK 가 없는 환경(웹 배포판)에서는 이 앱의
     기존 관례대로(index.html 스테이지 해금과 같다) 그냥 되살려 준다 — 대신
     단추 문구에서 '광고'를 빼서 없는 광고를 본 것처럼 말하지 않는다. */
  function adsAvailable() {
    var Ad = global.AdBridge;
    return !!(Ad && typeof Ad.showRewarded === 'function');
  }

  function grantRevive() {
    var s = state();
    if (!s.canRevive) return false;
    var days = s.lost + 1;            // 끊기기 전 기록 + 오늘 한 판
    put(K_DAYS, days);
    put(K_LAST, today());
    if (days > num(K_BEST, 0)) put(K_BEST, days);
    try { localStorage.removeItem(K_LOST); localStorage.removeItem(K_LOST_AT); } catch (e) {}
    render();
    return true;
  }

  function revive(done) {
    if (!state().canRevive) { if (done) done(false); return; }
    if (!adsAvailable()) { if (done) done(grantRevive()); return; }

    var Ad = global.AdBridge;
    if (typeof Ad.isRewardedReady === 'function' && !Ad.isRewardedReady()) {
      if (global.Ask) Ask.alert('광고를 불러오는 중이에요. 잠시 후 다시 눌러주세요.');
      if (done) done(false);
      return;
    }
    // 보상형 콜백이 전역 함수 이름이라, 이미 걸려 있던 것을 지우지 않게 체이닝한다.
    // 이벤트와 Promise 가 둘 다 올 수 있어 한 번만 처리되도록 settled 로 잠근다.
    var prevOk = global.onRewardGranted, prevNo = global.onRewardedFailed, settled = false;
    function restore() { global.onRewardGranted = prevOk; global.onRewardedFailed = prevNo; }
    global.onRewardGranted = function () {
      if (typeof prevOk === 'function') { try { prevOk.apply(this, arguments); } catch (e) {} }
      if (settled) return; settled = true;
      restore();
      if (done) done(grantRevive());
    };
    global.onRewardedFailed = function () {
      if (typeof prevNo === 'function') { try { prevNo.apply(this, arguments); } catch (e) {} }
      if (settled) return; settled = true;
      restore();
      if (global.Ask) Ask.alert('광고를 불러올 수 없어요. 잠시 후 다시 시도해주세요.');
      if (done) done(false);
    };
    Ad.showRewarded();
  }

  /* ── 도장 아이콘(붉은 인장) ─────────────────────────────────
     회계 실무에서 매일 찍는 결재 도장. 이 앱 정체성에 맞고 파일이 안 든다. */
  var SEAL = '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">' +
    '<rect x="3.5" y="3.5" width="17" height="17" rx="3.2" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M8 12.4l2.6 2.6L16 9.6" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var STYLE_ID = 'streak-style';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.stk-pill{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;',
      'border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);',
      'color:#ffd6d0;font:700 .82rem/1 "Noto Sans KR",sans-serif;cursor:pointer;}',
      '.stk-pill .ic{width:16px;height:16px;color:#ff5a4e;display:block;}',
      '.stk-pill.risk{animation:stkPulse 1.6s ease-in-out infinite;}',
      '@keyframes stkPulse{0%,100%{opacity:1}50%{opacity:.5}}',
      '@media (prefers-reduced-motion:reduce){.stk-pill.risk{animation:none}}',
      '.stk-ov{position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;',
      'background:rgba(5,3,16,.78);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);}',
      '.stk-box{width:min(400px,86%);max-height:88%;overflow:auto;background:#161a28;color:#eef1f7;',
      'border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:20px 20px 16px;text-align:center;',
      'font-family:"Noto Sans KR",sans-serif;}',
      '.stk-seal{width:50px;height:50px;margin:0 auto 8px;color:#ff5a4e;}',
      '.stk-n{font-size:2.2rem;font-weight:800;line-height:1;color:#fff;}',
      '.stk-n small{font-size:1rem;font-weight:700;margin-left:4px;color:#c7ccd8;}',
      '.stk-sub{margin-top:7px;font-size:.84rem;color:#aeb4c4;line-height:1.5;}',
      '.stk-stat{display:flex;gap:10px;margin:14px 0 12px;}',
      '.stk-stat div{flex:1 1 0;min-width:0;background:rgba(255,255,255,.05);border-radius:12px;padding:8px 6px;}',
      '.stk-stat b{display:block;font-size:1.1rem;color:#fff;}',
      '.stk-stat span{font-size:.72rem;color:#98a0b3;}',
      '.stk-note{font-size:.74rem;color:#8d94a6;line-height:1.6;margin:-4px 0 14px;}',
      '.stk-lost{font-size:.8rem;color:#ffd6d0;line-height:1.5;margin:-2px 0 12px;',
      'background:rgba(255,90,78,.12);border:1px solid rgba(255,90,78,.3);',
      'border-radius:11px;padding:9px 12px;}',
      '.stk-row{display:flex;gap:10px;}',
      '.stk-row button{flex:1 1 0;min-width:0;padding:12px 0;border-radius:11px;font:700 .9rem/1 inherit;',
      'cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);color:#eef1f7;}',
      '.stk-row button.primary{background:linear-gradient(135deg,#00c2d6,#0090c8);border-color:transparent;color:#04121a;}'
    ].join('');
    document.head.appendChild(s);
  }

  function render() {
    var pill = document.getElementById('streak-pill');
    if (!pill) return;
    var s = state();
    if (s.days <= 0) { pill.style.display = 'none'; return; }   // 0일이면 숨긴다
    pill.style.display = '';
    pill.className = 'stk-pill' + (s.canRevive ? ' risk' : (s.atRisk ? ' risk' : ''));
    pill.innerHTML = '<span class="ic">' + SEAL + '</span>' + s.days + '일';
    pill.title = s.canRevive ? s.lost + '일 연속이 끊겼어요 — 오늘 안에 되살릴 수 있습니다'
               : s.atRisk ? '오늘 아직 안 했어요' : '오늘 출석 완료';
  }

  function openModal() {
    ensureStyle();
    var s = state();
    var ov = document.createElement('div');
    ov.className = 'stk-ov';
    ov.innerHTML =
      '<div class="stk-box">' +
        '<div class="stk-seal">' + SEAL + '</div>' +
        '<div class="stk-n">' + s.days + '<small>일 연속</small></div>' +
        '<div class="stk-sub">' + (s.doneToday
            ? '오늘 도장을 찍었어요. 내일도 이어가세요.'
            : '오늘은 아직이에요. 한 판만 끝내면 이어집니다.') + '</div>' +
        '<div class="stk-stat">' +
          '<div><b>' + s.best + '</b><span>최고 기록</span></div>' +
          '<div><b>' + s.freeze + '</b><span>보충권</span></div>' +
        '</div>' +
        (s.canRevive
          ? '<div class="stk-lost">' + s.lost + '일 연속이 끊겼어요.<br>' +
            '오늘 안에 되살릴 수 있습니다.</div>' +
            '<div class="stk-row">' +
              '<button id="stk-close">닫기</button>' +
              '<button id="stk-revive" class="primary">' +
                (adsAvailable() ? '광고 보고 되살리기' : '되살리기') + '</button>' +
            '</div>'
          : '<div class="stk-note">7일 연속마다 보충권이 하나 생깁니다. ' +
            '보충권이 있으면 하루를 빠뜨려도 이어집니다.</div>' +
            '<div class="stk-row">' +
              '<button id="stk-close" class="primary">닫기</button>' +
            '</div>') +
      '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    document.body.appendChild(ov);
    ov.querySelector('#stk-close').addEventListener('click', close);
    var rv = ov.querySelector('#stk-revive');
    if (rv) rv.addEventListener('click', function () {
      revive(function (ok) { if (ok) { close(); openModal(); } });
    });
  }

  /* 허브에 알약을 심는다. 붙일 자리가 없는 페이지에서는 조용히 아무것도 안 한다. */
  function mountPill(host) {
    host = (typeof host === 'string') ? document.querySelector(host) : host;
    if (!host || document.getElementById('streak-pill')) return;
    ensureStyle();
    var b = document.createElement('button');
    b.id = 'streak-pill';
    b.type = 'button';
    b.className = 'stk-pill';
    b.addEventListener('click', openModal);
    host.appendChild(b);
    render();
  }

  /* ── Growth.record 를 감싸 체크인 지점을 만든다 ──────────────
     게임·스테이지·이론 12개 파일을 하나도 안 고친다. growth.js 가 먼저 로드되지
     않았을 수도 있으니 잠깐 기다렸다 붙인다. */
  function hook() {
    var G = global.Growth;
    if (!G || typeof G.record !== 'function' || G.__streakHooked) return !!(G && G.__streakHooked);
    var orig = G.record;
    G.record = function () {
      try { checkIn(); render(); } catch (e) {}
      return orig.apply(this, arguments);
    };
    G.__streakHooked = true;
    return true;
  }
  if (!hook()) {
    var tries = 0;
    var t = setInterval(function () { if (hook() || ++tries > 40) clearInterval(t); }, 50);
  }

  global.Streak = {
    state: state, checkIn: checkIn, render: render,
    mountPill: mountPill, open: openModal, revive: revive
  };
})(window);
