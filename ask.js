/* ============================================================
 *  ask.js — 화면 회전을 따라오는 확인창
 *  전산회계 오락실
 *
 *  왜 만들었나. 브라우저 confirm()/alert() 은 **운영체제 창**이라 페이지의 CSS 변형을
 *  따라오지 않는다. stage1_cost.html(원가의 길)은 세로로 든 기기에서 #rotator 를
 *  90도 돌려 가로 화면을 만드는데, 그 위에서 confirm() 을 띄우면 **게임은 가로인데
 *  확인창만 세로로** 뜬다. 한국사 게임이 같은 문제를 겪고 ask.js 를 만들었다
 *  (그 프로젝트 SESSION_LOG 55번).
 *
 *  해결: 회전이 걸린 그 엘리먼트 **안에** 직접 그린다. 그러면 같이 돈다.
 *
 *  쓰는 법 — 원래 confirm/alert 과 달리 **비동기**다.
 *    if (await Ask.confirm('나갈까요?')) { ... }
 *    await Ask.alert('잠시 후 다시 시도해주세요.');
 *
 *  ⚠ 앞으로 이 앱에서 confirm()/alert() 을 새로 쓰지 말 것.
 * ============================================================ */
(function (global) {
  'use strict';

  var STYLE_ID = 'ask-style';

  /* 회전이 걸린 껍데기 안에 넣어야 같이 돈다. 없으면 body. */
  function host() {
    return document.getElementById('rotator')
        || document.getElementById('wrap')
        || document.body;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      /* ⚠ fixed 여야 한다. absolute 는 **문서** 기준이라, 페이지를 아래로 스크롤한 상태에서
         확인창을 띄우면 모달이 문서 맨 위에 남아 화면 밖으로 사라진다
         (2026-09-16 실기기 제보: 신고의 문에서 아래쪽 '그만' 을 눌렀더니
          "위로 스크롤 올리면 위쪽에 모달 창이 떠있긴 해").
         transform 을 쓰는 조상이 있으면 fixed 는 그 조상 기준이 되는데,
         원가의 길(#rotator 회전)에서는 그게 오히려 회전 화면 한가운데라 맞다. */
      '.ask-ov{position:fixed;inset:0;z-index:99999;display:flex;',
      'align-items:center;justify-content:center;background:rgba(5,3,16,.72);',
      '-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);',
      'font-family:"Noto Sans KR",-apple-system,sans-serif;}',
      '.ask-box{width:min(420px,84%);background:#1b1f2e;color:#eef1f7;',
      'border:1px solid rgba(255,255,255,.14);border-radius:16px;',
      'box-shadow:0 18px 48px rgba(0,0,0,.55);padding:22px 22px 16px;}',
      '.ask-msg{font-size:.98rem;line-height:1.8;white-space:pre-wrap;margin-bottom:18px;}',
      '.ask-row{display:flex;gap:10px;}',
      /* 버튼은 같은 크기로 나란히 — 제각각 크기를 쓰지 않는다. */
      '.ask-row button{flex:1 1 0;min-width:0;padding:12px 0;border-radius:11px;',
      'font-size:.94rem;font-weight:700;cursor:pointer;border:1px solid rgba(255,255,255,.16);',
      'background:rgba(255,255,255,.07);color:#eef1f7;font-family:inherit;}',
      '.ask-row button.primary{background:linear-gradient(135deg,#00c2d6,#0090c8);',
      'border-color:transparent;color:#04121a;}',
      '.ask-row button:active{transform:translateY(1px);}',
      /* prompt 용 입력창 — 메시지와 버튼 사이에 들어간다 */
      '.ask-input{width:100%;box-sizing:border-box;margin:-8px 0 16px;padding:12px 14px;',
      'border-radius:11px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.28);',
      'color:#eef1f7;font-size:1rem;font-family:inherit;outline:none;}',
      '.ask-input:focus{border-color:#00c2d6;}'
    ].join('');
    document.head.appendChild(s);
  }

  /* opts.input 이 있으면 입력창을 넣는다. 그때 '확인'의 value 는 입력값이 되고,
     비우거나 취소하면 null 을 돌려준다(원래 prompt() 와 같은 약속). */
  function open(msg, labels, opts) {
    opts = opts || {};
    ensureStyle();
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'ask-ov';
      var box = document.createElement('div');
      box.className = 'ask-box';
      var p = document.createElement('div');
      p.className = 'ask-msg';
      p.textContent = msg;                       // 텍스트로 넣는다(HTML 주입 방지)
      var row = document.createElement('div');
      row.className = 'ask-row';
      box.appendChild(p);

      var inp = null;
      if (opts.input) {
        inp = document.createElement('input');
        inp.className = 'ask-input';
        inp.type = opts.password ? 'password' : 'text';   // 비밀번호는 가린다(원래 prompt 는 평문이었다)
        if (opts.placeholder) inp.placeholder = opts.placeholder;
        if (opts.value) inp.value = opts.value;
        box.appendChild(inp);
      }
      box.appendChild(row);
      ov.appendChild(box);

      function done(v) {
        document.removeEventListener('keydown', onKey, true);
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        resolve(v);
      }
      /* 입력창이 있으면 '확인'(primary)은 고정값이 아니라 입력값을 돌려준다 */
      function valueOf(l) {
        if (!inp) return l.value;
        if (l.value === false) return null;          // 취소
        var v = inp.value.trim();
        return v === '' ? null : v;
      }
      labels.forEach(function (l) {
        var b = document.createElement('button');
        b.textContent = l.text;
        if (l.primary) b.className = 'primary';
        b.addEventListener('click', function (e) { e.stopPropagation(); done(valueOf(l)); });
        row.appendChild(b);
      });
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); done(inp ? null : false); }
        else if (e.key === 'Enter') { e.stopPropagation(); done(valueOf(labels[labels.length - 1])); }
      }
      document.addEventListener('keydown', onKey, true);
      // 뒷배경 클릭이 게임(대화창 넘기기 등)에 새지 않게 막는다.
      ov.addEventListener('click', function (e) { e.stopPropagation(); });

      host().appendChild(ov);
      // 키보드가 바로 올라오도록. iOS 는 사용자 제스처 흐름 안이라 먹는다.
      if (inp) setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 30);
    });
  }

  global.Ask = {
    confirm: function (msg, opts) {
      opts = opts || {};
      return open(msg, [
        { text: opts.cancel || '취소', value: false },
        { text: opts.ok || '확인', value: true, primary: true }
      ]);
    },
    alert: function (msg, opts) {
      opts = opts || {};
      return open(msg, [{ text: opts.ok || '확인', value: true, primary: true }]);
    },
    /* 원래 prompt() 와 같은 약속: 확인하면 입력 문자열, 취소하거나 비우면 null.
       두 번째 인자로 기본값을 준다(prompt(msg, defaultValue) 와 같은 자리). */
    prompt: function (msg, def, opts) {
      opts = opts || {};
      return open(msg, [
        { text: opts.cancel || '취소', value: false },
        { text: opts.ok || '확인', value: true, primary: true }
      ], { input: true, value: def == null ? '' : String(def),
           placeholder: opts.placeholder, password: !!opts.password });
    }
  };
})(window);
