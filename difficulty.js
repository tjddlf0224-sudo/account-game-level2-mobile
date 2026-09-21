/* ============================================================
 *  difficulty.js — 게임별 난이도(1/2) 공통 모듈
 *  전산회계 오락실
 *
 *  배경(2026-08-28 기출 대조 분석):
 *   118회 기출 실측 결과, 게임 최고등급 학생들이 실제 시험에서 0점을 받는
 *   일이 반복됐다(결산 '마스터' 12명 중 6명이 결산 0점). 원인은 게임이
 *   "보기에서 고르기"에서 멈춰 있고, 시험은 "금액을 계산해 직접 입력"을
 *   요구했기 때문. 그렇다고 게임 전체를 어렵게 만들면 처음 하는 학생이
 *   포기하므로, 난이도를 둘로 나눈다.
 *
 *   - 난이도 1 : 기존과 100% 동일. 초보자 진입 경험을 절대 건드리지 않는다.
 *   - 난이도 2 : 실전형(금액 입력, 복수 계정, 실제 장부 조회 등).
 *                난이도 1에서 실력을 증명해야 열린다.
 *
 *  ⚠️ 해금 기준이 '점수'가 아니라 '정답률'인 이유:
 *   기존 점수 체계는 오래 반복하면 계속 오르는 구조다(기억의 전당은
 *   4스테이지 이후 무한 반복 누적 — 실제로 20,055점=약 40회 반복인 학생이
 *   있었고, 그 학생과 기출 13점인 학생이 나란히 최상위였다). 점수를 기준으로
 *   삼으면 "오래 앉아 있던 학생"이 해금되지 "아는 학생"이 해금되지 않는다.
 *   그래서 정답률 + 최소 문항 수로 판정한다.
 *
 *  게임 쪽 연동은 두 줄이면 끝난다(게임 내부 변수명에 의존하지 않음):
 *    const LV = Difficulty.get(GAME_ID);            // 시작 시 분기
 *    Difficulty.reportRound(GAME_ID, 맞은수, 총문항);  // 라운드 종료 시 1회
 * ============================================================ */
