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
          // 재생 중이었는지 기록 → 복귀 시 그 판의 BGM을 이어서 재생
          m.dataset.guardWasPlaying = (!m.paused && !m.ended) ? '1' : '';
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

  function resumeOnGesture(m) {
    var h = function () {
      document.removeEventListener('touchstart', h, true);
      document.removeEventListener('click', h, true);
      try { var p = m.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    };
    document.addEventListener('touchstart', h, true);
    document.addEventListener('click', h, true);
  }

  function restoreAll() {
    document.querySelectorAll('audio, video').forEach(function (m) {
      try {
        if (!m.getAttribute('src') && m.dataset.guardSrc) {
          m.setAttribute('src', m.dataset.guardSrc);
          m.load();
          // 이탈 시 재생 중이었다면 이어서 재생 (자동재생 차단 시 첫 터치에서 재개)
          if (m.dataset.guardWasPlaying === '1') {
            m.dataset.guardWasPlaying = '';
            var p = m.play();
            if (p && p.catch) p.catch(function () { resumeOnGesture(m); });
          }
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
