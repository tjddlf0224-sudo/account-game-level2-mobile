/* ============================================================
 *  bgm.js — 배경음악을 Web Audio(AudioContext)로 재생한다
 *  전산회계 오락실
 *
 *  ■ 왜 <audio> 를 버렸나 (2026-09-13)
 *  iOS 는 HTML5 <audio> 가 소리를 내는 순간 잠금화면·제어센터에
 *  Now Playing 플레이어를 등록한다. 문제는 그 등록을 WebKit 의
 *  **WebContent 프로세스**가 한다는 것 — 앱 프로세스에서는 지울 수 없다.
 *  pause() 도, src 를 내리는 것(옛 bgmguard.js)도, 네이티브의
 *  pauseAllMediaPlayback / MPNowPlayingInfoCenter 도 전부 소용없다.
 *  보카바리스타에서 같은 문제를 **5차까지** 싸운 끝에 내린 결론이
 *  "재생 방식을 바꿔 근원을 없앤다" 였고, 이 파일이 그 이식본이다.
 *
 *  AudioContext 는 Now Playing 에 등록하지 않는다.
 *  (이 게임들의 효과음이 이미 AudioContext 라서 안 뜨는 게 살아있는 증거다.)
 *
 *  ■ 왜 HTMLAudioElement 흉내(shim)인가
 *  5개 게임 + 원가의 길이 전부 volume/muted/paused/currentTime/playbackRate 로
 *  페이드아웃·음소거를 구현해 두었다. 재생 엔진만 바꾸고 그 코드는 그대로 두는 게
 *  건드리는 면적이 가장 작다. 각 페이지는 아래 한 줄만 바뀐다:
 *      const bgm = document.getElementById('bgm');   ← 옛날
 *      const bgm = BGMAudio.create('bgm4_factory.mp3');
 *
 *  ■ 메모리
 *  디코딩된 PCM 은 44.1kHz mono f32 기준 1분에 약 10MB다(가장 긴 분개공장
 *  139초 ≈ 23MB). 페이지마다 트랙 1개(원가의 길만 2개)라서 그대로 들고 있고,
 *  필요할 때 처음 재생되는 순간에만 받아 온다(lazy).
 * ============================================================ */
