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
})();
