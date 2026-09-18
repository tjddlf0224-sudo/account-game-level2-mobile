/* ============================================================
 *  celebrate.js — 팀전 우승 발표 연출(전광판 board.html · 결과 result.html 공용)
 *  2026-09-18 사용자 요청: "팀전에서 우승했을 때 팡파레와 꽃가루… 사진 찍을거야"
 *
 *  · 버튼을 누르면: 두구두구(약 2.2초) → "우승 ○○모둠" + 팡파레 + 심벌 + 꽃가루
 *  · 꽃가루는 **닫을 때까지 계속** 떨어진다(사진 찍는 동안 멈추면 안 된다)
 *  · 소리는 파일 없이 Web Audio 로 합성 — 저작권·용량 걱정 없음.
 *    브라우저는 사람이 누르기 전 소리를 막으므로 자동 재생하지 않고 버튼으로 시작한다.
 *  · 닫기: 오른쪽 위 ✕ 또는 ESC. 화면 아무 데나 눌러서는 안 닫힌다(사진 찍다 실수로 닫힘 방지).
 *
 *  사용: Celebrate.button(host, getResult)
 *        getResult() → TeamScore.compute 결과(R). R.teams[0] 가 우승, R.growTeams[0] 가 성장상.
 * ============================================================ */
(function (global) {
  'use strict';

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* ── 소리 ─────────────────────────────────────────────── */
  var AC = null;
  function ac() {
    if (!AC) { try { AC = new (global.AudioContext || global.webkitAudioContext)(); } catch (e) { AC = null; } }
    if (AC && AC.state === 'suspended') AC.resume();
    return AC;
  }
  function noiseBuf(ctx, sec) {
    var b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  /* 두구두구 — 스네어 타격을 점점 빠르게 */
  function drumroll(sec) {
    var ctx = ac(); if (!ctx) return;
    var t0 = ctx.currentTime + 0.05, t = 0, gap = 0.11, buf = noiseBuf(ctx, 0.2);
    while (t < sec) {
      var s = ctx.createBufferSource(); s.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
      var g = ctx.createGain(), at = t0 + t, vol = 0.25 + 0.5 * (t / sec);
      g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
      s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(at); s.stop(at + 0.1);
      t += gap; gap = Math.max(0.035, gap * 0.94);
    }
  }
  function cymbal(at) {
    var ctx = ac(); if (!ctx) return;
    var s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx, 2.5);
    var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
    var g = ctx.createGain(); g.gain.setValueAtTime(0.5, at); g.gain.exponentialRampToValueAtTime(0.001, at + 2.4);
    s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(at); s.stop(at + 2.5);
  }
  /* 금관 한 음 — 톱니파 3개 살짝 어긋나게 + 저역통과로 둥글게 */
  function brass(freq, at, dur, vol) {
    var ctx = ac(); if (!ctx) return;
    var out = ctx.createGain(); out.gain.setValueAtTime(0.0001, at);
    out.gain.exponentialRampToValueAtTime(vol, at + 0.04);
    out.gain.setValueAtTime(vol, at + Math.max(0.05, dur - 0.08));
    out.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, at);
    lp.frequency.linearRampToValueAtTime(2600, at + 0.08); lp.Q.value = 2;
    [-6, 0, 7].forEach(function (cents) {
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = cents;
      o.connect(lp); o.start(at); o.stop(at + dur + 0.02);
    });
    lp.connect(out); out.connect(ctx.destination);
  }
  /* 빰 빰 빰 빠~밤! (G4 G4 G4 C5 — E5 G5… C6) */
  function fanfare() {
    var ctx = ac(); if (!ctx) return;
    var t = ctx.currentTime + 0.05, N = { G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };
    var seq = [['G4', .14], ['G4', .14], ['G4', .14], ['C5', .55], ['G4', .18], ['C5', .18], ['E5', .18], ['G5', .45], ['E5', .18], ['G5', .18], ['C6', 1.4]];
    seq.forEach(function (n) { brass(N[n[0]], t, n[1] * 0.95, 0.16); brass(N[n[0]] / 2, t, n[1] * 0.95, 0.07); t += n[1]; });
    cymbal(ctx.currentTime + 0.05);
    cymbal(t - 1.4);
  }

  /* ── 꽃가루 ───────────────────────────────────────────── */
  var COLORS = ['#ffd24a', '#ff5c8a', '#4fd1ff', '#7cf28a', '#b88bff', '#ff9f43', '#ffffff'];
  function confetti(canvas) {
    var ctx = canvas.getContext('2d'), ps = [], raf = 0, alive = true;
    function size() { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; }
    size(); addEventListener('resize', size);
    function add(n, burst) {
      for (var i = 0; i < n; i++) {
        var W = canvas.width, H = canvas.height, d = devicePixelRatio;
        ps.push({
          x: burst ? W * (0.5 + (Math.random() - 0.5) * 0.3) : Math.random() * W,
          y: burst ? H * 0.55 : -20 * d - Math.random() * H * 0.3,
          vx: burst ? (Math.random() - 0.5) * 22 * d : (Math.random() - 0.5) * 1.5 * d,
          vy: burst ? -(10 + Math.random() * 16) * d : (1.5 + Math.random() * 2.5) * d,
          w: (7 + Math.random() * 9) * d, h: (10 + Math.random() * 14) * d,
          r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
          sw: Math.random() * 6.28, c: COLORS[(Math.random() * COLORS.length) | 0],
          circle: Math.random() < 0.25
        });
      }
    }
    add(260, true);
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function step() {
      if (!alive) return;
      var H = canvas.height, d = devicePixelRatio;
      if (ps.length < (reduce ? 120 : 420)) add(reduce ? 2 : 6, false);   // 계속 내린다
      ctx.clearRect(0, 0, canvas.width, H);
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        p.vy += 0.18 * d; if (p.vy > 3.4 * d) p.vy = 3.4 * d;                // 공기 저항 흉내
        p.vx *= 0.985; p.sw += 0.06; p.x += p.vx + Math.sin(p.sw) * 0.8 * d; p.y += p.vy; p.r += p.vr;
        if (p.y > H + 40 * d) { ps.splice(i, 1); continue; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        if (p.circle) { ctx.beginPath(); ctx.arc(0, 0, p.w * 0.45, 0, 6.28); ctx.fill(); }
        else { ctx.scale(1, Math.abs(Math.cos(p.sw))); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        ctx.restore();
      }
      raf = requestAnimationFrame(step);
    }
    step();
    return { burst: function () { add(220, true); }, stop: function () { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', size); } };
  }

  /* ── 화면 ─────────────────────────────────────────────── */
  var CSS = '' +
    '#cel{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
      'background:radial-gradient(ellipse at 50% 42%,#4a3208 0%,#1a1204 45%,#07060a 100%);font-family:inherit;color:#fff;overflow:hidden}' +
    '#cel canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3}' +
    '#cel .rays{position:absolute;inset:-50%;background:repeating-conic-gradient(from 0deg,rgba(255,210,74,.10) 0deg 8deg,transparent 8deg 18deg);' +
      'animation:celspin 40s linear infinite;opacity:0;transition:opacity 1s;z-index:1}' +
    '#cel.show .rays{opacity:1}' +
    '@keyframes celspin{to{transform:rotate(360deg)}}' +
    '#cel .box{position:relative;z-index:2;text-align:center;padding:4vmin}' +
    '#cel .roll{font-size:9vmin;font-weight:900;letter-spacing:.1em;color:#ffd24a;animation:celpulse .18s ease-in-out infinite alternate}' +
    '@keyframes celpulse{from{transform:scale(1)}to{transform:scale(1.06)}}' +
    '#cel .win{display:none}' +
    '#cel.show .roll{display:none}#cel.show .win{display:block;animation:celpop .7s cubic-bezier(.2,1.6,.4,1) both}' +
    '@keyframes celpop{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}' +
    '#cel .trophy{font-size:16vmin;line-height:1;filter:drop-shadow(0 0 3vmin rgba(255,210,74,.8))}' +
    '#cel .ttl{font-size:17vmin;font-weight:900;line-height:1.05;letter-spacing:.08em;' +
      'background:linear-gradient(180deg,#fff6c9 0%,#ffd24a 45%,#e39b12 100%);-webkit-background-clip:text;background-clip:text;color:transparent;' +
      'filter:drop-shadow(0 .6vmin 0 rgba(0,0,0,.35))}' +
    '#cel .team{font-size:8.5vmin;font-weight:900;margin-top:1vmin}' +
    '#cel .mem{font-size:3.6vmin;color:rgba(255,255,255,.85);margin-top:1.6vmin;line-height:1.5}' +
    '#cel .sc{display:inline-block;margin-top:2.2vmin;padding:.8vmin 3vmin;border-radius:99px;border:.3vmin solid rgba(255,210,74,.7);' +
      'font-size:3.4vmin;font-weight:800;color:#ffd24a;background:rgba(0,0,0,.25)}' +
    '#cel .grow{margin-top:3vmin;font-size:2.8vmin;color:rgba(255,255,255,.75)}' +
    '#cel .grow b{color:#7cf28a}' +
    '#cel .ctl{position:absolute;top:2vmin;right:2vmin;z-index:4;display:flex;gap:1.2vmin}' +
    '#cel .ctl button{width:6.5vmin;height:6.5vmin;min-width:40px;min-height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.3);' +
      'background:rgba(0,0,0,.35);color:#fff;font-size:3vmin;cursor:pointer}' +
    '#cel .ctl button:focus-visible{outline:3px solid #ffd24a;outline-offset:2px}' +
    '.cel-btn{border:0;border-radius:99px;padding:.55em 1.2em;font-weight:900;cursor:pointer;font-size:inherit;' +
      'background:linear-gradient(135deg,#ffe27a,#f2a81d);color:#3a2400;box-shadow:0 0 18px rgba(255,200,60,.45)}' +
    '.cel-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}';

  function injectCss() {
    if (document.getElementById('cel-css')) return;
    var st = document.createElement('style'); st.id = 'cel-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  var open = null;
  function show(R) {
    if (open) return;
    injectCss();
    var win = R && R.teams && R.teams[0];
    if (!win) { alert('아직 팀 점수가 없어요.'); return; }
    var gw = R.growTeams && R.growTeams[0];
    var el = document.createElement('div'); el.id = 'cel';
    el.innerHTML =
      '<div class="rays"></div><canvas></canvas>' +
      '<div class="ctl"><button type="button" data-a="again" title="팡파레 다시" aria-label="팡파레 다시">🔊</button>' +
      '<button type="button" data-a="close" title="닫기 (ESC)" aria-label="닫기">✕</button></div>' +
      '<div class="box"><div class="roll">두구두구두구…</div>' +
      '<div class="win"><div class="trophy">🏆</div><div class="ttl">우승</div>' +
      '<div class="team">' + esc(win.name) + '</div>' +
      '<div class="mem">' + esc(win.members.map(function (m) { return m.name; }).join('  ·  ')) + '</div>' +
      '<div class="sc">팀 점수 ' + Number(win.score).toLocaleString() + '</div>' +
      (gw && gw.score > 0 ? '<div class="grow">📈 성장상 <b>' + esc(gw.name) + '</b> (+' + gw.score + ')</div>' : '') +
      '</div></div>';
    document.body.appendChild(el);
    var fx = null, t1;
    drumroll(2.2);
    t1 = setTimeout(function () {
      el.classList.add('show'); fanfare();
      fx = confetti(el.querySelector('canvas'));
    }, 2300);
    function close() {
      clearTimeout(t1); if (fx) fx.stop(); el.remove(); open = null;
      removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    addEventListener('keydown', onKey);
    el.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('button') && e.target.closest('button').dataset.a;
      if (a === 'close') close();
      else if (a === 'again') { fanfare(); if (fx) fx.burst(); }
    });
    open = { close: close };
    setTimeout(function () { var b = el.querySelector('[data-a="close"]'); if (b) b.focus(); }, 50);
  }

  function button(host, getResult, label) {
    if (!host) return null;
    injectCss();
    var b = document.createElement('button'); b.type = 'button'; b.className = 'cel-btn';
    b.textContent = label || '🏆 우승 발표';
    b.addEventListener('click', function () { ac(); show(getResult && getResult()); });
    host.appendChild(b);
    return b;
  }

  global.Celebrate = { show: show, button: button, _fanfare: fanfare };
})(window);
