/* ============================================================
 *  remind.js — 하루 한 번 저녁 알림(기기 안 로컬 알림) · 2026-10-09
 *  한국사 게임 streak.js 의 Remind 를 이 앱 구조에 맞게 옮겼다.
 *
 *  왜. 다음 날(D1 29%)은 오는데 일주일 습관(D7 7%)으로 안 이어진다(분석팀 10/3).
 *  서버 푸시가 아니라 기기에 예약해 두는 알림이다 — 아무 정보도 밖으로 나가지 않는다.
 *
 *  원칙
 *   · **하루 최대 1번**, 저녁 7시. 오늘 이미 한 판 했으면 오늘 몫은 안 보낸다(내일 7시로).
 *   · 그다음 3·5·8·14일 뒤 저녁 7시에 한 번씩 — 그사이 앱을 켜면 전부 다시 밀린다(매일 오는 사람은 거의 안 받는다).
 *   · **계사니(계산기 마스코트) 알림**(2026-10-22, 개발팀 제안 #19 — 장원급제반 '엽전이' 방식):
 *     안 온 날 수에 따라 말투·그림이 세진다 — 시계(평소)/불씨(연속 2일+) → 부탁(1~2일) → 울먹(3~4) → 삐짐(5~9) → 유령(10~).
 *     제목은 날짜마다 다른 문구(같은 사람이 같은 말을 연달아 안 받게), 본문엔 D-day·오답 같은 쓸모 있는 한 줄.
 *     그림: 안드로이드 largeIcon = res/drawable-nodpi/calc_*.png(res/raw/keep.xml 로 축소 제외), iOS = www/noti/calc_*.png 를 캐시에 복사해 첨부.
 *     그림 때문에 예약이 실패하면 그림 없이 다시 건다.
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
  var HOUR = 19, IDS = [7201, 7202, 7203, 7204, 7205];

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
        var all = JSON.parse(get('hub_wrongnotes') || '{}'), u = (get('hub_nickname') || '').trim() || '訪客';
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
  function agoText(ago) { return ago === 1 ? '昨天' : ago + ' 天前'; }

  function streakInfo() {
    try { return global.Streak && Streak.state ? Streak.state() : null; } catch (e) { return null; }
  }

  /* ── 계사니 말투 — 안 온 날 수(missed)로 고른다. {연속}·{다음}·{일} 은 채워 넣는다 ── */
  var MSG = {
    clock: ['滴答滴答，計算尼來囉', '晚上7點，是計算時間', '計算尼拿著時鐘在等你', '今天來玩 1 次吧！', '計算尼的螢幕亮起來了'],
    fire:  ['連續 {連續} 天！別讓紀錄的火熄滅', '計算尼手上點著一小簇火', '今天玩 1 次就連續 {次} 天！', '累積了 {連續} 天，斷掉很可惜喔'],
    plead: ['計算尼在拜託你', '今天會來吧？', '只玩一次也好', '計算尼已經幫你選好題目了'],
    cry:   ['已經 {日} 天沒見到你了…', '計算尼的螢幕泛起淚光', '好想見你，嗚嗚', '帳對不上…一起來算吧'],
    sulk:  ['哼，不幫你算了', '計算尼鬧彆扭了', '已經 {日} 天沒見到你，帳都對不上了', '不可以假裝沒看到喔'],
    ghost: ['計算尼的電池沒電了…', '計算尼變成幽靈了', '還記得計算尼嗎？', '你沒有忘記計算尼吧？']
  };
  var BODY = {
    plead: ['10 分鐘就夠了，今天重新開始吧', '玩一次，計算尼就會笑了', '昨天沒玩也沒關係，今天再開始'],
    cry:   ['練習 10 題分錄，手感就回來了', '今天來見個面吧，玩一次就好', '今天很適合重新開始'],
    sulk:  ['…開玩笑的。玩一次就消氣了', '玩一次，計算尼就全忘了', '謝謝你看這則通知，點一下來玩吧'],
    ghost: ['玩一次，計算尼就會重新開機', '慢慢重新開始吧，10 分鐘就好', '現在重新開始也不晚']
  };
  function tierOf(missed, streak) {
    if (missed <= 0) return streak >= 2 ? 'fire' : 'clock';
    if (missed <= 2) return 'plead';
    if (missed <= 4) return 'cry';
    if (missed <= 9) return 'sulk';
    return 'ghost';
  }
  function kstNum(d) { return Math.floor((d.getTime() + 8 * 3600 * 1000) / 86400000); }   // 대만판: 대만 시간(UTC+8) 날짜 번호 — 스트릭과 같게
  function lastPlayNum() {
    var s = get('streak_last'); if (!s) return null;
    var p = s.split('-'); return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }
  function pick(arr, n) { return arr[((n % arr.length) + arr.length) % arr.length]; }
  /* offset 일 뒤 저녁 알림 하나: { title, body, tier } */
  function noteFor(offset, done) {
    var when = at(offset), dn = kstNum(when), last = lastPlayNum();
    var missed = last == null ? 0 : Math.max(0, dn - last - 1);
    var s = streakInfo(), streak = (s && s.days) || 0;
    // 연속 기록은 그날 한 판이면 이어지는 경우만 의미가 있다(missed 0)
    var tier = tierOf(missed, missed === 0 ? streak : 0);
    var v = { '連續': streak, '次': streak + 1, '日': missed };
    var fill = function (t) { return t.replace(/\{(.+?)\}/g, function (_, k) { return v[k] != null ? String(v[k]) : ''; }); };
    var title = fill(pick(MSG[tier], dn));
    var body = bodyFor(offset, done);
    if (BODY[tier]) {
      var c = global.ExamDay && ExamDay.current ? ExamDay.current() : null, left = c ? c.days - offset : -1;
      body = pick(BODY[tier], dn) + (left > 0 && left <= 60 ? ' · 距離考試還有 ' + left + ' 天' : '');
    }
    return { title: title, body: body, tier: tier };
  }
  function platformName() { try { return global.Capacitor.getPlatform(); } catch (e) { return ''; } }
  /* iOS 첨부 — 시스템이 첨부 파일을 옮겨 가므로 알림마다 캐시에 사본을 만든다(장원급제반과 같은 방식). 실패하면 그림 없이 */
  async function attachIos(list) {
    var FS = global.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Filesystem;
    if (platformName() !== 'ios' || !FS) return;
    var b64 = {};
    for (var i = 0; i < list.length; i++) {
      var it = list[i], k = it.extra && it.extra.tier; if (!k) continue;
      try {
        if (!b64[k]) {
          var blob = await (await fetch('../noti/calc_' + k + '.png')).blob();
          b64[k] = await new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1]); }; r.onerror = no; r.readAsDataURL(blob); });
        }
        var w = await FS.writeFile({ path: 'noti/n' + it.id + '.png', data: b64[k], directory: 'CACHE', recursive: true });
        it.attachments = [{ id: 'calc', url: w.uri }];
      } catch (e) {}
    }
  }

  /* offset 일 뒤 저녁에 보낼 한 줄 */
  function bodyFor(offset, playedToday) {
    var c = global.ExamDay && ExamDay.current ? ExamDay.current() : null;
    var due = dueWrongs(offset);
    if (c) {
      var left = c.days - offset;
      if (left > 0 && left <= 60) {
        var md = (c.d.getMonth() + 1) + '/' + c.d.getDate();
        return md + ' 距離考試還有 ' + left + ' 天' + (due ? ' · 從' + agoText(due.ago) + '答錯的 ' + due.n + ' 題開始' : ' · 今天玩一次就夠了');
      }
      if (left === 0) return '今天考試！平常累積的實力就夠了！';
    }
    if (due) return agoText(due.ago) + '答錯的 ' + due.n + ' 題 — 現在重做會記得更久';
    var s = streakInfo();
    // 연속 기록은 '그날 한 판이면 이어지는' 경우에만: 오늘 아직(오늘 저녁 몫) 또는 오늘 했음(내일 저녁 몫)
    if (s && s.days > 0 && ((offset === 0 && !playedToday) || (offset === 1 && playedToday))) {
      return '連續 ' + s.days + ' 天！今天玩一次就連續 ' + (s.days + 1) + ' 天';
    }
    return offset >= 7 ? '練習 10 題分錄，5 分鐘手感就回來' : '今天玩一次，10 分鐘就夠了';
  }

  function playedToday() {
    var s = streakInfo();
    if (s && typeof s.doneToday === 'boolean') return s.doneToday;
    try {
      var last = get('streak_last'), t = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
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
      var done = playedToday(), offs = [];
      if (!done && at(0).getTime() > Date.now() + 10 * 60 * 1000) offs.push(0); else offs.push(1);
      offs.push(3, 5, 8, 14);
      var android = platformName() === 'android';
      var list = offs.map(function (o, i) {
        var n = noteFor(o, done);
        var it = { id: IDS[i], title: n.title, body: n.body, schedule: { at: at(o), allowWhileIdle: true }, extra: { src: 'daily', tier: n.tier } };
        if (android) it.largeIcon = 'calc_' + n.tier;
        return it;
      });
      await attachIos(list);
      try { await P.schedule({ notifications: list }); }
      catch (e1) {   // 그림 때문에 실패했을 수 있다 — 그림 빼고 한 번 더
        list.forEach(function (it) { delete it.attachments; delete it.largeIcon; });
        await P.schedule({ notifications: list });
      }
      return true;
    } catch (e) { return false; }
  }
  async function turnOn() {
    var P = plugin(); if (!P) return false;
    try {
      var perm = await P.checkPermissions();
      if (perm.display !== 'granted') perm = await (window.AmEv && window.AmEv.hold ? window.AmEv.hold(P.requestPermissions()) : P.requestPermissions());   // 권한 창은 app_bg 아님(amev.js)
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
    var yes = await Ask.confirm('晚上7點要讓計算尼提醒你嗎？\n會通知距離考試的天數和要複習的題目。', { ok: '開啟通知', cancel: '先不要', face: 'clock', note: '可以隨時在設定(齒輪)中關閉' });
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
    function paint() { b.querySelector('.set-label').textContent = '晚間通知(7點) ' + (isOn() ? '開' : '關'); b.classList.toggle('muted', !isOn()); }
    b.addEventListener('click', async function () {
      if (isOn()) await turnOff();
      else {
        set(K_ASKED, '1');
        var ok = await turnOn();
        if (!ok && global.Ask) Ask.alert('通知權限目前是關閉的。\n請到裝置的設定 > 應用程式 > 會計電玩館 > 通知，開啟通知。');
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

  global.Remind = { can: can, isOn: isOn, turnOn: turnOn, turnOff: turnOff, schedule: schedule, offerOnce: offerOnce, dueWrongs: dueWrongs, mountSetting: mountSetting, _bodyFor: bodyFor, _noteFor: noteFor, _tierOf: tierOf, _attachIos: attachIos };
})(window);
