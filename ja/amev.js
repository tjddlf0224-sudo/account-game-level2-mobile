/* ============================================================
 *  amev.js — 익명 행동 기록(이벤트 줄) + 구글 애널리틱스(Firebase) 같은 이름으로
 *  전산회계 오락실 · 2026-11-02 신설 (팀장 지시서 ~/개발팀/넘김/팀장_행동기록_Firebase애널리틱스_2026-11-02.md)
 *
 *  왜. daylog.js 는 '하루 합계'라 어디서 앱을 끄는지·광고 본 뒤 계속하는지·어느 게임에서 몇 초 만에 그만두는지 같은
 *  '순서'를 모른다. 성일님이 나중에 물으실 때 답하려고 기기별 이벤트 줄을 하루 한 줄로 모은다.
 *
 *  누군지 모르게.
 *   · 번호는 이 기기에서 처음 켤 때 crypto.getRandomValues 로 만든 22자(am_ev_id). 앱을 다시 깔면 새 번호.
 *   · 닉네임·로그인 uid·player id·반 코드·hub_device_id(dau_events 가 이름과 같이 저장함)와 **같이 두지도 보내지도 않는다**.
 *   · 구글 애널리틱스엔 setUserId·사용자 속성을 넣지 않는다.
 *
 *  보내는 곳.
 *   B. Supabase RPC am_ev_push(p_id, p_platform, p_ver, p_ev) → 표 am_ev 의 '<KST날짜>__<번호>' 한 줄에 이어 붙임
 *      (docs/sql/2026-11-02_am_ev.sql — 읽기는 관리자만, anon 은 이 함수로 붙이기만).
 *   A. 앱이면 @capacitor-firebase/analytics logEvent — B_ONLY(quiz·act) 는 빼고 같은 이름·같은 칸.
 *  모아 두었다가 앱이 뒤로 갈 때(visibilitychange hidden) 한 번에 보낸다. 페이지를 열 때 지난 날짜 몫·5분 넘게 묵은 몫이 있으면 보낸다.
 *  보내기는 기기당 하루 20번까지(넘으면 다음 날로) — 서버도 기기·하루 24번·이벤트 1500개에서 끊는다(무료 한도 500MB).
 *
 *  끄는 경우: 웹이 localhost·127.0.0.1·file(로컬 시험) / 시험 광고판(window.__amTestAds — 구글 테스트 광고 ID) /
 *            localStorage am_ev_off='1'(개발자 기기) / owner_device='1'(성일님 폰 — 네 앱 공통 키, 11/4 분석팀
 *            ~/개발팀/넘김/분석팀_내폰_통계제외_2026-11-04.md). 설정 창 'SETTINGS' 제목을 7번 누르면 켜고 끔(아래 맨 끝). 시험 하네스는 window.__amEvForce=true 로 켜고 /rest/v1/** 를 가로챈다.
 *            실기기 DebugView 확인은 localStorage am_ev_force='1' 로 잠깐 켠다(끝나면 지우고 시험 줄 삭제).
 *
 *  이벤트(칸은 짧게, t = KST 자정부터 초):
 *   app_open{scr,cold} · app_bg{scr,sec} · screen{scr}
 *   g_start{g} · g_end{g,sec} · g_quit{g,sec,how(nav|bg)} — 게임 시작·끝·끝내지 않고 나감
 *   quiz{g,tp,ok}(B만) · act{k,v}(B만 — 시험 당일·알림 등 daylog 'act'/'remind' 의 나머지)
 *   ad_offer{place} · ad_skip{place,why} · ad_press{place} · ad_show{place} · ad_earn{place} · ad_close{place,sec}
 *   ad_fail{place,why} · ad_inter{place,res(show|gap|notready|fail)} · ad_after{place,act(play|quit|nav),sec}
 *
 *  window.AmEv.log(e, fields)
 * ============================================================ */
