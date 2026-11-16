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
      'font-family:"Noto Sans JP", "Noto Sans KR",-apple-system,sans-serif;}',
      '.ask-box{position:relative;box-sizing:border-box;width:min(420px,84%);background:#1b1f2e;color:#eef1f7;',
      'border:1px solid rgba(255,255,255,.14);border-radius:16px;',
      'box-shadow:0 18px 48px rgba(0,0,0,.55);padding:22px 22px 16px;}',
      /* 계사니(2026-11-06 성일님 "글씨만 나오는 부분 있으면 고치자. 계사니가 알려드릴까요? 라는데 계사니는 안 보여").
         세로: 창 위로 고개를 내민다 — 그림 아래쪽(잘린 끝)은 창 뒤로 숨긴다(z-index:-1, .ask-box 는 z-index 없음).
         가로(높이 430 이하): 창 안 왼쪽. */
      '.ask-box.has-face{margin-top:52px;padding-top:40px;}',
      '.ask-face{position:absolute;left:50%;top:-70px;width:92px;height:92px;margin-left:-46px;z-index:-1;',
      'pointer-events:none;-webkit-user-select:none;user-select:none;}',
      '.ask-box.has-face .ask-msg,.ask-box.has-face .ask-note{text-align:center;}',
      '.ask-box.side{margin-top:0;padding:18px 20px 14px 108px;}',
      '.ask-box.side .ask-face{left:14px;top:50%;margin:-42px 0 0;width:84px;height:84px;z-index:1;}',
      '.ask-box.side .ask-msg,.ask-box.side .ask-note{text-align:left;}',
      '.ask-msg{font-size:.98rem;line-height:1.8;white-space:pre-wrap;margin-bottom:18px;word-break:keep-all;overflow-wrap:anywhere;}',
      /* opts.note — 본문 아래 작은 글씨(부연은 버튼·본문에 넣지 않는다) */
      '.ask-note{font-size:.8rem;line-height:1.5;color:#9aa3b8;margin:-12px 0 16px;word-break:keep-all;}',
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

  /* 내용에 맞는 계사니 표정 — 그림은 알림용 www/noti/calc_*.png 그대로(새로 그리지 않음).
     opts.face 로 직접 고를 수 있고(clock·fire·plead·cry·sulk·ghost), false 면 안 넣는다. */
  var FACES = ['clock', 'fire', 'plead', 'cry', 'sulk', 'ghost'];
  function pickFace(msg, kind) {
    var m = String(msg || '');
    if (/✅|制覇|おめでとう|お疲れ|ありがとう|変更しました|変更されました|リセットしました|保存しました|開きました|合格/.test(m)) return 'fire';
    if (/失敗|できませんでした|読み込めません|インターネット|ネットワーク|拒否|⚠|退会|削除|一致しません/.test(m)) return 'cry';
    if (kind !== 'alert' && /やめ|終了|ログアウト|リセット|本当に/.test(m)) return 'plead';
    if (/入力して|入力してください|文字以上|文字以下|形式が|先に/.test(m)) return 'plead';
    return 'clock';
  }
  /* 회전 트릭(#rotator) 안이면 그 엘리먼트의 (돌기 전) 높이가 곧 보이는 가로 화면 높이다 */
  function shortScreen(h) {
    var px = (h === document.body) ? global.innerHeight : (h.clientHeight || global.innerHeight);
    return px <= 430;
  }

  /* opts.input 이 있으면 입력창을 넣는다. 그때 '확인'의 value 는 입력값이 되고,
     비우거나 취소하면 null 을 돌려준다(원래 prompt() 와 같은 약속). */
  function open(msg, labels, opts) {
    opts = opts || {};
    ensureStyle();
    return new Promise(function (resolve) {
      var t0 = Date.now();   // 誤タップ防止(韓国版 908a317、2026-11-15 プレイブック 7-5): 窓を出した指を離すときの click が新しいボタンを押さないよう 0.35 秒無視
      var ov = document.createElement('div');
      ov.className = 'ask-ov';
      var box = document.createElement('div');
      box.className = 'ask-box';
      var p = document.createElement('div');
      p.className = 'ask-msg';
      p.textContent = msg;                       // 텍스트로 넣는다(HTML 주입 방지)
      var row = document.createElement('div');
      row.className = 'ask-row';
      var where = host();
      var face = opts.face === false ? null : (FACES.indexOf(opts.face) >= 0 ? opts.face : pickFace(msg, opts.kind));
      if (face) {
        var img = document.createElement('img');
        img.className = 'ask-face';
        img.alt = '';
        img.draggable = false;
        img.src = '../noti/calc_' + face + '.png';
        img.setAttribute('data-face', face);
        img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); box.classList.remove('has-face', 'side'); };
        box.appendChild(img);
        box.classList.add(shortScreen(where) ? 'side' : 'has-face');
      }
      box.appendChild(p);
      if (opts.note) {
        var nt = document.createElement('div');
        nt.className = 'ask-note';
        nt.textContent = opts.note;
        box.appendChild(nt);
      }

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
        b.addEventListener('click', function (e) { e.stopPropagation(); if (e.detail !== 0 && Date.now() - t0 < 350) return; done(valueOf(l)); });   // detail 0 = キーボード・スクリプトの click はそのまま
        row.appendChild(b);
      });
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); done(inp ? null : false); }
        else if (e.key === 'Enter') { e.stopPropagation(); done(valueOf(labels[labels.length - 1])); }
      }
      document.addEventListener('keydown', onKey, true);
      // 뒷배경 클릭이 게임(대화창 넘기기 등)에 새지 않게 막는다.
      ov.addEventListener('click', function (e) { e.stopPropagation(); });

      where.appendChild(ov);
      // 키보드가 바로 올라오도록. iOS 는 사용자 제스처 흐름 안이라 먹는다.
      if (inp) setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 30);
    });
  }

  global.Ask = {
    confirm: function (msg, opts) {
      opts = opts || {};
      return open(msg, [
        { text: opts.cancel || 'キャンセル', value: false },
        { text: opts.ok || 'OK', value: true, primary: true }
      ], { kind: 'confirm', face: opts.face, note: opts.note });
    },
    alert: function (msg, opts) {
      opts = opts || {};
      return open(msg, [{ text: opts.ok || 'OK', value: true, primary: true }], { kind: 'alert', face: opts.face, note: opts.note });
    },
    /* 원래 prompt() 와 같은 약속: 확인하면 입력 문자열, 취소하거나 비우면 null.
       두 번째 인자로 기본값을 준다(prompt(msg, defaultValue) 와 같은 자리). */
    prompt: function (msg, def, opts) {
      opts = opts || {};
      return open(msg, [
        { text: opts.cancel || 'キャンセル', value: false },
        { text: opts.ok || 'OK', value: true, primary: true }
      ], { input: true, value: def == null ? '' : String(def), kind: 'prompt', face: opts.face, note: opts.note,
           placeholder: opts.placeholder, password: !!opts.password });
    }
  };
})(window);
