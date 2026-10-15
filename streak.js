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
 *     · 길이와 무관하게 제안한다 — 이제 막 시작한 사람일수록 한 번 끊기면
 *       그대로 그만두기 쉽다.
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
  // 끊기기만 하면 길이와 무관하게 제안한다(1일짜리도). 처음엔 3일 이상만
  // 제안했는데, 이제 막 시작한 사람일수록 한 번 끊기면 그대로 그만두기 쉽다.
  var REVIVE_MIN = 1;

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
      // 끊긴 그날에만 되살리기를 제안하려고 남겨 둔다.
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
      /* 광고를 못 불러왔으면 막지 않고 그냥 되살린다 — 오프라인일 때만 막는다(전 앱 규칙, 2026-10-15 이 자리도 맞춤.
         예전엔 '불러오는 중' 안내 후 그대로 막았다) */
      if (global.DayLog) DayLog.hit('ad', 'streak', 'rw_notready');
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (global.Ask) Ask.alert('인터넷에 연결된 뒤 다시 시도해 주세요.');
        if (done) done(false);
        return;
      }
      if (global.DayLog) DayLog.hit('ad', 'streak', 'rw_free');
      if (done) done(grantRevive());
      return;
    }
    // 보상형 콜백이 전역 함수 이름이라, 이미 걸려 있던 것을 지우지 않게 체이닝한다.
    // 이벤트와 Promise 가 둘 다 올 수 있어 한 번만 처리되도록 settled 로 잠근다.
    var prevOk = global.onRewardGranted, prevNo = global.onRewardedFailed, settled = false;
    function restore() { global.onRewardGranted = prevOk; global.onRewardedFailed = prevNo; global.__adPlace = null; }
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
      /* 보상형을 못 불러오면 막지 않고 그냥 되살린다 — 오프라인일 때만 막는다(전 앱 공통 규칙,
         한국사 1.0 심사 거절 2.1(a) 원인, 2026-10-09 이 자리에도 맞춤) */
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (global.Ask) Ask.alert('인터넷에 연결된 뒤 다시 시도해 주세요.');
        if (done) done(false);
        return;
      }
      if (global.DayLog) DayLog.hit('ad', 'streak', 'rw_free');
      if (done) done(grantRevive());
    };
    global.__adPlace = 'streak';   // 광고 기록(daylog): 이 보상형의 자리
    Ad.showRewarded();
  }

  var STYLE_ID = 'streak-style';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      /* 상단바 아이콘 버튼(40px 정사각)과 키·모양을 맞춘 2줄 칩 — "3일 / 연속".
         예전엔 빨간 체크 아이콘 + "3일" 한 줄이었는데, 빨간색이 경고처럼 읽혀서 뺐다
         (2026-09-14 사용자 지시). 위험 상태는 아이콘 색이 아니라 .risk 점멸로만 알린다. */
      '.stk-pill{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;',
      'gap:1px;height:40px;padding:0 11px;border-radius:12px;background:rgba(255,255,255,.07);',
      'border:1px solid rgba(255,255,255,.16);color:#eaf0ff;',
      'font:700 .72rem/1 "Noto Sans KR",sans-serif;cursor:pointer;}',
      '.stk-pill{white-space:nowrap;}',   /* 좁은 폰에서 "연속" 이 두 줄로 접히던 것 방지 */
      '.stk-pill .stk-d{font-size:.76rem;font-weight:800;}',
      '.stk-pill .stk-c{font-size:.55rem;font-weight:500;opacity:.5;letter-spacing:.5px;}',
      '.stk-pill.risk{animation:stkPulse 1.6s ease-in-out infinite;}',
      '@keyframes stkPulse{0%,100%{opacity:1}50%{opacity:.5}}',
      '@media (prefers-reduced-motion:reduce){.stk-pill.risk{animation:none}}',
      /* ── 연속 학습 창 (2026-10-15 다시 그림) ──────────────────────
         성일님 "한능검 코드 분석하고 제미나이로 뽑아서 퀄리티 높게, 전산회계 오락실 디자인에 맞춰서".
         한국사의 봉수대 창(그림 + 일렁이는 불빛·불티 CSS + 말풍선 + 큰 숫자 + 통계)을 틀로 삼고,
         그림은 이 앱 아이콘 화풍으로 제미나이에서 뽑은 '불붙은 장부'(오늘 함) / '불 꺼진 장부'(아직·끊김).
         요일 줄은 이번 주 월~일 — 한 날은 금색 출석 도장. 색은 허브(남색 밤하늘 + 청록 단추 + D-day 금색)에 맞춤. */
      '.stk-ov{position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;',
      'background:rgba(4,6,16,.8);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);',
      'animation:stkFade .18s ease-out;}',
      '@keyframes stkFade{from{opacity:0}to{opacity:1}}',
      '.stk-box{position:relative;width:min(380px,88%);max-height:90%;overflow:auto;color:#eef1f7;',
      'background:radial-gradient(120% 70% at 50% 0%,#3a2614 0%,#1d1a26 48%,#121624 100%);',
      'border:1px solid rgba(255,196,96,.28);border-radius:22px;padding:18px 18px 16px;text-align:center;',
      'box-shadow:0 18px 50px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,220,150,.12);',
      'font-family:"Noto Sans KR",sans-serif;animation:stkPop .26s cubic-bezier(.2,1.3,.4,1);}',
      '@keyframes stkPop{from{transform:scale(.9);opacity:0}to{transform:none;opacity:1}}',
      '.stk-box.off{background:radial-gradient(120% 70% at 50% 0%,#232838 0%,#181c2a 50%,#121624 100%);',
      'border-color:rgba(255,255,255,.14);}',
      '.stk-x{position:absolute;top:10px;right:10px;width:32px;height:32px;border-radius:50%;border:0;',
      'background:rgba(255,255,255,.07);color:#aab2c4;font:400 20px/1 sans-serif;cursor:pointer;}',
      /* 그림 + 불빛 */
      '.stk-hero{position:relative;width:168px;height:150px;margin:2px auto 0;}',
      '.stk-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;}',
      '.stk-glow{position:absolute;left:50%;top:2%;width:62%;height:56%;transform:translateX(-50%);border-radius:50%;',
      'background:radial-gradient(circle,rgba(255,200,100,.75),rgba(255,120,30,0) 70%);pointer-events:none;',
      'animation:stkFlicker 1.7s ease-in-out infinite;}',
      '.stk-ember{position:absolute;left:46%;top:16%;width:6px;height:6px;border-radius:50%;background:#ffcf7a;',
      'box-shadow:0 0 6px #ffb347;opacity:0;pointer-events:none;animation:stkRise 2.6s ease-in infinite;}',
      '.stk-ember.e2{left:57%;animation-delay:1.1s;animation-duration:3s;}',
      '.stk-ember.e3{left:51%;animation-delay:.5s;animation-duration:3.4s;}',
      '@keyframes stkFlicker{0%,100%{opacity:.5;transform:translateX(-50%) scale(.9)}30%{opacity:.85;transform:translateX(-53%) scale(1.04)}',
      '55%{opacity:.62;transform:translateX(-47%) scale(.95)}80%{opacity:.95;transform:translateX(-50%) scale(1.1)}}',
      '@keyframes stkRise{0%{opacity:0;transform:translate(0,0) scale(1)}15%{opacity:.95}75%{opacity:.35}',
      '100%{opacity:0;transform:translate(-10px,-46px) scale(.4)}}',
      /* 말풍선 */
      '.stk-bub{position:relative;display:inline-block;margin:8px 0 10px;padding:7px 14px;border-radius:14px;',
      'background:#fff3dc;color:#2a1a08;font-size:.8rem;font-weight:700;line-height:1.35;}',
      '.stk-bub::after{content:"";position:absolute;left:50%;top:-7px;margin-left:-7px;border:7px solid transparent;',
      'border-bottom-color:#fff3dc;border-top:0;}',
      '.stk-box.off .stk-bub{background:#e7ebf5;color:#1c2233;}',
      '.stk-box.off .stk-bub::after{border-bottom-color:#e7ebf5;}',
      /* 큰 숫자 */
      '.stk-n{font-size:3.4rem;font-weight:900;line-height:1;letter-spacing:-1px;font-variant-numeric:tabular-nums;',
      'background:linear-gradient(180deg,#fff2c4 0%,#ffc552 55%,#f0902a 100%);-webkit-background-clip:text;background-clip:text;',
      'color:transparent;filter:drop-shadow(0 3px 10px rgba(255,150,40,.35));}',
      '.stk-box.off.lost .stk-n{background:linear-gradient(180deg,#ffe0c2,#ff9a52);-webkit-background-clip:text;background-clip:text;}',
      '.stk-box.off.lost .stk-lb{color:#ffb27a;}',
      '.stk-box.off .stk-n{background:linear-gradient(180deg,#ffffff,#b9c2d6);-webkit-background-clip:text;background-clip:text;filter:none;}',
      '.stk-lb{margin-top:3px;font-size:.82rem;font-weight:700;color:#e9b863;letter-spacing:.5px;}',
      '.stk-box.off .stk-lb{color:#9aa4ba;}',
      /* 이번 주 */
      '.stk-week{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:14px 0 4px;padding:10px 6px 8px;',
      'background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.07);border-radius:14px;}',
      '.stk-wd{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;}',
      '.stk-wd span{font-size:.66rem;color:#8b93a7;font-weight:700;}',
      '.stk-wd i{display:block;width:min(30px,100%);aspect-ratio:1;height:auto;border-radius:50%;background:rgba(255,255,255,.06);',
      'border:1.5px solid rgba(255,255,255,.1);box-sizing:border-box;}',
      '.stk-wd.on i{border:0;background:url(assets/icons/stk_stamp.webp) center 60%/contain no-repeat;width:min(28px,100%);aspect-ratio:28/34;margin-top:-4px;border-radius:0;}',
      '.stk-wd.today span{color:#ffd27a;}',
      '.stk-wd.today:not(.on) i{border:2px dashed #ffb347;background:rgba(255,179,71,.08);}',
      '.stk-wd.fut i{opacity:.45;}',
      /* 통계 */
      '.stk-stat{display:flex;gap:8px;margin:10px 0 10px;}',
      '.stk-stat div{flex:1 1 0;min-width:0;display:flex;align-items:center;gap:8px;text-align:left;',
      'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:8px 10px;}',
      '.stk-stat img{width:30px;height:30px;object-fit:contain;flex:none;}',
      '.stk-stat b{display:block;font-size:1.05rem;color:#fff;line-height:1.1;font-variant-numeric:tabular-nums;}',
      '.stk-stat span{display:block;font-size:.68rem;color:#98a0b3;white-space:nowrap;}',
      '.stk-note{font-size:.72rem;color:#8d94a6;line-height:1.55;margin:0 4px 12px;word-break:keep-all;}',
      '.stk-lost{font-size:.8rem;color:#ffe2c2;line-height:1.5;margin:0 0 12px;word-break:keep-all;',
      'background:rgba(255,140,60,.12);border:1px solid rgba(255,160,80,.32);border-radius:12px;padding:9px 12px;}',
      '.stk-row{display:flex;gap:8px;}',
      '.stk-row button{flex:1 1 0;min-width:0;padding:13px 0;border-radius:12px;font:700 .9rem/1 inherit;',
      'cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);color:#eef1f7;',
      'display:flex;align-items:center;justify-content:center;}',
      '.stk-row button.primary{background:linear-gradient(135deg,#00c2d6,#0090c8);border-color:transparent;color:#04121a;}',
      '.stk-row button.fire{background:linear-gradient(135deg,#ffb347,#f0782a);border-color:transparent;color:#2a1204;}',
      '.stk-row .ad-ico{width:1.3em;height:1.3em;margin-right:.3em;object-fit:contain;}',
      /* 키 작은 폰(아이폰 SE 1세대 568 등): 단추가 창 밖으로 밀리지 않게 줄인다 */
      '@media (max-height:700px){.stk-box{padding:14px 14px 12px}.stk-hero{width:130px;height:108px}.stk-bub{margin:6px 0 6px}',
      '.stk-n{font-size:2.6rem}.stk-week{margin:10px 0 2px;padding:8px 4px 6px}.stk-stat{margin:8px 0}.stk-note{margin-bottom:10px}',
      '.stk-lost{margin-bottom:10px;padding:7px 10px}.stk-row button{padding:11px 0}}',
      '@media (max-height:600px){.stk-hero{width:100px;height:82px}.stk-note{display:none}}',
      '.stk-box button:focus-visible{outline:2px solid #ffd27a;outline-offset:2px;}',
      '@media (prefers-reduced-motion:reduce){.stk-ov,.stk-box{animation:none}.stk-glow,.stk-ember{animation:none}.stk-ember{display:none}}'
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
    pill.innerHTML = '<span class="stk-d">' + s.days + '일</span><span class="stk-c">연속</span>';
    pill.title = s.canRevive ? s.lost + '일 연속이 끊겼어요 — 오늘 안에 되살릴 수 있습니다'
               : s.atRisk ? '오늘 아직 안 했어요' : '오늘 출석 완료';
  }

  /* 이번 주(월~일, 한국시간)에서 연속 기록에 든 날. 기록은 '마지막으로 한 날'과 '연속 일수'만
     있으므로 그 끝에서 거꾸로 days 만큼을 한 날로 본다(보충권으로 메운 하루도 이어진 날로 친다). */
  function week(s) {
    var t = dayNum(today());
    var dow = (new Date(t * 86400000).getUTCDay() + 6) % 7;      // 월=0
    var mon = t - dow, end = dayNum(s.last), start = end == null ? null : end - s.days + 1;
    var out = [];
    for (var i = 0; i < 7; i++) {
      var d = mon + i;
      out.push({ name: '월화수목금토일'.charAt(i), on: start != null && s.days > 0 && d >= start && d <= end,
                 today: d === t, fut: d > t });
    }
    return out;
  }

  function openModal() {
    ensureStyle();
    var s = state();
    var lit = s.doneToday && !s.canRevive;          // 오늘 한 판 → 불붙은 장부(끊긴 날은 오늘 했어도 꺼진 장부로)
    var bubble = s.canRevive ? '장부의 불이 꺼졌어요'
      : lit ? (s.days >= s.best && s.days > 1 ? '최고 기록 경신 중!' : '오늘 장부에 불을 붙였어요')
      : s.days > 0 ? '오늘 한 판이면 불이 붙어요' : '한 판 끝내면 시작돼요';
    var shown = s.canRevive ? s.lost : s.days;
    var ov = document.createElement('div');
    ov.className = 'stk-ov';
    ov.innerHTML =
      '<div class="stk-box' + (lit ? '' : ' off') + (s.canRevive ? ' lost' : '') + '" role="dialog" aria-modal="true" aria-label="연속 학습">' +
        '<button class="stk-x" id="stk-x" aria-label="닫기">×</button>' +
        '<div class="stk-hero">' +
          (lit ? '<i class="stk-glow"></i>' : '') +
          '<img src="assets/icons/' + (lit ? 'stk_ledger_on' : 'stk_ledger_off') + '.webp" alt="">' +
          (lit ? '<i class="stk-ember"></i><i class="stk-ember e2"></i><i class="stk-ember e3"></i>' : '') +
        '</div>' +
        '<div class="stk-bub">' + bubble + '</div>' +
        '<div class="stk-n">' + shown + '</div>' +
        '<div class="stk-lb">' + (s.canRevive ? '일 연속이 끊겼어요' : '일 연속 학습') + '</div>' +
        '<div class="stk-week">' + week(s).map(function (w) {
          return '<div class="stk-wd' + (w.on ? ' on' : '') + (w.today ? ' today' : '') + (w.fut ? ' fut' : '') + '">' +
                 '<i></i><span>' + (w.today ? '오늘' : w.name) + '</span></div>';
        }).join('') + '</div>' +
        '<div class="stk-stat">' +
          '<div><img src="assets/icons/trophy.webp" alt=""><p style="margin:0"><b>' + s.best + '일</b><span>최고 기록</span></p></div>' +
          '<div><img src="assets/icons/ice.webp" alt=""><p style="margin:0"><b>' + s.freeze + '개</b><span>보충권</span></p></div>' +
        '</div>' +
        (s.canRevive
          ? '<div class="stk-lost">오늘 안에 되살리면 ' + s.lost + '일 기록이 그대로 이어집니다.</div>' +
            '<div class="stk-row">' +
              '<button id="stk-close">닫기</button>' +
              '<button id="stk-revive" class="fire">' +
                (adsAvailable() ? '<img class="ad-ico" src="assets/icons/ad_tv.webp" alt="" aria-hidden="true">광고 보고 되살리기' : '되살리기') +
              '</button>' +
            '</div>'
          : '<div class="stk-note">' + (lit ? '내일도 한 판이면 이어집니다. ' : '') +
            '7일 연속마다 보충권이 하나 생기고, 보충권이 있으면 하루를 빠뜨려도 이어집니다.</div>' +
            '<div class="stk-row">' +
              '<button id="stk-close" class="primary">' + (lit ? '좋아요' : '한 판 하러 가기') + '</button>' +
            '</div>') +
      '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    document.body.appendChild(ov);
    ov.querySelector('#stk-close').addEventListener('click', close);
    ov.querySelector('#stk-x').addEventListener('click', close);
    var rv = ov.querySelector('#stk-revive');
    if (rv && global.DayLog) DayLog.hit('ad', 'streak', 'rw_offer');
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