(function (global) {
  'use strict';
  if (global.AmEv) return;

  var URL = 'https://pjagaulfivafamhhiveg.supabase.co/rest/v1/rpc/am_ev_push';
  var KEY = 'sb_publishable_yck2tAKApEjVSJOJMVSXuQ_AGaNatuI';
  var LS_ID = 'am_ev_id', LS_BUF = 'am_ev_buf', LS_FIRST = 'am_ev_first', LS_VER = 'am_ev_ver';
  var LS_GAME = 'am_ev_game', LS_ADAFTER = 'am_ev_adafter';
  var SS_SESS = 'am_ev_sess', SS_SINCE = 'am_ev_since';
  var STALE_MS = 5 * 60 * 1000, LOCAL_CAP = 600, SEND_CAP = 300;
  /* 무료 한도 지키기(11/2 팀장): 기기당 하루 20번까지만 보낸다. 넘으면 모아 두었다가 다음 날 보낸다(서버도 24번에서 끊음) */
  var LS_SENDS = 'am_ev_sends', SENDS_PER_DAY = 20;
  var B_ONLY = { quiz: 1, act: 1 };

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { return null; }
  }
  function ss(k, v) {
    try {
      if (v === undefined) return sessionStorage.getItem(k);
      if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v);
    } catch (e) { return null; }
  }
  function kst() { return new Date(Date.now() + 9 * 3600 * 1000); }
  function day() { return kst().toISOString().slice(0, 10); }
  function secOfDay() { var d = kst(); return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds(); }
  function native() {
    try { var C = global.Capacitor; return !!(C && C.isNativePlatform && C.isNativePlatform()); } catch (e) { return false; }
  }
  function platform() {
    try { if (native()) return global.Capacitor.getPlatform() || 'android'; } catch (e) {}
    return 'web';
  }
  function page() {
    try { return (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index'; } catch (e) { return 'unknown'; }
  }

  /* 스토어 정식판이 아닌 앱(11/4 성일님 "시험판 설치할 때도 항상 숫자 세는 것에서 빠지게끔 해"):
     시험 광고판(__amTestAds — qa_public.sh 가 이 파일 맨 앞에 심음) · 디버그 빌드(Capacitor.DEBUG — 네이티브가 문서 시작 때 넣음,
     iOS 는 Debug 구성 debug.xcconfig 의 CAPACITOR_DEBUG=true 일 때만, 안드는 디버그 가능 빌드). 웹은 여기서 안 봄(체크리스트 18행). */
  function testBuild() {
    // __amTestEnv: 스토어 점검·심사 기기(안드 Firebase Test Lab·iOS sandboxReceipt) — 네이티브가 페이지 시작 전에 넣는다(2026-11-05)
    try { return !!global.__amTestAds || !!global.__amTestEnv || (native() && global.Capacitor.DEBUG === true); } catch (e) { return false; }
  }
  function forced() { return !!global.__amEvForce || ls('am_ev_force') === '1'; }
  function off() {
    if (forced()) return false;
    try {
      if (ls('am_ev_off') === '1' || ls('owner_device') === '1') return true;
      if (testBuild()) return true;
      // 앱의 웹뷰 주소도 localhost(capacitor://localhost · https://localhost)라 웹일 때만 본다
      if (!native()) {
        var h = location.hostname;
        if (!h || h === 'localhost' || h === '127.0.0.1' || location.protocol === 'file:') return true;
      }
    } catch (e) { return true; }
    return false;
  }

  /* 익명 번호 — 영문·숫자·_- 22자(분석팀 문서 id 규칙: 16자 이상) */
  function anonId() {
    var id = ls(LS_ID);
    if (id && /^[A-Za-z0-9_-]{16,64}$/.test(id)) return id;
    var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-', b = new Uint8Array(22), s = '';
    try { global.crypto.getRandomValues(b); } catch (e) { return null; }   // 안전한 난수가 없으면 보내지 않는다
    for (var i = 0; i < b.length; i++) s += abc[b[i] & 63];
    ls(LS_ID, s);
    return s;
  }

  function ver() {
    if (!native()) return 'web';
    return ls(LS_VER) || '';
  }
  try {
    if (native()) {
      var App = (global.Capacitor.Plugins || {}).App;
      if (App && App.getInfo) App.getInfo().then(function (i) { if (i && i.version) ls(LS_VER, String(i.version).slice(0, 20)); if (i && i.build) ls('am_ev_build', String(i.build).slice(0, 12)); }, function () {});
    }
  } catch (e) {}

  /* ── 구글 애널리틱스(앱만) ── */
  var fa = null, faReady = false;
  function FA() {
    if (fa || !native()) return fa;
    try { fa = (global.Capacitor.Plugins || {}).FirebaseAnalytics || null; } catch (e) { fa = null; }
    if (fa && !faReady) {
      faReady = true;
      // 시험판·개발자 기기는 수집 자체를 끈다(디버그 빌드는 네이티브 설정에서 이미 꺼짐)
      // 끈 값은 앱에 남으므로(네이티브가 기억) 끈 적이 있으면 am_fa_off 로 표시해 두고, 다시 켤 조건이면 되돌린다
      if (off()) { ls('am_fa_off', '1'); try { fa.setEnabled({ enabled: false }).catch(function () {}); } catch (e) {} }
      // 실기기 DebugView 확인 때(am_ev_force=1 을 CDP·Web Inspector 로 심음) 시험판·디버그 빌드에서도 켠다
      else if (forced() || ls('am_fa_off') === '1') { ls('am_fa_off', null); try { fa.setEnabled({ enabled: true }).catch(function () {}); } catch (e) {} }
    }
    return fa;
  }
  function faLog(e, f) {
    if (global.AmEnv && global.AmEnv.pending()) { global.AmEnv.whenReady(function () { faLog(e, f); }); return; }   // 점검 기기 판정 기다림(daylog.js AmEnv)
    if (B_ONLY[e] || off()) return;
    var a = FA();
    if (!a) return;
    try {
      var params = {};
      Object.keys(f).forEach(function (k) { params[k] = f[k]; });
      a.logEvent({ name: e, params: params }).catch(function () {});
      if (e === 'screen' && a.setCurrentScreen) a.setCurrentScreen({ screenName: f.scr }).catch(function () {});
    } catch (x) {}
  }

  // 점검 기기로 판정되면(답이 늦게 와도) 구글 애널리틱스 수집도 끈다
  try { if (global.AmEnv && global.AmEnv.pending()) global.AmEnv.whenReady(function () { if (off() && !forced()) { var a = FA(); if (a) { ls('am_fa_off', '1'); try { a.setEnabled({ enabled: false }).catch(function () {}); } catch (e) {} } } }); } catch (e) {}

  /* ── 모으기 ── */
  function load() { try { return JSON.parse(ls(LS_BUF) || '{}') || {}; } catch (e) { return {}; } }
  function save(o) {
    var empty = !Object.keys(o).length;
    ls(LS_BUF, empty ? null : JSON.stringify(o));
    if (empty) ls(LS_FIRST, null);
  }
  function clean(v) {
    if (typeof v === 'number') return isFinite(v) ? Math.round(v * 10) / 10 : 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return String(v == null ? '' : v).slice(0, 40);
  }

  function log(e, fields) {
    try {
      if (!e || off()) return;
      var f = {};
      Object.keys(fields || {}).slice(0, 6).forEach(function (k) { if (fields[k] !== undefined && fields[k] !== null) f[k] = clean(fields[k]); });
      faLog(e, f);
      var ev = { e: e, t: secOfDay() };
      Object.keys(f).forEach(function (k) { ev[k] = f[k]; });
      var o = load(), d = day();
      (o[d] = o[d] || []).push(ev);
      if (o[d].length > LOCAL_CAP) o[d] = o[d].slice(-LOCAL_CAP);   // 오래 못 보낸 기기 — 최근 것만
      save(o);
      if (!ls(LS_FIRST)) ls(LS_FIRST, String(Date.now()));
      if (o[d].length >= SEND_CAP) flush(false);
    } catch (x) {}
  }

  /* 보낸 개수만큼 앞에서 뺀다 — 보내는 동안 새로 쌓인 것은 남는다 */
  function drop(d, n) {
    var o = load();
    if (!o[d]) return;
    o[d] = o[d].slice(n);
    if (!o[d].length) delete o[d];
    save(o);
  }
  function sendsLeft() {
    var c = null; try { c = JSON.parse(ls(LS_SENDS) || 'null'); } catch (e) {}
    return (c && c.d === day()) ? SENDS_PER_DAY - (c.n || 0) : SENDS_PER_DAY;
  }
  function countSend() { ls(LS_SENDS, JSON.stringify({ d: day(), n: SENDS_PER_DAY - sendsLeft() + 1 })); }
  var busy = false;
  function flush(leaving) {
    try {
      if ((busy && !leaving) || typeof fetch !== 'function') return;
      if (global.AmEnv && global.AmEnv.pending()) { global.AmEnv.whenReady(function () { flush(leaving); }); return; }
      if (off()) { save({}); return; }
      var id = anonId(), o = load(), days = Object.keys(o).sort();
      if (!id || !days.length) return;
      days.slice(0, leaving ? 2 : 3).forEach(function (d) {
        var evs = o[d].slice(0, SEND_CAP);
        if (!evs.length || sendsLeft() <= 0) return;
        countSend();
        var opts = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY },
          body: JSON.stringify({ p_id: d + '__' + id, p_platform: platform(), p_ver: ver(), p_ev: evs })
        };
        if (leaving) {
          // 화면이 사라지는 중 — 응답을 못 기다리니 먼저 빼고 보낸다(중복보다 유실이 낫다)
          opts.keepalive = true;
          drop(d, evs.length);
          fetch(URL, opts).catch(function () {});
          return;
        }
        busy = true;
        fetch(URL, opts).then(function (r) {
          busy = false;
          if (r && r.ok) drop(d, evs.length);
        }, function () { busy = false; });
      });
    } catch (e) { busy = false; }
  }
  function dueOnOpen() {
    var o = load(), days = Object.keys(o);
    if (!days.length) return false;
    if (days.some(function (d) { return d !== day(); })) return true;
    var first = parseInt(ls(LS_FIRST) || '0', 10);
    return first > 0 && Date.now() - first > STALE_MS;
  }

  /* ── 게임 진행(끝내지 않고 나간 판) ── */
  function jget(k) { try { return JSON.parse(ls(k) || 'null'); } catch (e) { return null; } }
  function secSince(t) { return t ? Math.max(0, Math.round((Date.now() - t) / 1000)) : 0; }
  function gameStart(g) {
    var cur = jget(LS_GAME);
    if (cur && cur.g && !cur.done && cur.pg === page() && secSince(cur.t) < 3) return;   // 같은 시작이 두 번 불린 경우
    if (cur && cur.g && !cur.done) log('g_quit', { g: cur.g, sec: secSince(cur.t), how: 'nav' });
    ls(LS_GAME, JSON.stringify({ g: g, t: Date.now(), pg: page() }));
    log('g_start', { g: g });
    adAfter('play');
  }
  function gameEnd(g) {
    var cur = jget(LS_GAME);
    log('g_end', { g: g, sec: cur && cur.g === g ? secSince(cur.t) : 0 });
    ls(LS_GAME, JSON.stringify({ g: g, t: cur ? cur.t : Date.now(), pg: page(), done: 1 }));
    adAfter('play');
  }
  /* 페이지를 열 때 — 앞 페이지에서 시작만 하고 안 끝낸 판이 남았으면 '그만둠'. 다시 하기(새로고침)도 여기로 온다 */
  function gameCheckOnOpen(cold) {
    var cur = jget(LS_GAME);
    if (!cur || !cur.g) return;
    // 뒤로 간 채 앱이 닫혔으면(다음에 새로 켬) 뒤로 간 순간까지만 판 시간으로 센다
    if (!cur.done) log('g_quit', { g: cur.g, sec: cur.bgAt ? Math.max(0, Math.round((cur.bgAt - cur.t) / 1000)) : secSince(cur.t), how: cold ? 'bg' : 'nav' });
    ls(LS_GAME, null);
  }

  /* ── 광고 뒤에 무엇을 하나 ── */
  function adAfterArm(place) { ls(LS_ADAFTER, JSON.stringify({ place: place, t: Date.now() })); }
  function adAfter(act, scr) {
    var p = jget(LS_ADAFTER);
    if (!p) return;
    ls(LS_ADAFTER, null);
    var f = { place: p.place, act: act, sec: secSince(p.t) };
    if (scr) f.scr = scr;
    log('ad_after', f);
  }

  /* daylog 의 광고 사건 → 공통 이름 */
  var rwShownAt = 0;
  function fromAd(place, ev) {
    switch (ev) {
      case 'rw_offer': log('ad_offer', { place: place }); break;
      case 'rw_skip': case 'rw_expire': log('ad_skip', { place: place, why: ev.slice(3) }); break;
      case 'rw_start':
        rwShownAt = Date.now();
        log('ad_press', { place: place }); log('ad_show', { place: place }); break;
      case 'rw_earn': log('ad_earn', { place: place }); adAfterArm(place); break;
      case 'rw_close': log('ad_close', { place: place, sec: secSince(rwShownAt) }); adAfterArm(place); break;
      case 'rw_cancel': log('ad_cancel', { place: place, sec: secSince(rwShownAt) }); adAfterArm(place); break;   // 보상 전에 닫음(11/15 — 3.0.18 까지는 rw_close 로 옴)
      case 'rw_fail': case 'rw_offline': case 'rw_notready': case 'rw_free':
        // 띄우기 전에 실패(누름 → 광고 없음) / 띄운 뒤 실패를 가른다
        if (!rwShownAt || secSince(rwShownAt) > 120) log('ad_press', { place: place });
        log('ad_fail', ev === 'rw_free' ? { place: place, why: 'free', w: (function () { try { return String(window.__amRwWhy || 'na').slice(0, 12); } catch (e) { return 'na'; } })() } : { place: place, why: ev.slice(3) });
        rwShownAt = 0; break;
      case 'it_show': log('ad_inter', { place: place, res: 'show' }); adAfterArm(place); break;
      case 'it_gap': case 'it_notready': case 'it_fail': log('ad_inter', { place: place, res: ev.slice(3) }); break;
      default: break;   // it/rw_load_* 등은 하루 합계(daylog)에만
    }
  }

  /* daylog.hit 을 감싼다 — 기존 호출부를 한 줄도 안 고치고 같은 사건을 이벤트 줄로도 남긴다 */
  function hookDayLog() {
    var D = global.DayLog;
    if (!D || typeof D.hit !== 'function') return false;
    if (D.__amevHooked) return true;
    var orig = D.hit;
    D.hit = function (kind, key, event) {
      var r = orig.apply(D, arguments);
      try {
        if (kind === 'ad') fromAd(String(key || ''), String(event || ''));
        else if (kind === 'act' && event === 'start') gameStart(String(key));
        else if (kind === 'act' && event === 'finish') gameEnd(String(key));
        else if (kind === 'act' || kind === 'remind') log('act', { k: (kind === 'remind' ? 'remind_' : '') + key, v: event });
      } catch (e) {}
      return r;
    };
    D.__amevHooked = true;
    return true;
  }
  /* 이론 문항 — Growth.logTopicAttempt 를 감싼다(닉네임 없이 이론만 남김: 게임 id·단원·정답 여부) */
  function hookGrowth() {
    var G = global.Growth;
    if (!G || typeof G.logTopicAttempt !== 'function') return false;
    if (G.__amevHooked) return true;
    var orig = G.logTopicAttempt;
    G.logTopicAttempt = function (opts) {
      try { if (opts && opts.game && opts.topic) log('quiz', { g: opts.game, tp: opts.topic, ok: !!opts.correct }); } catch (e) {}
      return orig.apply(G, arguments);
    };
    G.__amevHooked = true;
    return true;
  }

  global.AmEv = {
    log: log,
    flush: flush,
    _pending: function () { return load(); },   // 시험용
    _id: anonId
  };

  /* ── 페이지 열림 ── */
  try {
    var scr = page(), cold = !ss(SS_SESS);
    /* 첫 줄에 ab(빌드 번호)·in(설치 경로)·first=1(첫 실행) — 11/15 분석팀 규격(심사·점검 기기를 앱마다 같은 규칙으로 빼려고).
       first: 익명 번호도 닉네임도 아직 없을 때만(업데이트로 온 기존 사용자는 아님). in: 안드 설치 경로 utm_source(installref 가 남김) · 없으면 상태(new/old/sent…) · iOS 'ios'.
       ab 는 App.getInfo 가 늦게 오면 첫 실행 때 빈 칸일 수 있음. 기기 아이디·닉네임은 여전히 안 넣음. */
    if (cold) {
      ss(SS_SESS, '1'); ss(SS_SINCE, String(Date.now()));
      var o0 = { scr: scr, cold: 1 }, isIos = false;
      try { isIos = global.Capacitor && global.Capacitor.getPlatform && global.Capacitor.getPlatform() === 'ios'; } catch (e) {}
      try { var ab = ls('am_ev_build'); if (ab) o0.ab = ab; } catch (e) {}
      try { o0['in'] = isIos ? 'ios' : String(ls('am_iref_src') || ls('am_iref') || 'na').slice(0, 20); } catch (e) {}
      try { if (!ls(LS_ID) && !ls('hub_nickname') && !ls('am_ev_seen')) o0.first = 1; ls('am_ev_seen', '1'); } catch (e) {}
      log('app_open', o0);
    }
    gameCheckOnOpen(cold);
    log('screen', { scr: scr });
    adAfter('nav', scr);
    var tries = 0;
    (function hook() {
      var a = hookDayLog(), b = hookGrowth();
      if (!(a && b) && ++tries < 40) setTimeout(hook, 50);
    })();
  } catch (e) {}

  /* 앱 안에서 다른 페이지로 넘어갈 때도 이 페이지는 hidden 이 된다(크롬·웹킷 모두 beforeunload → pagehide → visibilitychange 순,
     11/3 한국사 S9 실기기에서 발견 → 같은 방법). 그건 앱을 내린 게 아니니 app_bg·ad_after(quit)로 세지 않고, 보내지도 않는다
     (기기에 남겨 두면 다음 페이지가 이어서 모음 — 하루 20번 보내기를 페이지 이동에 쓰지 않게). 뒤로 가기 캐시로 되살아나면 풀어 준다. */
  var unloading = false;
  /* 앱이 띄운 창(구글·애플 로그인/재인증, 알림 권한, 추적 허용, 별점 창)이 앱을 가리는 동안도 hidden 이 올 수 있다(안드).
     앱을 내린 게 아니니 세지 않는다 — 앱이 다시 보이거나 창이 끝나고 1.5초 뒤(iOS 는 hidden 이 안 와서) 풀고, 길어도 3분이면 푼다.
     (11/3 상담일지·한국사 실기기 발견 옮김, 팀장 점검표 12b) 외부 링크로 나가는 것은 그대로 app_bg 로 센다. */
  var holdN = 0, holdAt = 0, heldHide = false;
  function held() { if (holdN > 0 && Date.now() - holdAt > 180000) holdN = 0; return holdN > 0; }
  function hold(p) {
    holdN++; holdAt = Date.now();
    var done = function () { setTimeout(function () { holdN = Math.max(0, holdN - 1); }, 1500); };
    try { Promise.resolve(p).then(done, done); } catch (e) { done(); }
    return p;
  }
  global.AmEv.hold = hold;
  try {
    global.addEventListener('beforeunload', function () { unloading = true; });
    global.addEventListener('pagehide', function () { unloading = true; });
    global.addEventListener('pageshow', function () { unloading = false; });
  } catch (e) {}
  try {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        if (unloading) return;
        if (held()) { heldHide = true; return; }
        var since = parseInt(ss(SS_SINCE) || '0', 10);
        log('app_bg', { scr: page(), sec: secSince(since) });
        var cur = jget(LS_GAME);
        if (cur && cur.g && !cur.done) { cur.bgAt = Date.now(); ls(LS_GAME, JSON.stringify(cur)); }
        if (!global.__amFullscreenAd) adAfter('quit');   // 광고가 떠 있는 동안 가려진 것은 '끔'이 아니다
        flush(true);
      } else if (document.visibilityState === 'visible') {
        if (heldHide) { heldHide = false; holdN = 0; return; }   // 우리 창이 닫히고 돌아온 것 — app_open 아님
        ss(SS_SINCE, String(Date.now()));
        log('app_open', { scr: page(), cold: 0 });
        var g = jget(LS_GAME);
        if (g && g.bgAt) { delete g.bgAt; ls(LS_GAME, JSON.stringify(g)); }   // 돌아와서 이어 하면 그 판은 계속
      }
    });
    // 시험판은 '내 폰' 표시도 켜 둔다 — 나중에 정식판을 덮어 깔아도 남아서 계속 빠진다(11/4 추가 지시, 선택 항목)
    setTimeout(function () { if (testBuild() && ls('owner_device') !== '1') ls('owner_device', '1'); FA(); if (dueOnOpen()) flush(false); }, 3000);
  } catch (e) {}

  /* ── '내 폰' 표시(owner_device) — 설정 창 'SETTINGS' 제목을 7번 연달아 누르면 켜고, 다시 7번이면 끈다 ──
     성일님 폰(스토어판)을 통계에서 빼려고(11/4 분석팀 규격). 화면에 새 단추는 없고, 바뀔 때만 짧은 안내.
     켜지면 하루 합계(daylog)·접속/판수(growth dau_events·play_events)·행동 기록·애널리틱스를 안 보낸다. 광고·게임·로그인·랭킹은 그대로. */
  var taps = 0, tapAt = 0;
  function toast(msg) {
    try {
      var el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.textContent = msg;
      el.style.cssText = 'position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483000;' +
        'background:rgba(20,24,40,.92);color:#fff;font-size:14px;padding:10px 16px;border-radius:10px;max-width:86vw;text-align:center;pointer-events:none';
      document.body.appendChild(el);
      setTimeout(function () { try { el.remove(); } catch (e) {} }, 2200);
    } catch (e) {}
  }
  function setOwner(on) {
    ls('owner_device', on ? '1' : null);
    if (on) save({});
    try { if (global.DayLog && global.DayLog._clear && on) global.DayLog._clear(); } catch (e) {}
    var a = FA();
    if (a) {
      try {
        if (off()) { ls('am_fa_off', '1'); a.setEnabled({ enabled: false }).catch(function () {}); }
        else { ls('am_fa_off', null); a.setEnabled({ enabled: true }).catch(function () {}); }
      } catch (e) {}
    }
    toast(on ? 'この端末は統計から除外されます' : 'この端末も再び統計に含まれます');
  }
  try {
    document.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest && ev.target.closest('.set-title');
      if (!t) return;
      var now = Date.now();
      taps = (now - tapAt < 1500) ? taps + 1 : 1;
      tapAt = now;
      if (taps >= 7) {
        taps = 0;
        if (testBuild() && ls('owner_device') === '1') { toast('テスト版のため引き続き統計から除外されます'); return; }
        setOwner(ls('owner_device') !== '1');
      }
    });
  } catch (e) {}
})(window);
