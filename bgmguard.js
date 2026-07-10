/* ============================================================
 *  bgmguard.js — 잠금화면/제어센터 미디어 플레이어 잔존 방지
 *  전산회계 오락실 (account-game-level2-mobile)
 *
 *  문제: iOS(WKWebView·Safari)에서 <audio>는 pause()해도 미디어가
 *  로드돼 있는 한 잠금화면 Now Playing 플레이어가 남는다.
 *  (네이티브 stopBGM은 pause+되감기만 하므로 "0:00 일시정지"로 잔존)
 *
 *  해결: 화면이 숨겨질 때(백그라운드/잠금/페이지 이탈) src를 내려서
 *  미디어 리소스를 해제 → 잠금화면 플레이어 즉시 제거.
 *  다시 보이면 src 복원(HTTP 캐시라 재로드 빠름). 게임 쪽 bgmPlay()
 *  수정 불필요 — 복원은 visible/pageshow에서 자동으로 끝나 있다.
 * ============================================================ */
(function () {
  'use strict';

  function unloadAll() {
    document.querySelectorAll('audio, video').forEach(function (m) {
      try {
        var src = m.getAttribute('src');
        if (src) {
          m.dataset.guardSrc = src;
          m.pause();
          m.removeAttribute('src');
          m.load();   // 리소스 해제 → Now Playing 항목 제거
        }
      } catch (e) {}
    });
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      } catch (e) {}
    }
  }

  function restoreAll() {
    document.querySelectorAll('audio, video').forEach(function (m) {
      try {
        if (!m.getAttribute('src') && m.dataset.guardSrc) {
          m.setAttribute('src', m.dataset.guardSrc);
          m.load();   // 재생은 하지 않음 — 게임의 bgmPlay()가 결정
        }
      } catch (e) {}
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') unloadAll();
    else restoreAll();
  });
  window.addEventListener('pagehide', unloadAll);
  window.addEventListener('pageshow', restoreAll);
})();
