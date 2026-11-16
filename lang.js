/* lang.js — 한국판 / 일본판(簿記ゲーセン, www/ja/) / 미국판(www/en/) / 대만판(www/tw/) 갈림길 · 2026-11-14, 11/15 미국·대만 더함
 *
 * 성일님 "같은 앱으로 바꿔": 일본판을 한국판 앱 안에 넣는다. 일본판 사용자가 한국 허브를 한 번이라도 그리면
 * 한국 통계(daylog·growth·installref)가 찍히므로, 이 파일은 허브·로그인·1급 허브의 <head> **맨 처음**에서 읽고
 * 일본판이면 그 자리에서 location.replace 로 넘긴다(다른 스크립트가 돌기 전에).
 *
 * 순서
 *   1. 저장된 선택(am_lang = 'ko' | 'ja' | 'en' | 'tw') — 설정의 '언어' 단추가 바꾼다.
 *   2. 한국판 기록(localStorage 키 — 각 판의 'ja:'·'en:'·'tw:' 키·am_lang·공용 기기 표시는 빼고)이 있으면 → 한국판
 *      (업데이트 받은 기존 한국 사용자는 기기 언어가 무엇이든 한국판).
 *   3. 앱(네이티브)일 때만 기기 언어로(웹 사이트는 자동으로 넘기지 않는다 — 한국 사이트 방문자·애드센스 크롤러 보호,
 *      웹에서도 설정 단추로는 바꿀 수 있다):
 *        ja*                          → 일본판
 *        en-*  (en-KR 은 빼고)          → 미국판   ┐ 단, 기기 시간대가 Asia/Seoul 이면 한국판
 *        zh-TW·zh-HK·zh-MO·zh-Hant → 대만판           ┘ (영어·중국어로 쓰는 한국 사용자 보호 — 11/15 부모 추가, 팀장 ② 보고)
 *      zh-HK·zh-MO 도 대만판(11/16 성일님 "대만판으로 열기" — 번체 스토어 정보가 홍콩·마카오에도 보여서, 받으면 번체 화면이 맞음). 일본판 규칙은 3.0.18 그대로(시간대 안 봄).
 *   4. 그 밖 → 한국판.
 * 2~4 로 정해지면 am_lang 에 **넘어가기 전에** 적어 둬서 다음부터는 1 로 간다.
 *
 * window.AmLang = { get(), set(v), ask(), go(v) } — 설정 단추용(ask = 판 고르는 창 뒤 go). go 는 한국판 알림 예약(한국어)을 지우고 넘어간다
 *   (일본판 사용자에게 한국어 알림이 가지 않게. 일본판 쪽 단추도 똑같이 일본어 알림을 지우고 돌아온다).
 */