(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null;
  var tracks = [];          // 이 페이지가 만든 트랙 — 일괄 정지/복귀용
  var gestureArmed = false;

  function ac() {
    if (!ctx && AC) { try { ctx = new AC(); } catch (e) { ctx = null; } }
    return ctx;
  }

  /* iOS/브라우저 자동재생 정책: AudioContext 는 사용자 제스처 전엔 suspended 다.
     재생이 막히면 다음 터치 한 번에 다시 시도하도록 걸어 둔다(한 번만 걸린다). */
  function armGesture() {
    if (gestureArmed) return;
    gestureArmed = true;
    var evs = ['pointerdown', 'touchstart', 'click', 'keydown'];
    var h = function () {
      evs.forEach(function (e) { document.removeEventListener(e, h, true); });
      gestureArmed = false;
      var c = ac();
      if (!c) return;
      var p = c.resume(); if (p && p.catch) p.catch(function () {});
      tracks.forEach(function (t) {
        if (t._wantPlay && t._paused) { var q = t.play(); if (q && q.catch) q.catch(function () {}); }
      });
    };
    evs.forEach(function (e) { document.addEventListener(e, h, true); });
  }

  function Track(url) {
    this.src = url;
    this.loop = true;
    this._vol = 1; this._muted = false; this._rate = 1;
    this._buf = null; this._loading = null;
    this._srcNode = null; this._gain = null;
    this._paused = true;
    this._offset = 0;       // 정지 지점(초)
    this._startedAt = 0;    // ctx.currentTime 기준
    this._wantPlay = false;
    tracks.push(this);
  }

  Track.prototype._ensure = function () {
    var self = this;
    if (this._buf) return Promise.resolve(this._buf);
    if (this._loading) return this._loading;
    var c = ac();
    if (!c) return Promise.reject(new Error('no AudioContext'));
    this._loading = fetch(this.src)
      .then(function (r) { if (!r.ok) throw new Error('fetch ' + r.status); return r.arrayBuffer(); })
      .then(function (ab) {
        return new Promise(function (res, rej) {
          // 구형 사파리는 콜백형만 지원하던 시절이 있어 양쪽 다 받는다
          var p = c.decodeAudioData(ab, res, rej);
          if (p && p.then) p.then(res, rej);
        });
      })
      .then(function (buf) { self._buf = buf; self._loading = null; return buf; })
      .catch(function (e) { self._loading = null; throw e; });
    return this._loading;
  };

  Track.prototype._applyGain = function () {
    if (!this._gain) return;
    var c = ac(); if (!c) return;
    var v = this._muted ? 0 : this._vol;
    try {
      // 페이드는 50ms 간격으로 들어온다 — 30ms 램프면 지퍼 노이즈 없이 따라간다
      this._gain.gain.cancelScheduledValues(c.currentTime);
      this._gain.gain.setValueAtTime(this._gain.gain.value, c.currentTime);
      this._gain.gain.linearRampToValueAtTime(v, c.currentTime + 0.03);
    } catch (e) { try { this._gain.gain.value = v; } catch (e2) {} }
  };

  Track.prototype._start = function (buf) {
    var c = ac(); if (!c) return;
    var self = this;
    this._gain = c.createGain();
    this._gain.gain.value = this._muted ? 0 : this._vol;
    this._gain.connect(c.destination);

    var s = c.createBufferSource();
    s.buffer = buf;
    s.loop = !!this.loop;
    try { s.playbackRate.value = this._rate; } catch (e) {}
    s.connect(this._gain);

    var dur = buf.duration || 1;
    var off = this._offset % dur;
    if (!(off >= 0)) off = 0;
    s.start(0, off);
    s.onended = function () {
      if (self._srcNode !== s) return;           // 우리가 바꿔치기한 뒤의 콜백은 무시
      if (!self.loop) { self._paused = true; self._offset = 0; self._srcNode = null; }
    };
    this._srcNode = s;
    this._startedAt = c.currentTime - off / (this._rate || 1);
    this._paused = false;
  };

  Track.prototype.play = function () {
    var self = this;
    this._wantPlay = true;
    var c = ac();
    if (!c) { return Promise.reject(new Error('no AudioContext')); }
    return Promise.resolve()
      .then(function () { var p = c.resume(); return (p && p.then) ? p.catch(function () {}) : null; })
      .then(function () {
        if (c.state !== 'running') throw new Error('AudioContext suspended');
        return self._ensure();
      })
      .then(function (buf) { if (self._paused) self._start(buf); })
      .catch(function (e) { armGesture(); throw e; });
  };

  Track.prototype.pause = function () {
    this._wantPlay = false;
    if (this._paused) return;
    this._offset = this.currentTime;
    var s = this._srcNode;
    this._srcNode = null;
    this._paused = true;
    if (s) { try { s.stop(0); } catch (e) {} try { s.disconnect(); } catch (e) {} }
    if (this._gain) { try { this._gain.disconnect(); } catch (e) {} this._gain = null; }
  };

  Object.defineProperty(Track.prototype, 'paused', { get: function () { return this._paused; } });

  Object.defineProperty(Track.prototype, 'volume', {
    get: function () { return this._vol; },
    set: function (v) { v = Number(v); this._vol = Math.max(0, Math.min(1, isFinite(v) ? v : 0)); this._applyGain(); }
  });

  Object.defineProperty(Track.prototype, 'muted', {
    get: function () { return this._muted; },
    set: function (v) { this._muted = !!v; this._applyGain(); }
  });

  Object.defineProperty(Track.prototype, 'playbackRate', {
    get: function () { return this._rate; },
    set: function (v) {
      v = Number(v); this._rate = (isFinite(v) && v > 0) ? v : 1;
      if (this._srcNode) { try { this._srcNode.playbackRate.value = this._rate; } catch (e) {} }
    }
  });

  Object.defineProperty(Track.prototype, 'currentTime', {
    get: function () {
      if (this._paused) return this._offset;
      var c = ac(); if (!c) return this._offset;
      var t = (c.currentTime - this._startedAt) * (this._rate || 1);
      if (this._buf && this._buf.duration) t = t % this._buf.duration;
      return t > 0 ? t : 0;
    },
    set: function (v) {
      v = Number(v); if (!isFinite(v) || v < 0) v = 0;
      if (this._paused) { this._offset = v; return; }
      var was = this._wantPlay;
      this.pause();
      this._offset = v;
      if (was) { var p = this.play(); if (p && p.catch) p.catch(function () {}); }
    }
  });

  /* ── 앱/탭 이탈·복귀 ──
     WKWebView 에서는 visibilitychange 가 앱 백그라운드 전환 때 안 올 수 있어서
     Capacitor 의 appStateChange 와 네이티브 직접 호출(__amReleaseAudio/__amResumeAudio)
     까지 3중으로 건다. AudioContext 라 잠금화면에 남을 일은 없지만, 백그라운드에서
     소리가 계속 나거나 배터리를 먹는 건 막아야 한다. */
  function releaseAll() {
    tracks.forEach(function (t) { if (!t._paused) { t._wasPlaying = true; t.pause(); } });
    var c = ctx;
    if (c && c.state === 'running') { try { var p = c.suspend(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
  }
  function resumeAll() {
    var c = ac(); if (!c) return;
    var p = c.resume(); if (p && p.catch) p.catch(function () {});
    tracks.forEach(function (t) {
      if (t._wasPlaying) { t._wasPlaying = false; var q = t.play(); if (q && q.catch) q.catch(function () {}); }
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') releaseAll(); else resumeAll();
  });
  window.addEventListener('pagehide', releaseAll);
  window.addEventListener('pageshow', resumeAll);
  window.addEventListener('beforeunload', releaseAll);

  function bindCapacitorAppState() {
    try {
      var App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (App && App.addListener && !bindCapacitorAppState.done) {
        bindCapacitorAppState.done = true;
        App.addListener('appStateChange', function (st) { (st && st.isActive) ? resumeAll() : releaseAll(); });
      }
    } catch (e) {}
  }
  bindCapacitorAppState();
  document.addEventListener('DOMContentLoaded', bindCapacitorAppState);

  // 네이티브(AppDelegate)가 백그라운드 직전/포그라운드 직후에 직접 부른다 — 이중 보장
  window.__amReleaseAudio = releaseAll;
  window.__amResumeAudio  = resumeAll;

  window.BGMAudio = {
    create: function (url) { return new Track(url); },
    release: releaseAll,
    resume: resumeAll
  };
})();
