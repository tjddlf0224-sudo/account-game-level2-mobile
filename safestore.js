/* ============================================================
 *  safestore.js — 저장소가 막힌 환경에서도 게임이 돌아가게 한다
 *  전산회계 오락실
 *
 *  왜 만들었나. 2026-09-16 전체 검토에서 잡은 것:
 *    localStorage 를 막아 놓고(사파리 프라이빗 브라우징, '모든 쿠키 차단',
 *    학교에서 관리하는 기기의 사이트데이터 차단) 페이지를 열면
 *    **게임 5종이 전부 시작조차 안 됐다.** 시작 버튼을 눌러도 아무 일도 안 난다.
 *
 *  왜 그렇게까지 망가지나. 각 게임의 본문 <script> 블록 앞머리에서 설정을 읽으려고
 *  localStorage 를 건드린다. 막힌 환경에서는 이 접근이 **예외를 던지고**, 그러면
 *  그 <script> 블록의 **나머지가 통째로 실행되지 않는다.** 그래서 블록 뒤쪽에 있던
 *  audioCtx·GRADE_TIERS·Game 같은 것들이 아예 만들어지지 않아
 *  "Cannot access 'audioCtx' before initialization", "Game is not defined" 로 죽는다.
 *  화면은 멀쩡히 보이니 학생은 원인을 짐작할 수도 없다.
 *
 *  고치는 방법. 호출하는 자리가 수백 군데라 하나씩 try/catch 를 두르는 건 현실적이지
 *  않다. 대신 **가장 먼저 로드되는 이 파일 하나**가 저장소를 한 번 시험해 보고,
 *  못 쓰면 메모리에 담는 대체품으로 바꿔 끼운다. 나머지 코드는 그대로 두면 된다.
 *
 *  ⚠ 저장소가 멀쩡하면 이 파일은 **아무것도 하지 않는다.** 정상 환경의 동작은
 *    1바이트도 바뀌지 않는다. 대체품이 끼워진 경우에는 그 판에서만 값이 유지되고
 *    (새로고침하면 사라진다), 점수 저장 같은 서버 기능은 원래대로 동작한다.
 * ============================================================ */
(function (w) {
  'use strict';

  /* 같은 탭에서 페이지를 옮겨도 값이 남게 window.name 에 실어 둔다.
     메모리에만 두면 링크 한 번 누를 때마다 닉네임이 사라져 로그인 화면으로 되돌아간다.
     window.name 은 같은 탭 안에서 이동해도 유지되고, 이 앱은 달리 쓰지 않는다(확인함).
     탭을 닫으면 사라진다 — 저장소가 막힌 환경에서는 그게 맞는 동작이다. */
  var NAME_TAG = 'AM_SAFESTORE:';

  function loadFromName() {
    try {
      if (typeof w.name === 'string' && w.name.indexOf(NAME_TAG) === 0)
        return JSON.parse(w.name.slice(NAME_TAG.length)) || {};
    } catch (e) {}
    return {};
  }
  function saveToName(obj) {
    try { w.name = NAME_TAG + JSON.stringify(obj); } catch (e) {}
  }

  /* useName=false 면 window.name 에 싣지 않고 메모리만 쓴다(sessionStorage 용).
     ⚠ 공유 변수를 꺼서 구분하려다 localStorage 쪽까지 같이 꺼 버린 적이 있다
        — 저장 함수가 호출 시점의 값을 읽기 때문이다. 인자로 넘긴다(2026-09-16). */
  function makeMemoryStore(useName) {
    var seed = useName ? loadFromName() : {};
    var mem = Object.create(null);
    for (var k0 in seed) if (Object.prototype.hasOwnProperty.call(seed, k0)) mem[k0] = seed[k0];
    var store = {
      getItem: function (k) {
        k = String(k);
        return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
      },
      setItem: function (k, v) { mem[String(k)] = String(v); if (useName) saveToName(mem); },
      removeItem: function (k) { delete mem[String(k)]; if (useName) saveToName(mem); },
      clear: function () { mem = Object.create(null); if (useName) saveToName(mem); },
      key: function (i) { var ks = Object.keys(mem); return i < ks.length ? ks[i] : null; }
    };
    try {
      Object.defineProperty(store, 'length', { get: function () { return Object.keys(mem).length; } });
    } catch (e) { store.length = 0; }
    return store;
  }

  /* 읽기만 되고 쓰기가 막히는 환경도 있어서 **쓰기까지** 시험한다 */
  function usable(name) {
    try {
      var s = w[name];
      if (!s) return false;
      var probe = '__am_probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return true;
    } catch (e) { return false; }
  }

  function patch(name, useName) {
    if (usable(name)) return false;          // 멀쩡하면 손대지 않는다
    var store = makeMemoryStore(useName);
    try {
      Object.defineProperty(w, name, {
        configurable: true,
        get: function () { return store; }
      });
    } catch (e) {
      try { w[name] = store; } catch (e2) { return false; }
    }
    return true;
  }

  var patched = [];
  if (patch('localStorage', true)) patched.push('localStorage');
  /* sessionStorage 는 window.name 에 싣지 않는다 — localStorage 와 값이 섞인다.
     원래도 탭을 닫으면 사라지는 저장소라 메모리만으로 성격이 같다. */
  if (patch('sessionStorage', false)) patched.push('sessionStorage');

  /* 눌러서 확인할 수 있게 흔적만 남긴다(사용자에게는 안 보인다) */
  w.__AM_STORAGE_FALLBACK__ = patched.length ? patched.join(',') : null;
  if (patched.length && w.console && console.info) {
    console.info('[safestore] 브라우저 저장소가 막혀 있어 이번 판에만 유지되는 임시 저장소를 씁니다:', patched.join(', '));
  }
})(window);
