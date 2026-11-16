/* ============================================================
 *  skill.js — 분개 기술 숙련(안쪽 4단계 lv 0~3, 화면엔 고수·달인 둘만 — 11/3 성일님 "새내기, 숙련자는 아예 빼")
 *  전산회계 오락실 · 2026-11-03 신설 (팀장 #44, 성일님 "진행해" · 안: ~/개발팀/넘김/전산_숙련4단계_숨은보스_안_2026-11-03.md)
 *
 *  무엇을. 문제를 맞힐 때마다 그 문제의 '기술'(현금·외상·감가상각·부가세 …)에 정답 1개를 쌓고,
 *  아래 RULES 확률로 한 단계씩 승급한다. 틀려도 내려가지 않는다. 기존 한 판 점수 등급표·랭킹·저장은 그대로.
 *  승급은 화면에 띄우지 않는다(11/3 성일님 "추천대로 빼고" — 승급 띠·판 끝 모아 보기 삭제, 화면이 지저분해지지 않게).
 *  단계는 성장 화면 '내 기술 도감'에서만 보인다(고수 전 이름만 흐리게, 달인 금색). 띠 코드는 git 기록(d8f9fe8)에 남아 있음.
 *
 *  기술 정하기 — 문제에 이미 있는 정보로(새 태그 없음):
 *    Skill.ofAccount('외상매출금') → 'credit'   계정과목 이름 규칙(아래 ACCOUNT_RULES, 위에서부터 먼저 맞는 것)
 *    Skill.ofTopic('유형자산')     → 'asset'    이론 단원·1급 분개 단원(TOPIC_MAP)
 *  게임은 정답 순간에 Skill.hit(기술키) 한 줄만 부른다. 이론 퀴즈는 Growth.logTopicAttempt 를 감싸 자동으로.
 *
 *  저장: 기기 안 localStorage am_skill = { 닉네임: { 기술키: { lv: 0~3, n: 이 단계에서 맞힌 수, t: 총 정답 } } }
 *        (서버 칸 없음. 기기를 옮기면 처음부터 — 필요하면 나중에 계정 동기화)
 *  행동 기록: AmEv.log('skill_up', { sk, lv }) — lv 는 단계 번호(1=안 보이는 중간 단계·2=고수·3=달인), 이름은 안 보냄(이름을 바꿔도 기록이 이어짐)
 * ============================================================ */
