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
      '.ask-ov{position:absolute;inset:0;z-index:99999;display:flex;',
      'align-items:center;justify-content:center;background:rgba(5,3,16,.72);',
      '-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);',
      'font-family:"Noto Sans KR",-apple-system,sans-serif;}',
      '.ask-box{width:min(420px,84%);background:#1b1f2e;color:#eef1f7;',
      'border:1px solid rgba(255,255,255,.14);border-radius:16px;',
      'box-shadow:0 18px 48px rgba(0,0,0,.55);padding:22px 22px 16px;}',
      '.ask-msg{font-size:.98rem;line-height:1.6;white-space:pre-wrap;margin-bottom:18px;}',
      '.ask-row{display:flex;gap:10px;}',
      /* 버튼은 같은 크기로 나란히 — 제각각 크기를 쓰지 않는다. */
      '.ask-row button{flex:1 1 0;min-width:0;padding:12px 0;border-radius:11px;',
      'font-size:.94rem;font-weight:700;cursor:pointer;border:1px solid rgba(255,255,255,.16);',
      'background:rgba(255,255,255,.07);color:#eef1f7;font-family:inherit;}',
      '.ask-row button.primary{background:linear-gradient(135deg,#00c2d6,#0090c8);',
      'border-color:transparent;color:#04121a;}',
      '.ask-row button:active{transform:translateY(1px);}'
    ].join('');
    document.head.appendChild(s);
  }

  function open(msg, labels) {
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
      box.appendChild(p); box.appendChild(row);
      ov.appendChild(box);

      function done(v) {
        document.removeEventListener('keydown', onKey, true);
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        resolve(v);
      }
      labels.forEach(function (l) {
        var b = document.createElement('button');
        b.textContent = l.text;
        if (l.primary) b.className = 'primary';
        b.addEventListener('click', function (e) { e.stopPropagation(); done(l.value); });
        row.appendChild(b);
      });
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); done(false); }
        else if (e.key === 'Enter') { e.stopPropagation(); done(labels[labels.length - 1].value); }
      }
      document.addEventListener('keydown', onKey, true);
      // 뒷배경 클릭이 게임(대화창 넘기기 등)에 새지 않게 막는다.
      ov.addEventListener('click', function (e) { e.stopPropagation(); });

      host().appendChild(ov);
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
    }
  };
})(window);
