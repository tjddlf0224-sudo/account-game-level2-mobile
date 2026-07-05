/* ============================================================
 *  growth.js  —  개인 성장 이력 공유 모듈
 *  전산회계 오락실 (account-game-level2-mobile)
 *
 *  - 매 판(게임 종료/저장)마다 점수를 누적 저장 → 성장곡선용 시계열
 *  - scores 테이블은 "최고점 1행"만 남지만, 여기는 "매 판 1행"을 쌓는다
 *  - 이중 저장(dual-write): localStorage(즉시/오프라인) + Supabase(영구/기기간)
 *  - Supabase 테이블 score_history 가 없어도 localStorage 로 정상 동작
 *
 *  사용 예 (게임 점수 저장 직후):
 *    Growth.record({ game:'debit', name:'철수', score:1234, grade:'회계 부장', combo:9, correct:30 });
 *    (name 미전달 시 hub_nickname → '게스트' 순 폴백)
 *
 *  성장 페이지(growth.html):
 *    const data = await Growth.series();   // { game: [ {score, grade, ts}, ... ] }
 * ============================================================ */
(function (global) {
  'use strict';

  var SUPABASE_URL = 'https://pjagaulfivafamhhiveg.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_yck2tAKApEjVSJOJMVSXuQ_AGaNatuI';
  var TABLE = 'score_history';
  var LS_KEY = 'hub_growth';   // { [userName]: { [game]: [ {s,g,t}, ... ] } }
  var LS_CAP = 80;             // 게임당 로컬 보관 상한

  var _client = null;

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

  function _all() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function _saveAll(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {} }

  // ── 매 판 종료 시 호출 — 로컬 즉시 + Supabase 베스트에포트(예외 안 던짐) ──
  function record(rec) {
    if (!rec || !rec.game) return;
    // 게임이 점수 저장에 쓴 실제 닉네임(rec.name) 우선 — 없으면 hub_nickname → '게스트'
    var u = ((rec.name || '') + '').trim() || user() || '게스트';
    var score = Math.max(0, parseInt(rec.score, 10) || 0);
    var t = nowMs();

    // 1) localStorage 누적
    try {
      var obj = _all();
      if (!obj[u]) obj[u] = {};
      if (!obj[u][rec.game]) obj[u][rec.game] = [];
      var arr = obj[u][rec.game];
      arr.push({ s: score, g: rec.grade || '', t: t });
      if (arr.length > LS_CAP) arr.splice(0, arr.length - LS_CAP);
      _saveAll(obj);
    } catch (e) {}

    // 2) Supabase insert (fire-and-forget)
    var db = client();
    if (db) {
      var row = {
        user_name: u, game_id: rec.game, score: score, grade: rec.grade || '',
        combo: Math.max(0, parseInt(rec.combo, 10) || 0),
        correct: Math.max(0, parseInt(rec.correct, 10) || 0)
      };
      var gid = groupId();
      if (gid) row.group_id = gid;
      try { db.from(TABLE).insert(row).then(function () {}, function () {}); } catch (e) {}
    }
  }

  // ── 성장 페이지용: 게임별 시계열 (로컬+원격 병합, 시간순 오름차순) ──
  async function series(name) {
    var u = (name || user() || '게스트');
    var out = {};   // { game: [ {score, grade, ts}, ... ] }

    // 로컬
    var local = _all()[u] || {};
    Object.keys(local).forEach(function (g) {
      out[g] = (local[g] || []).map(function (p) {
        return { score: p.s, grade: p.g, ts: p.t };
      });
    });

    // 원격(있으면 해당 게임은 원격으로 대체 — 기기간 통합본)
    var db = client();
    if (db) {
      try {
        var q = db.from(TABLE).select().eq('user_name', u)
                  .order('played_at', { ascending: true }).limit(1000);
        var gid = groupId();
        if (gid) q = q.eq('group_id', gid);
        var res = await q;
        if (res && res.data && res.data.length) {
          var remote = {};
          res.data.forEach(function (r) {
            (remote[r.game_id] = remote[r.game_id] || []).push({
              score: r.score, grade: r.grade,
              ts: r.played_at ? Date.parse(r.played_at) : 0
            });
          });
          Object.keys(remote).forEach(function (g) { out[g] = remote[g]; });
        }
      } catch (e) { /* 오프라인/미설치 → 로컬만 */ }
    }

    Object.keys(out).forEach(function (g) {
      out[g].sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    });
    return out;
  }

  // ── 닉네임 변경: 이력(로컬+Supabase)을 새 이름으로 이전 ──
  async function rename(oldName, newName) {
    oldName = (oldName || '').trim() || '게스트';
    newName = (newName || '').trim();
    if (!newName || newName === oldName) return;

    // localStorage 병합 이동
    var obj = _all();
    if (obj[oldName]) {
      if (!obj[newName]) obj[newName] = {};
      var src = obj[oldName];
      Object.keys(src).forEach(function (g) {
        var merged = (obj[newName][g] || []).concat(src[g]);
        merged.sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
        if (merged.length > LS_CAP) merged.splice(0, merged.length - LS_CAP);
        obj[newName][g] = merged;
      });
      delete obj[oldName];
      _saveAll(obj);
    }

    // Supabase: 기존행 조회 → 새 이름으로 재삽입(시점 보존) → 기존행 삭제
    var db = client();
    if (db) {
      try {
        var res = await db.from(TABLE).select().eq('user_name', oldName);
        if (res && res.data && res.data.length) {
          var rows = res.data.map(function (r) {
            var o = { user_name: newName, game_id: r.game_id, score: r.score,
                      grade: r.grade, combo: r.combo, correct: r.correct };
            if (r.group_id) o.group_id = r.group_id;
            if (r.played_at) o.played_at = r.played_at;
            return o;
          });
          await db.from(TABLE).insert(rows);
          await db.from(TABLE).delete().eq('user_name', oldName);
        }
      } catch (e) { /* 무시 → 로컬만 이전 */ }
    }
  }

  global.Growth = {
    record: record, series: series, rename: rename,
    GAME_NAMES: {
      acid: '계정과목 산성비', memory: '계정·뜻 메모리', debit: '분개 차·대변',
      factory: '결산분개 조립', flight: '플라이트 장부조회', theory: '이론 객관식'
    }
  };
})(window);
