/* ============================================================
 *  event129.js — 「제129회 대비 2급·1급 스테이지 정복」 챌린지 · 2026-10-14
 *
 *  App Store 인앱 이벤트(id 6818749849, 승인됨)와 짝. 성일님 지시(한국사 세션이 SESSION_LOG 에 대신 적음):
 *  이벤트 카드를 보고 들어온 사람이 앱 안에서도 이벤트를 볼 수 있게 — 한국사 event81.js 와 같은 틀.
 *   ① 이벤트 기간에만 허브(2급·1급) 맨 위에 띠: '129회 정복 챌린지 · 깬 스테이지 n/11 · D-n'(누르면 설명)
 *   ② 기간 안에 2급 5개 + 1급 6개를 모두 깨면 '129회 정복' 배지 + 축하 한 번
 *   기간이 끝나면 띠는 저절로 사라지고 받은 배지(기기 저장)는 남는다(배지를 받은 사람에겐 기간 뒤에도 작게 보임).
 *
 *  '깼다'는 허브의 클리어 기준과 같다.
 *   · 2급: index.html renderStageMap 과 같은 식 — 최고점 ≥ MIN_CLEAR 또는 hub_cleared_<게임>='1'
 *     (MIN_CLEAR 는 index.html 에 있다 — 그쪽을 바꾸면 여기도 같이 바꿀 것)
 *   · 1급: lv1_s1~s6_progress 의 cleared (index_lv1.html 과 같음)
 *  시각은 기기 시계. 시험할 땐 localStorage 'am_ev129_now' 에 밀리초를 넣는다.
 *  window.Event129
 * ============================================================ */