(function () {
  'use strict';

  var UNLOCK_ACC = 0.70;   // 정답률 70% 이상
  var UNLOCK_MIN = 10;     // 최소 10문항은 풀어야 인정(1~2문항 요행 방지)
  var SYNC_GAMES = ['acid', 'memory', 'debit', 'factory', 'flight'];   // 난이도2 해금이 있는 게임(서버 복원 대상)

  function k(pre, g) { return 'hub_' + pre + '_' + g; }
  function safeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function safeSet(key, v) { try { localStorage.setItem(key, v); } catch (e) {} }

  var D = {
    UNLOCK_ACC: UNLOCK_ACC,
    UNLOCK_MIN: UNLOCK_MIN,

    /* 난이도 2가 열렸는가 */
    isUnlocked: function (g) {
      return safeGet(k('lv2', g)) === '1';
    },

    /* 지금 플레이할 난이도 — 해금 안 됐으면 무조건 1 */
    get: function (g) {
      if (!this.isUnlocked(g)) return 1;
      return safeGet(k('lv', g)) === '2' ? 2 : 1;
    },

    /* 난이도 선택(해금 전에는 2로 못 바꿈) */
    set: function (g, lv) {
      if (lv === 2 && !this.isUnlocked(g)) return false;
      safeSet(k('lv', g), String(lv === 2 ? 2 : 1));
      return true;
    },

    /* 지금까지의 최고 정답률(%) — 허브에서 해금까지 얼마 남았는지 보여줄 때 씀 */
    bestAcc: function (g) {
      var v = parseInt(safeGet(k('acc', g)) || '0', 10);
      return isNaN(v) ? 0 : v;
    },

    /* 라운드 종료 시 게임이 호출. 해금됐으면 true 반환(축하 연출용) */
    reportRound: function (g, correct, total) {
      correct = Math.max(0, correct || 0);
      total = Math.max(0, total || 0);
      if (total < UNLOCK_MIN) return false;

      var acc = correct / total;
      var pct = Math.round(acc * 100);
      if (pct > this.bestAcc(g)) safeSet(k('acc', g), String(pct));

      if (acc >= UNLOCK_ACC && !this.isUnlocked(g)) {
        safeSet(k('lv2', g), '1');
        return true;              // 이번 판에 새로 열림
      }
      return false;
    },

    /* 한 판이 끝날 때마다 게임이 호출(1단계·2단계 모두) — 서버에 "이 판은 몇 단계였나"를 남긴다.
       ⚠ level 은 반드시 게임이 그 판에 실제로 쓴 LV 를 넘긴다. this.get() 으로 추정하지 않는 이유:
         플라이트처럼 저장값(hub_lv_*)은 2인데 게임이 LV 를 1로 고정하는 경우가 있고, 해금 여부와
         무관하게 학생이 1단계를 골라 할 수도 있다. 화면을 그린 변수와 기록하는 변수를 같게 둬야
         둘이 어긋나지 않는다.
       해금 판정(reportRound)과는 완전히 별개 — 여기서 실패해도 해금·결과화면에 영향이 없다. */
    logRound: function (g, level, correct, total, score) {
      try {
        if (level !== 1 && level !== 2) return;
        if (window.Growth && Growth.logRound) {
          Growth.logRound({ game: g, level: level, correct: correct, total: total,
                            unlocked: this.isUnlocked(g), score: score });
        }
      } catch (e) {}
    },

    /* 계정 기준 해금 복원(2026-09-21). 해금 표시(hub_lv2_*)는 localStorage 라 기기·재설치마다 잠겼다.
       로그인(닉네임)한 학생의 서버 기록(level_rounds)을 읽어서 다음 중 하나면 이 기기에도 해금을 채운다.
         · 기록에 unlocked=true 가 있다(그때 이미 해금돼 있었다)
         · 1단계 판 중 10문항 이상·정답률 70% 이상인 판이 있다(reportRound 와 같은 기준)
       채우기만 하고 지우지는 않는다(서버 기록이 없어도 이 기기의 해금은 유지 — 다음 판 기록에 unlocked=true 로 올라간다).
       바뀐 게 있으면 'difficulty-synced' 이벤트를 쏜다 — 화면이 그 이벤트로 잠금 표시를 다시 그린다.
       서버 조회 실패·오프라인은 조용히 무시. 같은 학생·그룹이면 5분에 한 번만 조회(force 면 무시). */
    syncFromServer: function (force) {
      try {
        if (!window.Growth || !Growth.fetchUnlockRows) return;
        var u = (safeGet('hub_nickname') || '').trim();
        if (!u) return;
        var gid = safeGet('hub_group_id') || '';
        var stamp = null;
        try { stamp = JSON.parse(safeGet('hub_lvsync') || 'null'); } catch (e) {}
        var now = new Date().getTime();
        if (!force && stamp && stamp.u === u && stamp.g === gid && now - stamp.t < 300000) return;
        var self = this;
        Growth.fetchUnlockRows(SYNC_GAMES, function (rows) {
          if (!rows) return;                                   // 실패 — 도장 안 찍어서 다음에 다시 시도
          safeSet('hub_lvsync', JSON.stringify({ u: u, g: gid, t: new Date().getTime() }));
          var changed = false, best = {}, open = {};
          rows.forEach(function (x) {
            var g = x.game_id, total = x.total || 0, acc = total ? (x.correct || 0) / total : 0;
            if (x.unlocked === true) open[g] = true;
            if (x.level === 1 && total >= UNLOCK_MIN) {
              best[g] = Math.max(best[g] || 0, Math.round(acc * 100));
              if (acc >= UNLOCK_ACC) open[g] = true;
            }
          });
          SYNC_GAMES.forEach(function (g) {
            if (open[g] && !self.isUnlocked(g)) { safeSet(k('lv2', g), '1'); changed = true; }
            if (best[g] && best[g] > self.bestAcc(g)) { safeSet(k('acc', g), String(best[g])); changed = true; }
          });
          if (changed) {
            try { window.dispatchEvent(new Event('difficulty-synced')); } catch (e) {}
          }
        });
      } catch (e) {}
    },

    /* 기억의 전당처럼 정답률로 재기 어려운 게임용 — 완주 조건으로 해금 */
    unlockByClear: function (g) {
      if (this.isUnlocked(g)) return false;
      safeSet(k('lv2', g), '1');
      return true;
    },

    /* 해금까지 남은 정도를 사람 말로 */
    hint: function (g) {
      if (this.isUnlocked(g)) return '난이도 2 해금됨';
      var b = this.bestAcc(g);
      if (b === 0) return '난이도 1에서 정답률 70%를 넘기면 열려요';
      return '최고 정답률 ' + b + '% — 70%를 넘기면 난이도 2가 열려요';
    }
  };

  window.Difficulty = D;

  // 로그인한 학생이면 페이지가 뜬 뒤(growth.js·supabase 로드 끝난 뒤) 서버 기록으로 해금을 복원하고,
  // 앱이 백그라운드에서 돌아올 때도 다시 본다(5분 제한은 syncFromServer 안에서).
  try {
    window.addEventListener('load', function () { setTimeout(function () { D.syncFromServer(); }, 300); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) D.syncFromServer(); });
  } catch (e) {}
})();
