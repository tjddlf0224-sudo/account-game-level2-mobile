/* ============================================================
 *  readable.js — 긴 설명 글을 읽기 쉽게 보여 주는 공통 도구 (2026-09-23)
 *
 *  성일님 요청: "줄간격이 너무 좁으면 안 돼. 한 번에 너무 많은 글이 보이면 읽기 싫어져."
 *  → ① 한 문장 = 한 줄(문단)로 나누고 문장 사이에 여백
 *    ② 줄간격 1.8
 *    ③ 처음엔 앞 몇 문장만, 나머지는 "더 보기"로 접기
 *  문구 작법은 ~/Korean-History-Game/_research/대사_작법.md 를 따른다(한 줄 40자 안쪽·용어는 한 줄에 하나).
 *
 *  사용:  el.innerHTML = Readable.html(글, { keep: 2 });
 *         Readable.html 은 글을 **이스케이프**한다. 이미 HTML 인 조각은 Readable.lines([...html]) 로.
 * ============================================================ */
(function (global) {
  'use strict';

  function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 문장 나누기. 마침표·물음표·느낌표 **뒤에 공백(또는 끝)** 이 올 때만 자른다
     — "1.5%"·"(주)" 같은 건 안 잘린다. 줄바꿈도 문장 경계로 본다.
     (정규식 lookbehind 는 iOS 16.4 미만 WebView 에서 문법 오류로 스크립트 전체가 죽어서 안 쓴다) */
  function split(text) {
    var out = [];
    String(text == null ? '' : text).split(/\n+/).forEach(function (line) {
      var cur = '';
      for (var i = 0; i < line.length; i++) {
        var ch = line.charAt(i);
        cur += ch;
        if ((ch === '.' || ch === '?' || ch === '!') && (i + 1 >= line.length || /\s/.test(line.charAt(i + 1)))) {
          // 닫는 따옴표·괄호는 앞 문장에 붙인다
          while (i + 1 < line.length && /["'”’)\]]/.test(line.charAt(i + 1))) { cur += line.charAt(++i); }
          if (cur.trim()) out.push(cur.trim());
          cur = '';
        }
      }
      if (cur.trim()) out.push(cur.trim());
    });
    return out;
  }

  function css() {
    if (document.getElementById('am-readable-css')) return;
    var s = document.createElement('style');
    s.id = 'am-readable-css';
    s.textContent =
      '.rd{line-height:1.8;word-break:keep-all;overflow-wrap:anywhere}' +
      '.rd p{margin:0 0 .6em}' +
      '.rd p:last-child{margin-bottom:0}' +
      '.rd .rd-more{display:none}' +
      '.rd.rd-open .rd-more{display:block}' +
      '.rd .rd-more p:first-child{margin-top:.6em}' +
      '.rd-toggle{display:inline-flex;align-items:center;gap:4px;margin-top:8px;padding:6px 12px;min-height:34px;' +
      ' border-radius:999px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.05);' +
      ' color:inherit;opacity:.85;font-size:.82rem;font-family:inherit;cursor:pointer}' +
      '.rd.rd-open .rd-toggle{display:none}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* 이미 HTML 인 줄들을 받아 문단으로 */
  function lines(arr, opt) {
    css();
    opt = opt || {};
    var keep = opt.keep == null ? 2 : opt.keep;
    arr = (arr || []).filter(function (x) { return x != null && String(x).trim() !== ''; });
    var p = function (x) { return '<p>' + x + '</p>'; };
    // 접어 봐야 한 문장만 숨는 거면 그냥 다 보여 준다(버튼 누르는 수고가 더 크다)
    if (!keep || arr.length <= keep + 1) return '<div class="rd ' + (opt.cls || '') + '">' + arr.map(p).join('') + '</div>';
    return '<div class="rd ' + (opt.cls || '') + '">' + arr.slice(0, keep).map(p).join('') +
      '<button type="button" class="rd-toggle">더 보기 ▾</button>' +
      '<div class="rd-more">' + arr.slice(keep).map(p).join('') + '</div></div>';
  }

  function html(text, opt) { return lines(split(text).map(esc), opt); }

  // "더 보기" — 버튼이 innerHTML 로 계속 새로 생기므로 문서에서 한 번만 받는다
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('.rd-toggle');
    if (!b) return;
    var box = b.closest('.rd');
    if (box) box.classList.add('rd-open');
  });

  global.Readable = { split: split, html: html, lines: lines, esc: esc, css: css };
})(window);