(function (global) {
  'use strict';
  var KEY = 'am_lang';
  function ls() { try { return global.localStorage; } catch (e) { return null; } }
  function get() { var s = ls(); try { return s ? s.getItem(KEY) : null; } catch (e) { return null; } }
  function put(v) { var s = ls(); try { if (s) s.setItem(KEY, v); } catch (e) {} }
  function native() {
    try { var C = global.Capacitor; return !!(C && C.isNativePlatform && C.isNativePlatform()); } catch (e) { return false; }
  }
  var ED = { ja: 'ja/index.html', en: 'en/index.html', tw: 'tw/index.html' };   // 판 → 첫 화면
  var PFX = ['ja:', 'en:', 'tw:'];                                                 // 각 판 safestore 저장 공간 머리
  function isEd(v) { return v === 'ko' || ED.hasOwnProperty(v); }
  function seoulTz() {
    try { return (Intl.DateTimeFormat().resolvedOptions().timeZone || '') === 'Asia/Seoul'; } catch (e) { return false; }
  }
  // 기기 언어로 고른 판(앱일 때만). null = 한국판
  function deviceEd() {
    if (!native()) return null;
    try {
      var l = String((global.navigator.languages && global.navigator.languages[0]) || global.navigator.language || '').replace(/_/g, '-');
      if (/^ja\b/i.test(l)) return 'ja';
      if (seoulTz()) return null;
      if (/^en\b/i.test(l)) return /-KR\b/i.test(l) ? null : 'en';
      if (/^zh-(TW|HK|MO|Hant)\b/i.test(l)) return 'tw';   // 번체(대만·홍콩·마카오), 간체 zh-CN·zh-Hans 는 한국판
    } catch (e) {}
    return null;
  }
  function decide() {
    var v = get();
    if (isEd(v)) return v;
    // 한국판 기록 = 각 판이 쓴 'ja:'·'en:'·'tw:' 키(safestore 의 판별 저장 공간)와 이 선택 키, 그리고 모든 판이 같이 쓰는 기기 표시
    //   (owner_device·am_ev_off·am_ev_force·am_env_chk — 일본판 safestore 의 공용 목록과 같음)를 뺀 나머지 키
    var DEV = { owner_device: 1, am_ev_off: 1, am_ev_force: 1, am_env_chk: 1 };
    var s = ls(), any = false;
    try { if (s) for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && k !== KEY && !DEV[k] && !PFX.some(function (p) { return k.indexOf(p) === 0; })) { any = true; break; } } } catch (e) { any = false; }
    v = any ? 'ko' : (deviceEd() || 'ko');
    put(v);
    return v;
  }
  global.AmLang = {
    get: function () { return get() || 'ko'; },
    set: function (v) { if (isEd(v)) put(v); },
    /* 설정 단추 — 판 고르는 창(계사니, ask.js 의 Ask.choose)을 띄우고 고른 판으로 넘어간다. 취소면 아무것도 안 함
       (2026-11-14 일본판 확인 창 → 11/15 미국·대만판 더해 고르기 창으로). 판 이름은 그 나라 글자로. */
    ask: async function () {
      var v = null;
      try {
        if (global.Ask && global.Ask.choose) v = await global.Ask.choose('어느 언어로 바꿀까요?', [
          { text: '日本語', value: 'ja' }, { text: 'English', value: 'en' }, { text: '繁體中文', value: 'tw' }
        ], { note: '설정에서 다시 바꿀 수 있어요' });
        else if (global.confirm('일본어판으로 바꿀까요?')) v = 'ja';
      } catch (e) { v = null; }
      if (v && ED[v]) return global.AmLang.go(v);
    },
    go: async function (v) {
      if (!ED[v]) return;
      try {
        var C = global.Capacitor, P = C && C.Plugins && C.Plugins.LocalNotifications;
        if (P) {
          var ids = [7201, 7202, 7203, 7204, 7205];   // remind.js 의 매일 알림
          try { var r = await P.getPending(); if (r && r.notifications) r.notifications.forEach(function (n) { ids.push(n.id); }); } catch (e) {}
          try { await P.cancel({ notifications: ids.map(function (id) { return { id: id }; }) }); } catch (e) {}
        }
      } catch (e) {}
      put(v);
      global.location.replace(ED[v]);
    }
  };
  // 한국판 쪽 페이지(이 파일을 읽는 곳)에서 다른 판이면 바로 넘긴다
  try {
    var d = decide();
    if (ED[d] && !/\/(ja|en|tw)\//.test(global.location.pathname)) {
      global.location.replace(ED[d]);
      // location.replace 는 바로 떠나지 않는다 — 그 사이 이 페이지의 나머지 스크립트(daylog·installref·growth…)가 돌면
      // 한국판 통계·설치 경로 키가 생긴다. 나머지 문서를 글자로 삼켜(plaintext) 더 이상 아무 스크립트도 돌지 않게 한다.
      try { global.document.write('<plaintext style="display:none">'); } catch (e) {}
    }
  } catch (e) {}
})(window);
