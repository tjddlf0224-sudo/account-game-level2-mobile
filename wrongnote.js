/* ============================================================
 *  wrongnote.js  —  영구 오답노트 공유 모듈
 *  전산회계 오락실 (account-game-level2-mobile)
 *
 *  - 모든 게임(G1~G5)과 허브(index)·복습(review)에서 공용으로 사용
 *  - 이중 저장(dual-write): localStorage(즉시/오프라인) + Supabase(영구/기기간)
 *  - Supabase 테이블 wrong_answers 가 아직 없어도 localStorage 로 정상 동작
 *
 *  사용 예 (게임):
 *    WrongNote.reset();                       // 게임 시작 시
 *    WrongNote.add({game:'debit', key:'...', q:'...', correct:'...', wrong:'...', type:'...'});
 *    await WrongNote.flush('debit');          // 게임 종료 시
 *
 *  오답 레코드 통일 포맷:
 *    { game, key, q, correct, wrong, type, ts }
 *      game    : 게임 id (acid/memory/debit/factory/flight)
 *      key     : 문제 식별자 (중복 집계/복습완료 매칭용, 게임 내 고유)
 *      q       : 문제 질문(표시용)
 *      correct : 정답(표시용)
 *      wrong   : 학습자가 고른 오답(표시용, 없으면 null → 플래시카드)
 *      type    : 유형 태그(약점 분석용)
 *      ts      : 타임스탬프(ms)
 * ============================================================ */
