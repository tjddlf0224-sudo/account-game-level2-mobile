/* ============================================================
 *  stagebgm.js — 1급 스테이지(자본의 제왕·전표의 눈·신고의 문·배관의 방) 배경음악
 *  2026-10-01 신설. 그 전까지 이 네 스테이지는 음악이 아예 없었다.
 *
 *  재생 엔진은 bgm.js(Web Audio — iOS 잠금화면 Now Playing 이 안 뜬다)를 그대로 쓰고,
 *  2급 게임들이 페이지마다 따로 들고 있던 재생·페이드·음소거 코드를 한 곳에 모았다.
 *
 *  규칙(2급 게임·원가의 길과 같다)
 *  - 이 화면 전용 키(<이름>_muted)가 있으면 그것, 없으면 허브 전역 토글(hub_muted).
 *  - 게임을 시작하면 재생(StageBGM.play), 결과 화면에서 페이드아웃(StageBGM.stop).
 *  - 시작화면으로 돌아오면(body.home-mode) 멈춘다 — 차근차근 모드를 나올 때도 여기서 걸린다.
 *  - 헤더의 🎵 버튼(#mute-btn)이 StageBGM.toggle() 을 부른다.
 *
 *    <script src="bgm.js"></script>
 *    <script src="stagebgm.js"></script>
 *    StageBGM.init('bgm_lv1_vat.mp3', 'vat_muted');
 * ============================================================ */
(function () {
  'use strict';
  var VOL = 0.5;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var S = {
    track: null, key: '', muted: false, fadeTimer: null,

    init: function (file, key) {
      this.key = key;
      var own = get(key);
      this.muted = own !== null ? own === 'true' : get('hub_muted') === 'true';
      if (window.BGMAudio) {
        this.track = BGMAudio.create(file);
        this.track.volume = VOL;
      }
      this.apply();
      // 시작화면으로 돌아오면 멈춘다(그만·차근차근 나가기·다시 시작화면)
      var self = this;
      try {
        new MutationObserver(function () {
          if (document.body.classList.contains('home-mode')) self.stop(true);
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      } catch (e) {}
    },

    apply: function () {
      if (this.track) this.track.muted = this.muted;
      var b = document.getElementById('mute-btn');
      if (b) {
        b.textContent = this.muted ? '🔇' : '🎵';
        b.classList.toggle('muted', this.muted);
        b.setAttribute('aria-pressed', this.muted ? 'true' : 'false');
      }
    },

    /* 사용자 조작(시작 버튼) 안에서 부른다 — 자동재생 정책. 막히면 bgm.js 가 다음 터치에 다시 시도한다. */
    play: function () {
      var t = this.track;
      if (!t) return;
      if (this.fadeTimer) { clearInterval(this.fadeTimer); this.fadeTimer = null; }
      t.volume = VOL;
      if (t.paused) { var p = t.play(); if (p && p.catch) p.catch(function () {}); }
    },

    /* 결과 화면 — 0.5초 페이드아웃 뒤 처음으로 감는다. now=true 면 바로 멈춘다. */
    stop: function (now) {
      var t = this.track;
      if (!t) return;
      /* 아직 곡을 받는 중이면 paused 로 보이지만 '받으면 재생' 예약이 걸려 있다 — pause() 로 그 예약까지 지운다.
         (안 지우면 결과 화면이 뜬 뒤에 음악이 뒤늦게 시작한다) */
      if (t.paused) { try { t.pause(); t.currentTime = 0; } catch (e) {} return; }
      if (this.fadeTimer) { clearInterval(this.fadeTimer); this.fadeTimer = null; }
      var done = function () { try { t.pause(); t.currentTime = 0; t.volume = VOL; } catch (e) {} };
      if (now) return done();
      var self = this;
      this.fadeTimer = setInterval(function () {
        if (t.volume > 0.05) t.volume = Math.max(0, t.volume - 0.05);
        else { clearInterval(self.fadeTimer); self.fadeTimer = null; done(); }
      }, 25);
    },

    toggle: function () {
      this.muted = !this.muted;
      set(this.key, String(this.muted));
      this.apply();
    }
  };

  window.StageBGM = S;
})();
