/* ⚠️ 2026-09-13부터 이 파일은 **어디서도 로드하지 않는다.**
 *
 *  BGM 을 HTML5 <audio> 로 재생하던 시절, iOS 잠금화면에 Now Playing 이
 *  남는 걸 막으려고 만든 파일이다. 결론부터: **이 방식으로는 못 막는다.**
 *  Now Playing 등록을 WebKit 의 WebContent 프로세스가 하기 때문에
 *  src 를 내려도(이 파일이 하는 일) 앱에서는 지울 수 없고, 게다가
 *  WKWebView 에서는 앱이 백그라운드로 가도 visibilitychange/pagehide 가
 *  안 와서 이 코드가 아예 실행되지 않는 경우가 많았다(2026-09-13 실기기 제보).
 *
 *  그래서 재생 방식 자체를 Web Audio(AudioContext)로 바꿔 근원을 없앴다 →
 *  **bgm.js** 를 볼 것. AudioContext 는 Now Playing 에 등록하지 않는다.
 *
 *  파일을 지우지 않고 남겨 둔 이유: 학생 브라우저에 캐시된 옛 페이지가
 *  아직 이 파일을 요청할 수 있어서다(지우면 404). 새로 쓰지 말 것.
 */
/* ============================================================
 *  bgmguard.js — 잠금화면/제어센터 미디어 플레이어 잔존 방지
 *  전산회계 오락실 (account-game-level2-mobile)
 *
 *  문제: iOS(WKWebView·Safari)에서 <audio>는 pause()해도 미디어가
 *  로드돼 있는 한 잠금화면 Now Playing 플레이어가 남는다.
 *  (네이티브 stopBGM 도 같은 방식으로 src 를 내리며, 이때 guardWasPlaying 플래그를
 *   같이 남기기로 계약돼 있다 — 안 남기면 복귀 시 재생이 안 살아난다)
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

  // 네이티브 래퍼가 포그라운드 복귀 때 직접 부를 수 있게 노출한다.
  // (제어센터/알림센터처럼 페이지가 hidden 까지 가지 않는 이탈에서는
  //  visibilitychange 가 안 와서 src 가 복원되지 않은 채 남는다)
  window.__bgmGuardRestore = restoreAll;
})();
