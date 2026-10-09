/* ============================================================
 *  remind.js — 하루 한 번 저녁 알림(기기 안 로컬 알림) · 2026-10-09
 *  한국사 게임 streak.js 의 Remind 를 이 앱 구조에 맞게 옮겼다.
 *
 *  왜. 다음 날(D1 29%)은 오는데 일주일 습관(D7 7%)으로 안 이어진다(분석팀 10/3).
 *  서버 푸시가 아니라 기기에 예약해 두는 알림이다 — 아무 정보도 밖으로 나가지 않는다.
 *
 *  원칙
 *   · **하루 최대 1번**, 저녁 7시. 오늘 이미 한 판 했으면 오늘 몫은 안 보낸다(내일 7시로).
 *   · 그다음 3일 뒤·7일 뒤 저녁 7시에 한 번씩 — 그사이 앱을 켜면 전부 다시 밀린다(매일 오는 사람은 거의 안 받는다).
 *   · 문구는 죄책감이 아니라 앞으로: D-day → 1·3·7일 전 오답 → 연속 기록 순으로 하나만.
 *   · 권한은 **첫 판을 끝낸 뒤** 허브에서 한 번만 묻는다(첫 화면에서 묻지 않는다). 거절하면 다시 안 묻는다.
 *   · 끄기: 허브 ⚙️ 설정의 '저녁 알림' 줄.
 *  웹(브라우저)엔 플러그인이 없어 아무것도 안 한다.
 *
 *  window.Remind
 * ============================================================ */