(function (global) {
  'use strict';

  var SUPABASE_URL = 'https://pjagaulfivafamhhiveg.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_yck2tAKApEjVSJOJMVSXuQ_AGaNatuI';
  var TABLE = 'wrong_answers';
  var LS_KEY = 'hub_wrongnotes';     // { [userName]: { [game|key]: record } }
  var LS_CAP = 300;                  // 유저당 로컬 보관 상한

  var _client = null;
  var _session = [];                 // 이번 라운드에 쌓인 오답

  // ── Supabase 클라이언트 (supabase-js 가 로드돼 있을 때만) ──
  function client() {
    if (_client) return _client;
    if (global.supabase && global.supabase.createClient) {
      try { _client = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); }
      catch (e) { _client = null; }
    }
    return _client;
  }

  function user() { return (localStorage.getItem('hub_nickname') || '').trim(); }
  function groupId() { return localStorage.getItem('hub_group_id') || null; }

  function nowMs() { return new Date().getTime(); }
  function uid(rec) { return rec.game + '|' + rec.key; }

  // ── localStorage 읽기/쓰기 ──
  function _all() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function _saveAll(obj) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function _bucket(obj, u) { if (!obj[u]) obj[u] = {}; return obj[u]; }

  // ── 세션 버퍼 ──
  function reset() { _session = []; }

  function add(rec) {
    if (!rec || !rec.game || rec.key == null) return;
    _session.push({
      game: rec.game,
      key: String(rec.key),
      q: rec.q != null ? String(rec.q) : '',
      correct: rec.correct != null ? String(rec.correct) : '',
      wrong: rec.wrong != null ? String(rec.wrong) : null,
      type: rec.type != null ? String(rec.type) : '',
      ts: nowMs()
    });
  }

  // ── 종료 시 저장: 로컬(항상) + Supabase(가능하면) ──
  async function flush(game) {
    var items = _session.slice();
    _session = [];
    if (!items.length) return { saved: 0 };

    var u = user() || '게스트';

    // 1) localStorage 집계 저장 (같은 문제는 count++ 로 합산)
    var obj = _all();
    var b = _bucket(obj, u);
    items.forEach(function (r) {
      var k = uid(r);
      if (b[k]) {
        b[k].count = (b[k].count || 1) + 1;
        b[k].ts = r.ts;
        b[k].wrong = r.wrong;     // 최근 오답 보기 갱신
      } else {
        b[k] = { game: r.game, key: r.key, q: r.q, correct: r.correct,
                 wrong: r.wrong, type: r.type, ts: r.ts, count: 1 };
      }
    });
    // 상한 초과 시 오래된 것부터 정리
    var keys = Object.keys(b);
    if (keys.length > LS_CAP) {
      keys.sort(function (a, c) { return (b[a].ts || 0) - (b[c].ts || 0); });
      keys.slice(0, keys.length - LS_CAP).forEach(function (k) { delete b[k]; });
    }
    _saveAll(obj);

    // 2) Supabase 업서트 (테이블/네트워크 없으면 조용히 무시)
    var db = client();
    if (db) {
      var gid = groupId();
      var rows = items.map(function (r) {
        var row = {
          user_name: u, game_id: r.game, q_key: r.key,
          q_text: r.q, correct: r.correct, wrong: r.wrong, q_type: r.type
        };
        if (gid) row.group_id = gid;
        return row;
      });
      try { await db.from(TABLE).insert(rows); } catch (e) { /* 오프라인/미설치 무시 */ }
    }
    return { saved: items.length };
  }

  // ── 복습 화면용: 로컬 + Supabase 병합 조회 ──
  function _localList(u) {
    var b = _all()[u] || {};
    return Object.keys(b).map(function (k) { return b[k]; });
  }

  async function list() {
    var u = user() || '게스트';
    var local = _localList(u);
    var byKey = {};
    local.forEach(function (r) { byKey[uid(r)] = Object.assign({}, r, { _src: 'local' }); });

    var db = client();
    if (db) {
      try {
        var q = db.from(TABLE).select().eq('user_name', u).order('created_at', { ascending: false }).limit(500);
        var gid = groupId();
        if (gid) q = q.eq('group_id', gid);
        var res = await q;
        if (res && res.data) {
          // Supabase rows → 동일 포맷으로 집계 병합
          res.data.forEach(function (row) {
            var rec = {
              game: row.game_id, key: row.q_key, q: row.q_text,
              correct: row.correct, wrong: row.wrong, type: row.q_type,
              ts: row.created_at ? Date.parse(row.created_at) : 0, count: 1, _src: 'remote'
            };
            var k = uid(rec);
            if (byKey[k]) { byKey[k].count = (byKey[k].count || 1) + 1; }
            else { byKey[k] = rec; }
          });
        }
      } catch (e) { /* 무시 → 로컬만 */ }
    }
    return Object.keys(byKey).map(function (k) { return byKey[k]; })
      .sort(function (a, c) { return (c.count || 1) - (a.count || 1) || (c.ts || 0) - (a.ts || 0); });
  }

  // ── 복습 완료: 로컬 + Supabase 에서 제거 ──
  async function resolve(game, key) {
    var u = user() || '게스트';
    var obj = _all();
    var b = obj[u];
    if (b) { delete b[game + '|' + key]; _saveAll(obj); }
    var db = client();
    if (db) {
      try { await db.from(TABLE).delete().eq('user_name', u).eq('game_id', game).eq('q_key', String(key)); }
      catch (e) {}
    }
  }

  async function clearAll() {
    var u = user() || '게스트';
    var obj = _all();
    if (obj[u]) { delete obj[u]; _saveAll(obj); }
    var db = client();
    if (db) { try { await db.from(TABLE).delete().eq('user_name', u); } catch (e) {} }
  }

  // ── 약점 집계: 게임별 / 유형별 빈도 ──
  function summarize(items) {
    var byGame = {}, byType = {}, total = 0;
    items.forEach(function (r) {
      var c = r.count || 1; total += c;
      byGame[r.game] = (byGame[r.game] || 0) + c;
      var t = r.type || '기타';
      byType[t] = (byType[t] || 0) + c;
    });
    return { total: total, byGame: byGame, byType: byType };
  }

  global.WrongNote = {
    reset: reset, add: add, flush: flush,
    list: list, resolve: resolve, clearAll: clearAll, summarize: summarize,
    user: user, GAME_NAMES: {
      acid: '계정과목 산성비', memory: '계정·뜻 메모리', debit: '분개 차·대변',
      factory: '결산분개 조립', flight: '플라이트 장부조회', theory: '이론 객관식'
    }
  };
})(window);
