/* 日本版 — サーバー(Supabase)との境目で game_id を日本版用に付け替える薄い包み。
 *
 * なぜ: 韓国版と同じ Supabase プロジェクトを使う(開発チーム長の決定)。ゲームのコードは
 *   game_id を 'acid' 'debit' … のまま使っているが、そのまま送ると韓国版の順位・記録と混ざる。
 *   ゲーム本体(判定・点数・広告の流れ)は変えずに、ここ一か所で送る値と受け取る値を変える。
 *
 * 送るとき: URL の game_id=eq.acid / in.(acid,debit) と、JSON 本文の game_id・p_game_id を
 *   acid → acid_ja、acid_d2 → acid_ja_d2 に付け替える。
 * 受け取るとき: 行に game_id があれば、日本版の行(_ja)だけ残して名前を元に戻す
 *   (同じ名前・uid の韓国版の行が混ざって返ってきても画面に出さない)。
 *
 * 読み込み順: ja/ja_data.js のすぐ後、Supabase クライアントを作るどのスクリプトよりも前。
 */
(function (global) {
  'use strict';
  if (!global.fetch || global.__jaServerWrapped) return;
  global.__jaServerWrapped = true;
  var SB = /\.supabase\.co\/rest\/v1\//;
  var KEYS = { game_id: 1, p_game_id: 1 };
  function toJa(v) {
    if (typeof v !== 'string' || /_ja(_d2)?$/.test(v)) return v;
    var m = /^([a-z][a-z0-9_]*?)(_d2)?$/.exec(v);   // journal_lv1 のような下線入りも
    return m ? m[1] + '_ja' + (m[2] || '') : v;
  }
  function isJa(v) { return typeof v === 'string' && /_ja(_d2)?$/.test(v); }
  function fromJa(v) { return typeof v === 'string' ? v.replace(/_ja(?=(_d2)?$)/, '') : v; }
  function mapBody(x) {
    if (Array.isArray(x)) return x.map(mapBody);
    if (x && typeof x === 'object') {
      var o = {};
      for (var k in x) o[k] = KEYS[k] ? toJa(x[k]) : (x[k] && typeof x[k] === 'object' ? mapBody(x[k]) : x[k]);
      return o;
    }
    return x;
  }
  function mapUrl(u) {
    try {
      var url = new URL(u, location.href), changed = false;
      ['game_id', 'p_game_id'].forEach(function (k) {
        var v = url.searchParams.get(k);
        if (v == null) return;
        var nv = v.replace(/^(eq|neq)\.(.+)$/, function (_, op, val) { return op + '.' + toJa(val); })
                  .replace(/^in\.\((.*)\)$/, function (_, list) { return 'in.(' + list.split(',').map(function (s) { return toJa(s.trim()); }).join(',') + ')'; });
        if (nv !== v) { url.searchParams.set(k, nv); changed = true; }
      });
      return changed ? url.toString() : u;
    } catch (e) { return u; }
  }
  function mapRows(data) {
    if (Array.isArray(data)) {
      if (!data.some(function (r) { return r && typeof r === 'object' && 'game_id' in r; })) return data;
      return data.filter(function (r) { return !(r && typeof r === 'object' && 'game_id' in r) || isJa(r.game_id); })
                 .map(function (r) { if (r && typeof r === 'object' && 'game_id' in r) { var o = {}; for (var k in r) o[k] = r[k]; o.game_id = fromJa(r.game_id); return o; } return r; });
    }
    if (data && typeof data === 'object' && 'game_id' in data) {
      if (!isJa(data.game_id)) return null;
      var o = {}; for (var k in data) o[k] = data[k]; o.game_id = fromJa(data.game_id); return o;
    }
    return data;
  }
  /* 統計は app 列(既定 'accounting')で韓国版と分ける(2026-11-14 開発チーム長がサーバーに追加):
     dau_events・play_events の行の app、usage_bump の各行の 'app' キー、am_ev_push の p_app、install_referrers の app */
  var APP = 'accounting_ja';
  function tagApp(u, body) {
    var path = String(u).split('?')[0];
    function each(rows, key) { (Array.isArray(rows) ? rows : [rows]).forEach(function (r) { if (r && typeof r === 'object') r[key] = APP; }); }
    if (/\/rest\/v1\/(dau_events|play_events)$/.test(path)) each(body, 'app');
    else if (/\/rpc\/usage_bump$/.test(path) && body && body.rows) each(body.rows, 'app');
    else if (/\/rpc\/am_ev_push$/.test(path) && body && typeof body === 'object') body.p_app = APP;
    else if (/\/rest\/v1\/install_referrers$/.test(path)) each(body, 'app');
    return body;
  }
  var orig = global.fetch;
  global.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!SB.test(url)) return orig.apply(this, arguments);
      var nurl = mapUrl(url), ninit = init ? Object.assign({}, init) : {};
      if (ninit.body && typeof ninit.body === 'string') {
        try { ninit.body = JSON.stringify(tagApp(nurl, mapBody(JSON.parse(ninit.body)))); } catch (e) {}
      }
      var req = typeof input === 'string' ? nurl : new Request(nurl, input);
      return orig.call(this, req, ninit).then(function (res) {
        var ct = res.headers.get('content-type') || '';
        if (!/json/.test(ct) || res.status === 204) return res;
        return res.clone().text().then(function (t) {
          if (!t) return res;
          var d; try { d = JSON.parse(t); } catch (e) { return res; }
          var nd = mapRows(d);
          if (nd === d) return res;
          return new Response(JSON.stringify(nd), { status: res.status, statusText: res.statusText, headers: res.headers });
        }).catch(function () { return res; });
      });
    } catch (e) {
      return orig.apply(this, arguments);
    }
  };
  global.JaServer = { toJa: toJa, fromJa: fromJa, mapRows: mapRows, mapUrl: mapUrl, mapBody: mapBody, tagApp: tagApp };
})(window);
