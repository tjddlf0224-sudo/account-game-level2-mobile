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
  // 웹(GitHub Pages) 수업 플레이는 광고가 안 뜨는 별개 채널이라, 광고수익 분석용
  // plays_total/active_players 집계에서 앱 실사용과 구분해야 한다. score_history에
  // 이미 있던 미사용 source 컬럼(과거엔 엑셀 이전 데이터 표시용으로만 쓰임)을 재활용.
  function platform() {
    try {
      var C = global.Capacitor;
      if (C && C.isNativePlatform && C.isNativePlatform()) {
        return (C.getPlatform && C.getPlatform()) || 'app';
      }
    } catch (e) {}
    return 'web';
  }

  function _all() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function _saveAll(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {} }

  // ── DAU 체크 ──────────────────────────────────────────────────
  // Play/App Store DAU는 지연이 크고(며칠~몇 주) 매번 콘솔에서 CSV를 수동으로
  // 내려받아야 해서, 하루에 한 번만 찍는 가벼운 이벤트를 우리 Supabase에 직접 쌓는다.
  // score_history(저장 버튼을 눌러야만 기록됨)와 달리, 앱/페이지를 열기만 해도 찍힌다
  // — "저장까지 한 진성 플레이"가 아니라 "그날 실제로 앱을 연 사람" 자체가 목적.
  var DAU_TABLE = 'dau_events';
  var LS_DEVICE = 'hub_device_id';
  var LS_DAU_DATE = 'hub_dau_date';

  // toISOString()은 UTC 기준이라 한국시간 자정~오전 9시 사이엔 "어제" 날짜가 찍히는 버그가
  // 있었다(2026-09-01 발견) — 광고매출(한국시간 기준)과 날짜가 최대 9시간 어긋나서 DAU와
  // 매출을 같은 날짜로 비교할 수 없게 만듦. +9시간 보정으로 한국시간 날짜를 얻는다.
  function todayStr() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }

  function deviceId() {
    try {
      var id = localStorage.getItem(LS_DEVICE);
      if (id) return id;
      id = (global.crypto && global.crypto.randomUUID)
        ? global.crypto.randomUUID()
        : 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      localStorage.setItem(LS_DEVICE, id);
      return id;
    } catch (e) { return 'unknown'; }
  }

  // 닉네임 유무와 무관하게(신규 유저도 포함) 기기 ID 기준으로 하루 한 번만 기록.
  // ⚠️ 2026-09-01 경화 2건 (실데이터에서 기록 누락이 확인돼 고침):
  //  1) 예전엔 가드(LS_DAU_DATE)를 "요청 전에" 먼저 찍었는데, 그러면 client()가 아직
  //     준비 안 됐거나 요청이 실패한 날은 하루 전체가 통째로 안 찍히고 재시도도 안 됨.
  //     이제 가드는 upsert가 "성공한 뒤에만" 찍는다 — 실패하면 다음 로드/복귀 때 재시도.
  //     (문서가 device_id+날짜로 유니크라 중복 호출돼도 같은 행에 upsert될 뿐 안전함)
  //  2) 네이티브 앱은 백그라운드에 며칠씩 살아있어 페이지 로드가 다시 안 일어난다 —
  //     로드 시 1회만 부르면 앱을 안 껐다 켠 유저는 이튿날부터 영영 안 찍힘.
  //     visibilitychange(포그라운드 복귀)에서도 불러서 날짜가 바뀌었으면 다시 찍는다.
  function checkDAU() {
    try {
      var today = todayStr();
      if (localStorage.getItem(LS_DAU_DATE) === today) return; // 오늘 이미 기록함
      var db = client();
      if (!db) return; // 가드를 안 찍었으니 다음 기회(로드/복귀)에 자동 재시도됨
      var row = { device_id: deviceId(), user_name: user() || null, platform: platform(), snapshot_date: today };
      db.from(DAU_TABLE).upsert(row, { onConflict: 'device_id,snapshot_date', ignoreDuplicates: true })
        .then(function (res) {
          if (res && res.error) return; // 실패 — 가드 안 찍고 다음 기회에 재시도
          try { localStorage.setItem(LS_DAU_DATE, today); } catch (e) {}
        }, function () {});
    } catch (e) {}
  }

  // ── 진짜 플레이 횟수 — 랭킹저장/닉네임 여부와 무관하게 "게임이 끝났다"는 신호만 ──
  // score_history(=record, 위)는 이름이 있어야(로그인 or 수동입력) 기록되지만, 이건
  // dau_events처럼 device_id 기준으로 무조건 쌓는다. 유니크 제약을 안 걸어서(dau_events와
  // 달리) 같은 기기가 하루에 여러 판 하면 그만큼 여러 행이 쌓이는 게 정상 — "그날 방문
  // 여부"가 아니라 "총 몇 판을 했는지"가 목적이라 중복 자체가 데이터임.
  var PLAY_TABLE = 'play_events';
  function logPlay(gameId) {
    if (!gameId) return;
    try {
      var db = client();
      if (!db) return;
      var row = { device_id: deviceId(), game_id: gameId, platform: platform() };
      db.from(PLAY_TABLE).insert(row).then(function () {}, function () {});
    } catch (e) {}
  }

  // ── 이론 문항 1개 풀 때마다(정답/오답 둘 다) 호출 — 주제별 정답률 집계용.
  // wrong_answers는 오답만 쌓여서 "주제별 정답률"을 못 냄(분모를 모름) — 이건 매 문항마다
  // 쌓아서 correct=true/false 둘 다 기록, 교수자 대시보드가 정답률=correct건/전체건으로 계산.
  var TOPIC_TABLE = 'topic_attempts';
  function logTopicAttempt(opts) {
    if (!opts || !opts.game || !opts.topic) return;
    try {
      var db = client();
      if (!db) return;
      var u = user();
      if (!u) return; // 닉네임 없으면 학생 식별 불가 — 스킵
      var row = { user_name: u, game_id: opts.game, topic: opts.topic, correct: !!opts.correct };
      var gid = groupId();
      if (gid) row.group_id = gid;
      db.from(TOPIC_TABLE).insert(row).then(function () {}, function () {});
    } catch (e) {}
  }

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
        correct: Math.max(0, parseInt(rec.correct, 10) || 0),
        source: platform()   // 'web' | 'android' | 'ios' — 광고수익 분석 시 앱/웹 구분용
      };
      // 이론(theory)처럼 문항 수가 판마다 달라지는 게임만 total을 넘김 — 교수자 대시보드 정답률(correct/total) 계산용
      if (rec.total != null) row.total = Math.max(0, parseInt(rec.total, 10) || 0);
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
        // 최신순으로 1000행을 받아 뒤집음 — 1000행 초과 헤비유저도 "최신" 기록이 잘리지 않게
        var q = db.from(TABLE).select().eq('user_name', u)
                  .order('played_at', { ascending: false }).limit(1000);
        var gid = groupId();
        if (gid) q = q.eq('group_id', gid);
        var res = await q;
        if (res && res.data && res.data.length) {
          res.data.reverse();
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
        var res = await db.from(TABLE).select().eq('user_name', oldName).limit(1000);
        if (res && res.data && res.data.length) {
          // 1000행 캡에 걸렸다면(=일부만 복사됨) 삭제를 생략 — 이력 유실 방지
          var truncated = res.data.length >= 1000;
          var rows = res.data.map(function (r) {
            var o = { user_name: newName, game_id: r.game_id, score: r.score,
                      grade: r.grade, combo: r.combo, correct: r.correct };
            if (r.group_id) o.group_id = r.group_id;
            if (r.played_at) o.played_at = r.played_at;
            return o;
          });
          var ins = await db.from(TABLE).insert(rows);
          // insert 실패(supabase-js는 reject하지 않음)면 삭제 금지 — 데이터 유실 방지
          if (!ins || ins.error || truncated) return;
          await db.from(TABLE).delete().eq('user_name', oldName);
        }
      } catch (e) { /* 무시 → 로컬만 이전 */ }
    }
  }

  global.Growth = {
    record: record, series: series, rename: rename, logPlay: logPlay, logTopicAttempt: logTopicAttempt,
    GAME_NAMES: {
      acid: '계정과목 산성비', memory: '계정·뜻 메모리', debit: '분개 차·대변',
      factory: '결산분개 조립', flight: '플라이트 장부조회', theory: '이론 객관식',
      cost_lv1: '원가의 길', capital_lv1: '자본의 제왕', theory_lv1: '이론 객관식(1급)', voucher_lv1: '매입매출전표 유형', vat_lv1: '신고의 문', alloc_lv1: '배관의 방'
    }
  };

  // growth.js는 모든 게임/허브 화면에 공통으로 로드되므로, 로드 시점에 한 번 체크하면
  // 앱 전체에서 자동으로 DAU가 잡힌다(별도 페이지마다 호출부 추가 불필요).
  checkDAU();
  // 네이티브 앱은 백그라운드에서 며칠씩 살아있어 로드가 다시 안 일어남 — 포그라운드
  // 복귀 시에도 체크(오늘 이미 찍었으면 checkDAU 안에서 곧바로 리턴하므로 비용 없음).
  try {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) checkDAU();
    });
  } catch (e) {}
})(window);