(function (global) {
  'use strict';
  if (global.Skill) return;

  /* ── 숫자는 여기 한 곳(팀장 11/3 "상수 한 곳에") ──
     lv(지금 단계) → 다음 단계로: 이 단계에서 min 개째 정답부터 정답마다 p 확률, max 개째엔 반드시.
     평균: lv0→1 약 6개 · lv1→2(고수) 약 16개(고수까지 약 22) · lv2→3(달인) 약 39개(합 약 61, tests/skill.test.js 가 1만 번 돌려 확인) */
  var STAGES = [null, null, '上級者', '達人'];   // 화면에 보이는 단계 이름 — null 은 어디에도 안 보임(11/3 성일님 "새내기, 숙련자는 아예 빼"). 안쪽 사다리(lv 0~3)·확률·저장·am_ev 는 그대로
  var RULES = [
    { min: 3,  p: 0.25, max: 10 },   // lv0 → lv1 (화면엔 안 보임)
    { min: 10, p: 0.12, max: 25 },   // lv1 → 고수
    { min: 25, p: 0.06, max: 60 }    // 고수 → 달인
  ];

  /* 기술 14가지 — 보여 주는 이름은 '○○의 달인'에 그대로 들어간다 */
  var SKILLS = [
    { key: 'cash',    name: '現金' },
    { key: 'credit',  name: '掛け' },
    { key: 'note',    name: '電子記録債権' },
    { key: 'goods',   name: '商品' },
    { key: 'asset',   name: '固定資産' },
    { key: 'debt',    name: '負債' },
    { key: 'equity',  name: '純資産' },
    { key: 'revenue', name: '収益' },
    { key: 'expense', name: '費用' },
    { key: 'closing', name: '決算' },
    { key: 'vat',     name: '消費税' },
    { key: 'cost',    name: '工業簿記' },   // 日本版: 2級(工業簿記)用の枠。3級では使わない
    { key: 'ledger',  name: '帳簿' },
    { key: 'basics',  name: '簿記の基本' }
  ];
  var NAME = {}; SKILLS.forEach(function (s) { NAME[s.key] = s.name; });

  /* 계정과목 이름 → 기술. 위에서부터 먼저 맞는 규칙(예: '감가상각비'는 비용보다 감가상각, '상품매출'은 상품보다 수익) */
  var ACCOUNT_RULES = [
    [/前払(保険料|家賃|費用)|前受(家賃|手数料|収益)|未収(利息|収益)|未払(利息|家賃|費用)|仮払法人税等/, 'closing'],
    [/消費税/, 'vat'],
    [/減価償却|建物|備品|車両|土地|固定資産/, 'asset'],
    [/電子記録/, 'note'],
    [/売掛金|買掛金|未収入金|未払金|前払金|前受金|貸付金|貸倒|立替金|仮払金|仮受金|保証金/, 'credit'],
    [/売上原価|繰越商品|^商品$|^仕入|貯蔵品/, 'goods'],
    [/資本金|剰余金|準備金/, 'equity'],
    [/損$|損失$/, 'expense'],
    [/売上|受取|益$/, 'revenue'],
    [/借入金|当座借越|預り金|未払法人税|未払配当/, 'debt'],
    [/現金|預金/, 'cash'],
    [/費$|料$|給料|法定福利|租税公課|支払|法人税|発送|諸会費/, 'expense']
  ];

  function ofAccount(name) {
    var s = String(name || '').replace(/\s+/g, '').replace(/\([^)]*\)$/, '');   // 1급 '교육훈련비(제)'·'수수료비용(영업외)' 꼴
    if (!s) return null;
    for (var i = 0; i < ACCOUNT_RULES.length; i++) if (ACCOUNT_RULES[i][0].test(s)) return ACCOUNT_RULES[i][1];
    return null;
  }

  /* 이론 단원(2급·1급)·1급 분개의 탑 단원 → 기술 */
  var TOPIC_MAP = {
    '簿記の基礎・帳簿': 'basics', '現金預金': 'cash', '債権債務': 'credit', '商品売買': 'goods', '固定資産': 'asset',
    '決算': 'closing', '株式会社・税金': 'equity',
    '負債': 'debt', '純資産': 'equity', '収益': 'revenue', '費用': 'expense'
  };
  function ofTopic(t) { return TOPIC_MAP[String(t || '').trim()] || null; }

  /* ── 저장 ── */
  var LS = 'am_skill';
  function user() { try { return (localStorage.getItem('hub_nickname') || '').trim() || 'ゲスト'; } catch (e) { return 'ゲスト'; } }
  function loadAll() { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } }
  function saveAll(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} }
  function mine() { var o = loadAll(), u = user(); return o[u] || {}; }

  var rand = Math.random;

  /* 정답 1개. 올랐으면 { sk, lv, name, stage } 아니면 null */
  function hit(sk) {
    try {
      if (!NAME[sk]) return null;
      var o = loadAll(), u = user(), me = o[u] = o[u] || {};
      var st = me[sk] = me[sk] || { lv: 0, n: 0, t: 0 };
      st.t = (st.t || 0) + 1;
      var up = null;
      if (st.lv < RULES.length) {
        st.n = (st.n || 0) + 1;
        var r = RULES[st.lv];
        if (st.n >= r.max || (st.n >= r.min && rand() < r.p)) {
          st.lv++; st.n = 0;
          up = { sk: sk, lv: st.lv, name: NAME[sk], stage: STAGES[st.lv] };
        }
      }
      saveAll(o);
      if (up) { try { if (global.AmEv) global.AmEv.log('skill_up', { sk: sk, lv: up.lv }); } catch (e) {} }   // 화면엔 안 띄움, 기록만(분석용)
      return up;
    } catch (e) { return null; }
  }
  function hitAccount(name) { var k = ofAccount(name); return k ? hit(k) : null; }
  function hitTopic(t) { var k = ofTopic(t); return k ? hit(k) : null; }
  /* 분개 한 건(여러 계정) — 기술이 겹치면 한 번만 */
  function hitEntry(accounts) {
    var seen = {}, out = [];
    (accounts || []).forEach(function (a) { var k = ofAccount(a); if (k && !seen[k]) { seen[k] = 1; var u = hit(k); if (u) out.push(u); } });
    return out;
  }

  /* 도감용 */
  function list() {
    var me = mine();
    return SKILLS.map(function (s) {
      var st = me[s.key] || { lv: 0, n: 0, t: 0 };
      var r = RULES[st.lv];
      return { key: s.key, name: s.name, lv: st.lv, stage: STAGES[st.lv], total: st.t || 0, met: (st.t || 0) > 0,
               left: r ? Math.max(0, r.max - (st.n || 0)) : 0, max: r ? r.max : 0, n: st.n || 0 };
    });
  }

  global.Skill = {
    STAGES: STAGES, RULES: RULES, SKILLS: SKILLS,
    ofAccount: ofAccount, ofTopic: ofTopic,
    hit: hit, hitAccount: hitAccount, hitTopic: hitTopic, hitEntry: hitEntry,
    list: list,
    _setRand: function (f) { rand = f || Math.random; }   // 시험용
  };

  /* 이론 문항(theory·theory_lv1·원가의 길/세무의 길 이론)은 Growth.logTopicAttempt 를 감싸 자동으로 */
  (function hook() {
    var tries = 0;
    function tryHook() {
      var G = global.Growth;
      if (!G) return false;
      if (!G.__skillHooked && typeof G.logTopicAttempt === 'function') {
        var orig = G.logTopicAttempt;
        G.logTopicAttempt = function (opts) {
          try { if (opts && opts.correct) hitTopic(opts.topic); } catch (e) {}
          return orig.apply(G, arguments);
        };
        G.__skillHooked = true;
      }
      return G.__skillHooked;
    }
    if (!tryHook()) { var t = setInterval(function () { if (tryHook() || ++tries > 40) clearInterval(t); }, 50); }
  })();
})(window);
