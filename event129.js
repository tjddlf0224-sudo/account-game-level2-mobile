/* ============================================================
 *  event129.js — 「제129회 대비 2급·1급 스테이지 정복」 챌린지 · 2026-10-14
 *
 *  App Store 인앱 이벤트(id 6818749849, 승인됨)와 짝. 성일님 지시(한국사 세션이 SESSION_LOG 에 대신 적음):
 *  이벤트 카드를 보고 들어온 사람이 앱 안에서도 이벤트를 볼 수 있게 — 한국사 event81.js 와 같은 틀.
 *   ① 이벤트 기간에만 허브(2급·1급) 맨 위에 띠: '129회 정복 챌린지 · 깬 스테이지 n/11 · D-n'(누르면 설명)
 *   ② 기간 안에 2급 5개 + 1급 6개를 모두 깨면 '129회 정복' 배지 + 축하 한 번
 *   기간이 끝나면 띠는 저절로 사라지고 받은 배지는 남는다(배지를 받은 사람에겐 기간 뒤에도 작게 보임).
 *   배지는 계정(닉네임)에도 저장한다(Supabase user_badges, 2026-10-15 성일님 "그렇게 바꿔") — 앱을 지우거나 폰을 바꿔도
 *   같은 닉네임으로 들어오면 되살아난다. 기기 값에는 주인 닉네임을 같이 적어, 한 기기에서 다른 사람으로 바꾸면 안 넘어간다.
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
  var K_BADGE = 'am_ev129_badge', K_SEEN = 'am_ev129_seen', K_WHO = 'am_ev129_badge_who', K_PUSHED = 'am_ev129_badge_pushed';
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
  function me() { return (get('hub_nickname') || '').trim(); }
  // 기기에 남은 배지가 지금 사람 것인지(주인 기록이 없는 옛 값은 지금 사람 것으로 본다)
  function hasBadge() { var w = get(K_WHO); return !!get(K_BADGE) && (!w || w === me()); }

  /* ── 계정 저장(Supabase user_badges) ──────────────────────────
     · 받을 때 올린다(실패하면 다음에 허브를 열 때 다시).  · 허브를 열 때 받아 온다(기기에 없으면 채움, 축하는 안 띄움).
     닉네임 바꾸기(rename_player)·회원탈퇴(delete_account) RPC 가 서버 쪽 배지도 같이 옮기고 지운다. */
  function db() { try { return typeof global._sbClient === 'function' ? global._sbClient() : null; } catch (e) { return null; } }
  var pushing = false;
  function push() {
    var n = me(), c = db();
    if (pushing || !n || !c || !hasBadge() || get(K_PUSHED) === n) return;
    pushing = true;
    try {
      c.from('user_badges').upsert({ user_name: n, badge: 'ev129', group_id: get('hub_group_id') || null,
        earned_at: new Date(+get(K_BADGE) || Date.now()).toISOString() }, { onConflict: 'user_name,badge', ignoreDuplicates: true })
        .then(function (r) { pushing = false; if (r && !r.error) set(K_PUSHED, n); }, function () { pushing = false; });
    } catch (e) { pushing = false; }
  }
  function pull() {
    var n = me(), c = db();
    if (!n || !c) return;
    if (hasBadge()) { push(); return; }
    try {
      c.from('user_badges').select('earned_at').eq('user_name', n).eq('badge', 'ev129').limit(1)
        .then(function (r) {
          var row = r && !r.error && r.data && r.data[0];
          if (!row || me() !== n) return;
          set(K_BADGE, String(Date.parse(row.earned_at) || now())); set(K_WHO, n); set(K_PUSHED, n);
          try { render(); } catch (e) {}
        }, function () {});
    } catch (e) {}
  }

  function css() {
    if (document.getElementById('ev129-style')) return;
    var s = document.createElement('style'); s.id = 'ev129-style';
    /* 2026-10-14 성일님 "좀 더 예쁘게 — 제미나이로 뽑아 보고 예쁜 걸 차용해서" → 제미나이 시안 3안에서
       금테 카드(③)·스테이지 11개를 보석으로(①)·오른쪽 위 EVENT 띠·보상 배지 미리보기·반짝이는 확인 단추를 가져왔다.
       배지·보석 그림은 제미나이로 기존 아이콘과 같은 화풍(assets/icons/ev129_*.webp). */
    s.textContent = [
      '#ev129{position:relative;max-width:640px;margin:0 auto 14px;box-sizing:border-box;cursor:pointer;-webkit-user-select:none;user-select:none;',
      ' border-radius:18px;padding:13px 34px 12px 12px;overflow:hidden;font-family:"Noto Sans KR",sans-serif;color:#fff3d6;',
      ' background:radial-gradient(120% 140% at 0% 0%,rgba(255,196,80,.22),transparent 55%),linear-gradient(135deg,#1d1a33,#14223d 60%,#101a30) padding-box,',
      '  linear-gradient(135deg,#ffe29a,#c8862a 35%,#7a4b14 55%,#f5c35a 80%,#8a5a1c) border-box;border:2px solid transparent;',
      ' box-shadow:0 6px 22px rgba(0,0,0,.35),0 0 18px rgba(255,190,80,.18),inset 0 1px 0 rgba(255,255,255,.08);',
      ' display:grid;grid-template-columns:auto 1fr auto;grid-template-rows:auto auto;column-gap:10px;row-gap:7px;align-items:center}',
      '#ev129::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.10) 45%,transparent 55%);',
      ' transform:translateX(-120%);animation:ev129shine 5.5s ease-in-out infinite}',
      '@keyframes ev129shine{0%,65%{transform:translateX(-120%)}85%,100%{transform:translateX(120%)}}',
      '#ev129 .em{grid-row:1/3;width:54px;height:54px;filter:drop-shadow(0 3px 8px rgba(120,90,255,.45))}',
      '#ev129 .ti{display:flex;align-items:center;gap:7px;min-width:0}',
      '#ev129 .ti b{font-family:"Black Han Sans",sans-serif;font-weight:400;font-size:1.08rem;white-space:nowrap;letter-spacing:.01em;',
      ' background:linear-gradient(180deg,#fff3c4,#ffc24a 60%,#e08a1e);-webkit-background-clip:text;background-clip:text;color:transparent}',
      '#ev129 .dd{flex:none;font-size:.7rem;font-weight:900;color:#1b1200;background:linear-gradient(180deg,#ffe08a,#f2a93b);border-radius:20px;padding:1px 8px;box-shadow:0 0 8px rgba(255,190,80,.4)}',
      '#ev129 .go{grid-row:1;grid-column:3;align-self:center;font-size:.74rem;font-weight:700;color:#ffd98a;border:1px solid rgba(255,210,120,.45);border-radius:20px;padding:5px 10px;white-space:nowrap;background:rgba(255,200,90,.08)}',
      '#ev129 .gems{grid-column:2/4;display:flex;align-items:center;gap:3px;min-width:0}',
      '#ev129 .gems img{width:17px;height:17px;flex:none}',
      '#ev129 .gems img.off{opacity:.75}',
      '#ev129 .gems .sep{width:1px;height:13px;background:rgba(255,220,150,.35);margin:0 4px;flex:none}',
      '#ev129 .gems .n{margin-left:6px;font-size:.76rem;font-weight:900;color:#ffe2a0;white-space:nowrap;font-variant-numeric:tabular-nums}',
      '#ev129 .rb{position:absolute;top:7px;right:-30px;width:96px;transform:rotate(38deg);text-align:center;font-size:.56rem;font-weight:900;letter-spacing:.14em;',
      ' color:#0c2230;background:linear-gradient(90deg,#5ef0ff,#25c6e6);box-shadow:0 2px 6px rgba(0,0,0,.3);padding:1px 0}',
      '#ev129.won{box-shadow:0 6px 22px rgba(0,0,0,.35),0 0 26px rgba(255,200,90,.35),inset 0 1px 0 rgba(255,255,255,.1)}',
      '#ev129.small{grid-template-columns:auto 1fr;padding:8px 14px 8px 10px}#ev129.small .em{grid-row:auto;width:34px;height:34px}#ev129.small::after{display:none}',
      '#ev129.small .ti b{font-size:.95rem}#ev129.small .sub{font-size:.74rem;color:#e9cf98}',
      '@media(max-width:400px){#ev129{padding:11px 30px 10px 9px;column-gap:8px}#ev129 .em{width:46px;height:46px}#ev129 .ti b{font-size:.98rem}',
      ' #ev129 .gems img{width:15px;height:15px}#ev129 .gems{gap:2px}#ev129 .go{padding:4px 8px;font-size:.7rem}}',
      '@media(max-width:350px){#ev129 .gems .sep{margin:0 2px}#ev129 .gems img{width:13px;height:13px}}',
      /* 설명 창 */
      '#ev129-ov{position:fixed;inset:0;z-index:9000;background:rgba(2,6,14,.78);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;animation:ev129in .18s ease}',
      '@keyframes ev129in{from{opacity:0}to{opacity:1}}',
      '#ev129-ov .box{position:relative;width:min(400px,100%);max-height:90vh;overflow:auto;word-break:keep-all;border-radius:22px;color:#eaf2ff;font-family:"Noto Sans KR",sans-serif;',
      ' background:linear-gradient(180deg,#18213d,#0f1729) padding-box,linear-gradient(160deg,#ffe29a,#b9772a 40%,#3a5bd0 75%,#7fe7ff) border-box;border:2px solid transparent;',
      ' box-shadow:0 20px 60px rgba(0,0,0,.55),0 0 30px rgba(255,190,80,.15);animation:ev129pop .22s cubic-bezier(.2,.9,.3,1.2)}',
      '@keyframes ev129pop{from{transform:scale(.94);opacity:.4}to{transform:none;opacity:1}}',
      '#ev129-ov .hd{position:relative;padding:18px 18px 14px;display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;',
      ' background:radial-gradient(90% 120% at 15% 10%,rgba(140,110,255,.35),transparent 60%),radial-gradient(80% 100% at 100% 0%,rgba(255,190,80,.22),transparent 60%);border-bottom:1px solid rgba(255,220,150,.18)}',
      '#ev129-ov .hd img{width:84px;height:84px;filter:drop-shadow(0 4px 12px rgba(120,90,255,.5))}',
      '#ev129-ov h3{margin:0;font-family:"Black Han Sans",sans-serif;font-weight:400;font-size:1.45rem;line-height:1.1;',
      ' background:linear-gradient(180deg,#fff3c4,#ffc24a 60%,#e08a1e);-webkit-background-clip:text;background-clip:text;color:transparent}',
      '#ev129-ov .per{margin-top:6px;font-size:.8rem;color:#cdd7ee;display:flex;flex-wrap:wrap;gap:6px;align-items:center}',
      '#ev129-ov .per .dd{font-size:.72rem;font-weight:900;color:#1b1200;background:linear-gradient(180deg,#ffe08a,#f2a93b);border-radius:20px;padding:1px 9px}',
      '#ev129-ov .bd{padding:14px 16px 16px;display:grid;gap:12px}',
      '#ev129-ov .lead{margin:0;font-size:.88rem;line-height:1.55;color:#cfdaf0}',
      '#ev129-ov .grp{display:grid;gap:7px}',
      '#ev129-ov .gt{display:flex;align-items:center;gap:8px;font-size:.78rem;font-weight:900;color:#9fb3d8;letter-spacing:.04em}',
      '#ev129-ov .gt::after{content:"";flex:1;height:1px;background:rgba(159,179,216,.25)}',
      '#ev129-ov .tiles{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
      '#ev129-ov .tile{display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:11px;font-size:.8rem;white-space:nowrap;min-width:0;color:#9fb0cc;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06)}',
      '#ev129-ov .tile img{width:18px;height:18px;flex:none}#ev129-ov .tile span:not(.ck){overflow:hidden;text-overflow:ellipsis}',
      '#ev129-ov .tile.ok{color:#fff1cf;font-weight:700;background:linear-gradient(135deg,rgba(255,196,80,.22),rgba(255,150,40,.10));border-color:rgba(255,205,110,.55)}',
      '#ev129-ov .tile.ok .ck{margin-left:auto;flex:none;font-size:.66rem;font-weight:900;color:#1b1200;background:#ffc24a;border-radius:20px;padding:0 5px}',
      '#ev129-ov .pg{display:flex;align-items:center;gap:10px;font-size:.82rem;font-weight:900;color:#ffe2a0;font-variant-numeric:tabular-nums}',
      '#ev129-ov .pg .bar{flex:1;height:9px;border-radius:5px;background:rgba(255,255,255,.1);overflow:hidden}',
      '#ev129-ov .pg .bar i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#ffe08a,#ff9f43);box-shadow:0 0 10px rgba(255,180,70,.6)}',
      '#ev129-ov .rw{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;padding:10px 12px;border-radius:14px;',
      ' background:linear-gradient(135deg,rgba(110,90,255,.18),rgba(60,120,255,.08));border:1px solid rgba(150,140,255,.35)}',
      '#ev129-ov .rw img{width:52px;height:52px}',
      '#ev129-ov .rw.locked img{filter:grayscale(.85) brightness(.75)}',
      '#ev129-ov .rw b{display:block;font-size:.95rem;color:#fff}#ev129-ov .rw span{font-size:.78rem;color:#b9c6e6}',
      '#ev129-ov button{width:100%;padding:13px;border:0;border-radius:14px;cursor:pointer;font-family:"Black Han Sans",sans-serif;font-size:1.05rem;letter-spacing:.04em;color:#2a1600;',
      ' background:linear-gradient(180deg,#ffe9a6,#ffc24a 55%,#e8921f);box-shadow:0 4px 0 #a8620f,0 8px 18px rgba(255,170,60,.35),inset 0 1px 0 rgba(255,255,255,.6)}',
      '#ev129-ov button:active{transform:translateY(2px);box-shadow:0 2px 0 #a8620f,0 4px 10px rgba(255,170,60,.3)}',
      '#ev129-ov button:focus-visible,#ev129:focus-visible{outline:2px solid #7fe7ff;outline-offset:2px}',
      /* 꽃가루 */
      '.ev129-conf{position:fixed;top:-12px;width:9px;height:14px;z-index:9500;pointer-events:none;border-radius:2px;animation:ev129fall linear forwards}',
      '@keyframes ev129fall{to{transform:translateY(105vh) rotate(720deg);opacity:.9}}',
      '@media (prefers-reduced-motion: reduce){.ev129-conf{display:none}#ev129::after{animation:none;display:none}#ev129-ov,#ev129-ov .box{animation:none}}'
    ].join('\n');
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

  var IC = 'assets/icons/';
  function gem(on) { return '<img class="' + (on ? 'on' : 'off') + '" src="' + IC + (on ? 'ev129_gem_on' : 'ev129_gem_off') + '.webp" alt="">'; }
  function openInfo() {
    hit('open');
    var st = status(), won = hasBadge();
    var g2 = st.list.filter(function (x) { return x.lv === '2급'; }), g1 = st.list.filter(function (x) { return x.lv === '1급'; });
    function tiles(arr) {
      return '<div class="tiles">' + arr.map(function (x) {
        return '<div class="tile' + (x.done ? ' ok' : '') + '">' + gem(x.done) + '<span>' + x.name + '</span>' + (x.done ? '<span class="ck">깸</span>' : '') + '</div>';
      }).join('') + '</div>';
    }
    var pct = Math.round(st.done / st.total * 100);
    var ov = document.createElement('div'); ov.id = 'ev129-ov';
    ov.innerHTML = '<div class="box" role="dialog" aria-label="129회 정복 챌린지">' +
      '<div class="hd"><img src="' + IC + 'ev129_badge.webp" alt=""><div>' +
        '<h3>' + (won ? '129회 정복 완료!' : '129회 정복 챌린지') + '</h3>' +
        '<div class="per">11월 5일 ~ 12월 5일 낮 12시<span class="dd">시험 ' + dday() + '</span></div></div></div>' +
      '<div class="bd">' +
        '<p class="lead">12월 5일 전산회계 129회 전까지 2급·1급 <b>모든 스테이지</b>를 깨 보세요. 틀린 문제는 오답노트에 모여요.</p>' +
        '<div class="grp"><div class="gt">2급 · ' + g2.length + '개</div>' + tiles(g2) + '</div>' +
        '<div class="grp"><div class="gt">1급 · ' + g1.length + '개</div>' + tiles(g1) + '</div>' +
        '<div class="pg"><div class="bar"><i style="width:' + pct + '%"></i></div>깬 스테이지 ' + st.done + ' / ' + st.total + '</div>' +
        '<div class="rw' + (won ? '' : ' locked') + '"><img src="' + IC + 'ev129_badge.webp" alt=""><div><b>' + (won ? '129회 정복 배지를 받았어요' : '보상 · 129회 정복 배지') + '</b>' +
          '<span>' + (won ? '시험까지 오답노트로 마무리해요' : '기간 안에 ' + st.total + '개를 모두 깨면 받아요') + '</span></div></div>' +
        '<button type="button">확인</button>' +
      '</div></div>';
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.tagName === 'BUTTON') close(); });
    document.body.appendChild(ov);
    try { ov.querySelector('button').focus({ preventScroll: true }); } catch (e) {}
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
      set(K_BADGE, String(now())); set(K_WHO, me()); try { localStorage.removeItem(K_PUSHED); } catch (e) {}
      won = true; hit('complete'); push();
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
      el.innerHTML = '<img class="em" src="' + IC + 'ev129_badge.webp" alt=""><div><div class="ti"><b>129회 정복 배지</b></div><div class="sub">2급·1급 모든 스테이지를 깼어요</div></div>';
    } else {
      el.className = won ? 'won' : '';
      var gems = st.list.map(function (x, i) { return (i === 5 ? '<span class="sep"></span>' : '') + gem(x.done); }).join('');
      el.innerHTML = '<span class="rb">EVENT</span>' +
        '<img class="em" src="' + IC + 'ev129_badge.webp" alt="">' +
        '<div class="ti"><b>' + (won ? '129회 정복 완료' : '129회 정복 챌린지') + '</b><span class="dd">' + dday() + '</span></div>' +
        '<span class="go">자세히 ›</span>' +
        '<div class="gems" aria-label="깬 스테이지 ' + st.done + '/' + st.total + '">' + gems + '<span class="n">' + st.done + '/' + st.total + '</span></div>';
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
    pull();
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