(function (global) {
  'use strict';
  var K_ON = 'am_remind_on', K_ASKED = 'am_remind_asked', K_PLAYED = 'am_played_once';
  var HOUR = 19, IDS = [7201, 7202, 7203];
  var TITLE = '전산회계 오락실';

  function plugin() {
    try {
      var C = global.Capacitor;
      return (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.LocalNotifications) || null;
    } catch (e) { return null; }
  }
  function can() { return !!plugin(); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function isOn() { return get(K_ON) === '1'; }
  var paintRow = function () {};   // 설정 줄이 붙어 있으면 켜짐/꺼짐을 다시 그린다
  function hit(ev) { try { if (global.DayLog) DayLog.hit('remind', 'daily', ev); } catch (e) {} }

  function at(daysFromToday) { var d = new Date(); d.setDate(d.getDate() + daysFromToday); d.setHours(HOUR, 0, 0, 0); return d; }
  function day0(offset) { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + (offset || 0)); return d; }

  /* 그날(오늘+offset) 기준 1·3·7일 전에 틀린 문제 수 — { ago, n } 중 가장 가까운 것, 없으면 null.
     ts 는 기기 시간(ms). 오답노트(WrongNote)가 없는 화면이면 기기 저장소에서 직접 읽는다. */
  function dueWrongs(offset, items) {
    try {
      if (!items) {
        var all = JSON.parse(get('hub_wrongnotes') || '{}'), u = (get('hub_nickname') || '').trim() || '게스트';
        var b = all[u] || {}; items = Object.keys(b).map(function (k) { return b[k]; });
      }
      var base = day0(offset).getTime(), cnt = {};
      items.forEach(function (r) {
        if (!r || !r.ts) return;
        var d = new Date(r.ts); d.setHours(0, 0, 0, 0);
        var ago = Math.round((base - d.getTime()) / 86400000);
        if (ago === 1 || ago === 3 || ago === 7) cnt[ago] = (cnt[ago] || 0) + 1;
      });
      for (var i = 0, a = [1, 3, 7]; i < a.length; i++) if (cnt[a[i]]) return { ago: a[i], n: cnt[a[i]] };
    } catch (e) {}
    return null;
  }
  function agoText(ago) { return ago === 1 ? '어제' : ago + '일 전에'; }

  function streakInfo() {
    try { return global.Streak && Streak.state ? Streak.state() : null; } catch (e) { return null; }
  }

  /* offset 일 뒤 저녁에 보낼 한 줄 */
  function bodyFor(offset, playedToday) {
    var c = global.ExamDay && ExamDay.current ? ExamDay.current() : null;
    var due = dueWrongs(offset);
    if (c) {
      var left = c.days - offset;
      if (left > 0 && left <= 60) {
        var md = (c.d.getMonth() + 1) + '/' + c.d.getDate();
        return md + ' 시험까지 D-' + left + (due ? ' · ' + agoText(due.ago) + ' 틀린 문제 ' + due.n + '개부터' : ' · 오늘 한 판이면 충분해요');
      }
      if (left === 0) return '오늘 시험이에요. 그동안 쌓은 만큼 충분해요!';
    }
    if (due) return agoText(due.ago) + ' 틀린 문제 ' + due.n + '개 — 지금 다시 풀면 오래 기억돼요';
    var s = streakInfo();
    // 연속 기록은 '그날 한 판이면 이어지는' 경우에만: 오늘 아직(오늘 저녁 몫) 또는 오늘 했음(내일 저녁 몫)
    if (s && s.days > 0 && ((offset === 0 && !playedToday) || (offset === 1 && playedToday))) {
      return '연속 ' + s.days + '일째! 오늘 한 판이면 ' + (s.days + 1) + '일';
    }
    return offset >= 7 ? '분개 10문제, 5분이면 감 다시 잡아요' : '오늘 한 판, 10분이면 충분해요';
  }

  function playedToday() {
    var s = streakInfo();
    if (s && typeof s.doneToday === 'boolean') return s.doneToday;
    try {
      var last = get('streak_last'), t = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      return last === t;
    } catch (e) { return false; }
  }

  async function clear() {
    var P = plugin(); if (!P) return;
    try { await P.cancel({ notifications: IDS.map(function (id) { return { id: id }; }) }); } catch (e) {}
  }
  async function schedule() {
    var P = plugin(); if (!P || !isOn()) return false;
    try {
      var perm = await P.checkPermissions();
      if (!perm || perm.display !== 'granted') return false;
      await clear();
      var done = playedToday(), list = [];
      if (!done && at(0).getTime() > Date.now() + 10 * 60 * 1000) list.push({ id: IDS[0], when: at(0), body: bodyFor(0, false) });
      else list.push({ id: IDS[0], when: at(1), body: bodyFor(1, done) });
      list.push({ id: IDS[1], when: at(3), body: bodyFor(3, done) });
      list.push({ id: IDS[2], when: at(7), body: bodyFor(7, done) });
      await P.schedule({ notifications: list.map(function (x) {
        return { id: x.id, title: TITLE, body: x.body, schedule: { at: x.when, allowWhileIdle: true }, extra: { src: 'daily' } };
      }) });
      return true;
    } catch (e) { return false; }
  }
  async function turnOn() {
    var P = plugin(); if (!P) return false;
    try {
      var perm = await P.checkPermissions();
      if (perm.display !== 'granted') perm = await P.requestPermissions();
      if (perm.display !== 'granted') { set(K_ON, '0'); hit('denied'); return false; }
      set(K_ON, '1'); hit('on'); paintRow();
      await schedule();
      return true;
    } catch (e) { return false; }
  }
  async function turnOff() { set(K_ON, '0'); hit('off'); paintRow(); await clear(); }

  /* 첫 판을 끝낸 뒤 허브에서 한 번만 권한다 */
  async function offerOnce() {
    if (!can() || isOn() || get(K_ASKED) === '1' || get(K_PLAYED) !== '1') return false;
    if (!(global.Ask && Ask.confirm)) return false;
    set(K_ASKED, '1'); hit('asked');
    var yes = await Ask.confirm('하루 한 번, 저녁 7시에 알려 드릴까요?\n시험 D-day와 다시 볼 오답을 짧게 알려 드려요.\n허브 오른쪽 위 톱니바퀴(설정)에서 언제든 끌 수 있어요.', { ok: '알림 받기', cancel: '괜찮아요' });
    if (yes) await turnOn();
    return true;
  }

  /* 허브 ⚙️ 설정에 '저녁 알림' 줄을 붙인다(배경음악 줄 바로 아래). 앱에서만 */
  function mountSetting() {
    if (!can()) return;
    var anchor = document.getElementById('hub-mute-btn');
    if (!anchor || document.getElementById('remind-btn')) return;
    var b = document.createElement('button');
    b.className = 'set-item'; b.id = 'remind-btn';
    b.innerHTML = '<span class="set-ico">🔔</span><span class="set-label"></span>';
    function paint() { b.querySelector('.set-label').textContent = '저녁 알림(7시) ' + (isOn() ? '켜짐' : '꺼짐'); b.classList.toggle('muted', !isOn()); }
    b.addEventListener('click', async function () {
      if (isOn()) await turnOff();
      else {
        set(K_ASKED, '1');
        var ok = await turnOn();
        if (!ok && global.Ask) Ask.alert('알림 권한이 꺼져 있어요.\n휴대폰 설정 > 앱 > 전산회계 오락실 > 알림에서 켜 주세요.');
      }
      paint();
    });
    paint(); paintRow = paint;
    anchor.parentNode.insertBefore(b, anchor.nextSibling);
  }

  /* 한 판 끝(Growth.record) — '한 판이라도 했다' 표시 + 알림 다시 걸기(오늘 몫 → 내일로 밀림) */
  (function hookRecord() {
    var tries = 0;
    function tryHook() {
      var G = global.Growth;
      if (!G || typeof G.record !== 'function') return false;
      if (G.__remindHooked) return true;
      var orig = G.record;
      G.record = function () {
        var r = orig.apply(G, arguments);
        try { set(K_PLAYED, '1'); setTimeout(schedule, 300); } catch (e) {}
        return r;
      };
      G.__remindHooked = true;
      return true;
    }
    if (!tryHook()) { var t = setInterval(function () { if (tryHook() || ++tries > 40) clearInterval(t); }, 50); }
  })();

  /* 알림을 눌러 들어왔는지 */
  (function listenTap() {
    var P = plugin(); if (!P || !P.addListener) return;
    try { P.addListener('localNotificationActionPerformed', function (a) { if (a && a.notification && IDS.indexOf(a.notification.id) >= 0) hit('opened'); }); } catch (e) {}
  })();

  // 앱을 켤 때마다 다시 건다(날짜가 밀린다)
  function boot() { mountSetting(); setTimeout(schedule, 1200); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  global.Remind = { can: can, isOn: isOn, turnOn: turnOn, turnOff: turnOff, schedule: schedule, offerOnce: offerOnce, dueWrongs: dueWrongs, mountSetting: mountSetting, _bodyFor: bodyFor };
})(window);