(function (global) {
  'use strict';
  var START = Date.UTC(2026, 10, 4, 15, 0, 0);   // 2026-11-05 00:00 KST
  var END   = Date.UTC(2026, 11, 5, 3, 0, 0);    // 2026-12-05 12:00 KST
  var EXAM  = Date.UTC(2026, 11, 4, 15, 0, 0);   // 시험일 12/5 0시 KST — D-day 셈
  var K_BADGE = 'am_ev129_badge', K_SEEN = 'am_ev129_seen';
  var MIN_CLEAR = { acid: 1000, memory: 500, debit: 600, factory: 600, flight: 8000 };
  var LV2 = [['acid', 'hub_acid_best', '계정과목 산성비'], ['memory', 'hub_memory_best', '기억의 전당'], ['debit', 'hub_debit_best', '회계 차변대변'],
             ['factory', 'hub_factory_best', '결산분개 조립공장'], ['flight', 'hub_flight_hi', '플라이트 장부조회']];
  // 1급 허브 순서(원가의 길 → 자본의 제왕 → 분개의 탑 → 전표의 눈 → 신고의 문 → 배관의 방). 저장 키 번호는 만든 순서라 다르다.
  var LV1 = [['lv1_s1_progress', '원가의 길'], ['lv1_s3_progress', '자본의 제왕'], ['lv1_s2_progress', '분개의 탑'],
             ['lv1_s4_progress', '전표의 눈'], ['lv1_s5_progress', '신고의 문'], ['lv1_s6_progress', '배관의 방']];

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function now() { var t = +(get('am_ev129_now') || 0); return t > 0 ? t : Date.now(); }
  function active() { var t = now(); return t >= START && t < END; }
  function hit(ev) { try { if (global.DayLog) DayLog.hit('act', 'ev129', ev); } catch (e) {} }

  function lv2Done(g) {
    var best = parseInt(get(g[1]) || '0', 10);
    return best >= (MIN_CLEAR[g[0]] || 1) || get('hub_cleared_' + g[0]) === '1';
  }
  function lv1Done(s) { try { return !!JSON.parse(get(s[0]) || '{}').cleared; } catch (e) { return false; } }
  function status() {
    var a = LV2.map(function (g) { return { name: g[2], done: lv2Done(g), lv: '2급' }; });
    var b = LV1.map(function (s) { return { name: s[1], done: lv1Done(s), lv: '1급' }; });
    var all = a.concat(b);
    return { list: all, done: all.filter(function (x) { return x.done; }).length, total: all.length };
  }
  function dday() { var d = Math.ceil((EXAM - now()) / 86400000); return d > 0 ? 'D-' + d : 'D-DAY'; }
  function hasBadge() { return !!get(K_BADGE); }

  function css() {
    if (document.getElementById('ev129-style')) return;
    var s = document.createElement('style'); s.id = 'ev129-style';
    s.textContent =
      '#ev129{max-width:640px;margin:0 auto 14px;display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:16px;cursor:pointer;' +
      'background:linear-gradient(100deg,rgba(255,196,60,.16),rgba(255,140,40,.10));border:1.5px solid rgba(255,200,80,.55);color:#fff3d6;' +
      'font-family:"Noto Sans KR",sans-serif;-webkit-user-select:none;user-select:none;box-sizing:border-box}' +
      '#ev129 img{width:38px;height:38px;flex:none}' +
      '#ev129 .t{flex:1;min-width:0;display:grid;gap:5px}' +
      '#ev129 .h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}' +
      '#ev129 b{font-family:"Black Han Sans",sans-serif;font-weight:400;font-size:1.02rem;color:#ffd166;white-space:nowrap}' +
      '#ev129 .d{font-size:.78rem;color:#ffcf8a;font-weight:700;white-space:nowrap}' +
      '#ev129 .row{display:flex;align-items:center;gap:8px}' +
      '#ev129 .bar{flex:1;height:7px;border-radius:4px;background:rgba(255,255,255,.14);overflow:hidden}' +
      '#ev129 .bar i{display:block;height:100%;background:linear-gradient(90deg,#ffd166,#ff9f43);border-radius:4px}' +
      '#ev129 .n{font-size:.8rem;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}' +
      '#ev129 .go{flex:none;font-size:.78rem;color:#ffd166;font-weight:700}' +
      '#ev129.won{background:linear-gradient(100deg,rgba(255,209,102,.28),rgba(255,159,67,.18))}' +
      '#ev129.small{padding:8px 14px}#ev129.small img{width:28px;height:28px}' +
      '@media(max-width:480px){#ev129{margin-bottom:12px;padding:10px 12px}#ev129 b{font-size:.95rem}}' +
      /* 설명 창 */
      '#ev129-ov{position:fixed;inset:0;z-index:9000;background:rgba(2,8,16,.72);display:flex;align-items:center;justify-content:center;padding:18px}' +
      '#ev129-ov .box{word-break:keep-all;width:min(420px,100%);max-height:88vh;overflow:auto;background:#0f1a2c;border:1.5px solid rgba(255,200,80,.5);border-radius:18px;padding:18px;color:#eaf2ff;font-family:"Noto Sans KR",sans-serif}' +
      '#ev129-ov h3{margin:0 0 4px;font-family:"Black Han Sans",sans-serif;font-weight:400;color:#ffd166;font-size:1.25rem}' +
      '#ev129-ov p{margin:6px 0;font-size:.9rem;line-height:1.55;color:#cfdaf0}' +
      '#ev129-ov ul{list-style:none;margin:10px 0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:6px}' +
      '#ev129-ov li{font-size:.84rem;padding:6px 9px;border-radius:9px;background:rgba(255,255,255,.06);color:#9fb0cc}' +
      '#ev129-ov li.ok{background:rgba(46,204,113,.16);color:#7ee2a8;font-weight:700}' +
      '#ev129-ov li em{font-style:normal;font-size:.72rem;opacity:.8;margin-right:4px}' +
      '#ev129-ov button{width:100%;margin-top:8px;padding:12px;border:0;border-radius:12px;background:#ffd166;color:#1b1200;font-weight:900;font-size:.95rem;font-family:inherit;cursor:pointer}' +
      /* 꽃가루 */
      '.ev129-conf{position:fixed;top:-12px;width:9px;height:14px;z-index:9500;pointer-events:none;border-radius:2px;animation:ev129fall linear forwards}' +
      '@keyframes ev129fall{to{transform:translateY(105vh) rotate(720deg);opacity:.9}}' +
      '@media (prefers-reduced-motion: reduce){.ev129-conf{display:none}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function confetti() {
    var colors = ['#ffd166', '#ff9f43', '#06d6a0', '#4cc9f0', '#ef476f', '#ffffff'];
    for (var i = 0; i < 90; i++) {
      var p = document.createElement('div');
      p.className = 'ev129-conf';
      p.style.left = (Math.random() * 100) + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (1.8 + Math.random() * 1.8) + 's';
      p.style.animationDelay = (Math.random() * .6) + 's';
      document.body.appendChild(p);
      setTimeout(function (el) { return function () { el.remove(); }; }(p), 4500);
    }
  }

  function openInfo() {
    hit('open');
    var st = status(), won = hasBadge();
    var ov = document.createElement('div'); ov.id = 'ev129-ov';
    ov.innerHTML = '<div class="box" role="dialog" aria-label="129회 정복 챌린지">' +
      '<h3>' + (won ? '129회 정복 완료!' : '129회 정복 챌린지') + '</h3>' +
      '<p>12월 5일 전산회계 129회 시험 전까지 2급·1급 <b>모든 스테이지</b>를 깨 보세요. 틀린 문제는 오답노트에 모여요.</p>' +
      '<p>기간: 11월 5일 ~ 12월 5일 낮 12시 · 시험까지 <b>' + dday() + '</b></p>' +
      '<p>깬 스테이지 <b>' + st.done + ' / ' + st.total + '</b>' + (won ? ' · <b>129회 정복 배지</b>를 받았어요' : ' · 다 깨면 <b>129회 정복 배지</b>') + '</p>' +
      '<ul>' + st.list.map(function (x) { return '<li class="' + (x.done ? 'ok' : '') + '"><em>' + x.lv + '</em>' + x.name + (x.done ? ' · 깸' : '') + '</li>'; }).join('') + '</ul>' +
      '<button type="button">확인</button></div>';
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.tagName === 'BUTTON') close(); });
    document.body.appendChild(ov);
  }

  function render() {
    var anchor = document.getElementById('examday-box');
    var old = document.getElementById('ev129');
    var on = active(), won = hasBadge();
    if (!on && !won) { if (old) old.remove(); return; }   // 기간 밖 · 배지 없음 → 아무것도 안 보임
    if (!anchor || !anchor.parentNode) return;
    css();
    var st = status();
    // 기간 안에 다 깨면 배지 + 축하(한 번)
    if (on && !won && st.done >= st.total) {
      set(K_BADGE, String(now())); won = true; hit('complete');
      setTimeout(function () {
        confetti();
        if (global.Ask && Ask.alert) Ask.alert('129회 정복!\n2급·1급 스테이지 ' + st.total + '개를 모두 깼어요.\n시험까지 ' + dday() + ' — 오답노트로 마무리해요.');
      }, 400);
    }
    var el = old || document.createElement('div');
    el.id = 'ev129';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    if (!on) {   // 기간이 끝난 뒤 — 받은 배지만 작게
      el.className = 'won small';
      el.innerHTML = '<img src="assets/icons/trophy.webp" alt=""><div class="t"><div class="h"><b>129회 정복 배지</b><span class="d">2급·1급 모든 스테이지</span></div></div>';
    } else {
      el.className = won ? 'won' : '';
      var pct = Math.round(st.done / st.total * 100);
      el.innerHTML = '<img src="assets/icons/' + (won ? 'trophy' : 'target') + '.webp" alt="">' +
        '<div class="t"><div class="h"><b>' + (won ? '129회 정복 완료' : '129회 정복 챌린지') + '</b><span class="d">시험 ' + dday() + '</span></div>' +
        '<div class="row"><div class="bar"><i style="width:' + pct + '%"></i></div><span class="n">깬 스테이지 ' + st.done + '/' + st.total + '</span></div></div>' +
        '<span class="go">자세히</span>';
    }
    el.onclick = openInfo;
    el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openInfo(); } };
    if (!old) {
      anchor.parentNode.insertBefore(el, anchor);
      if (on && get(K_SEEN) !== '1') { set(K_SEEN, '1'); hit('view'); }
    }
  }

  function boot() {
    render();
    /* 허브는 계정의 최고점을 서버에서 받아 온 뒤 renderStageMap() 으로 지도를 다시 그린다 — 그때 띠 숫자도 다시 센다.
       (함수 선언은 window 속성이라 감싸면 허브 안의 renderStageMap() 호출도 이쪽을 지난다) */
    if (typeof global.renderStageMap === 'function' && !global.renderStageMap.__ev129) {
      var orig = global.renderStageMap;
      global.renderStageMap = function () { var r = orig.apply(this, arguments); try { render(); } catch (e) {} return r; };
      global.renderStageMap.__ev129 = true;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  // 게임에서 돌아오면(bfcache 포함) 다시 센다
  global.addEventListener('pageshow', function () { try { render(); } catch (e) {} });

  global.Event129 = { active: active, status: status, render: render, openInfo: openInfo, START: START, END: END };
})(window);
