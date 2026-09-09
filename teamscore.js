/* ============================================================
 *  teamscore.js — 팀전 세션 점수 계산 (전광판·결과 화면 공용)
 *  기획: 팀전_기획.md 6장
 *
 *  전광판(board.html)과 결과 화면(result.html)이 **같은 식을 써야** 한다.
 *  따로 두면 성장 공식·별칭 처리·상한이 나중에 반드시 어긋난다.
 *
 *  ── 세션 점수 = 그 시간에 세운 최고점 ──────────────────────
 *  · 게임 1개  → 그 게임 최고점 그대로(전광판에 실제 점수가 뜬다)
 *  · 여러 개   → 게임마다 "그 게임 세션 1등 대비 %" 로 환산해 합산
 *    (raw 를 그냥 더하면 flight 10만이 debit 5천을 압도한다)
 *
 *  ── 성장 점수 = 자기 이전 최고점 대비 몇 % 올랐나 ──────────
 *  절대 증가분으로 재면 잘하는 학생이 또 이긴다
 *  (10만→11만 = +1만  vs  100→200 = +100). 비율이라야 하위권이 유리하다.
 *  · 기준선은 반드시 **세션 시작 이전** 기록만. `scores` 는 upsert_score 가
 *    수업 중에도 갱신해서 오늘 점수가 이미 섞여 있다 → score_history 를 쓴다.
 *  · 처음 하는 게임은 GROW_CAP(첫 도전도 성장이고 0으로 나눌 수 없다).
 *  · 게임당 상한 100 — 없으면 아주 낮은 기준선 하나가 순위를 뒤집는다
 *    (100→5,000 이면 +4,900%).
 *
 *  ── 팀 점수 = 팀원 평균 ────────────────────────────────────
 *  합계로 하면 인원 많은 팀이 유리하고 한 명이 캐리하면 이질 편성이 무의미해진다.
 *  평균이면 전원이 올라야 팀이 오른다. 미참여는 0점으로 세야 정직하다.
 *
 *  ⚠ 별칭(roster.alias_of)을 반드시 되돌려야 한다. 학생이 닉네임을 바꾸면
 *    기록이 다른 이름으로 쌓여, 그대로 대조하면 그 학생이 통째로 0점이 된다.
 * ============================================================ */
(function (global) {
  'use strict';

  var GROW_CAP = 100;

  /* rows(세션 중 기록) → best[학생][게임] = 최고점 */
  function bestOf(rows, opt) {
    var games = (opt.session.game_ids && opt.session.game_ids.length) ? opt.session.game_ids : null;
    var inS = {}; opt.members.forEach(function (m) { inS[m.student_name] = 1; });
    var end = opt.session.ended_at ? new Date(opt.session.ended_at) : null;
    var alias = opt.alias || {};
    var best = {};
    (rows || []).forEach(function (r) {
      var n = alias[r.user_name] || r.user_name;
      if (!inS[n]) return;
      if (games && games.indexOf(r.game_id) < 0) return;
      if (end && new Date(r.played_at) > end) return;      // 종료 후 기록은 안 센다
      var v = parseInt(r.score, 10);
      if (!isFinite(v)) return;
      if (!best[n]) best[n] = {};
      if (!(r.game_id in best[n]) || v > best[n][r.game_id]) best[n][r.game_id] = v;
    });
    return best;
  }

  function growth(name, sessionBest, baseline) {
    var base = (baseline || {})[name] || {}, g = 0;
    Object.keys(sessionBest).forEach(function (gid) {
      var now = sessionBest[gid], was = base[gid] || 0;
      if (was <= 0) g += GROW_CAP;                                  // 처음 해 본 게임
      else if (now > was) g += Math.min(GROW_CAP, 100 * (now - was) / was);
    });
    return Math.round(g);
  }

  function compute(opt) {
    var games = (opt.session.game_ids && opt.session.game_ids.length) ? opt.session.game_ids : null;
    var best = bestOf(opt.rows, opt);

    // 게임별 그 세션 1등 — 여러 게임일 때 환산 기준
    var top = {};
    Object.keys(best).forEach(function (n) {
      Object.keys(best[n]).forEach(function (g) {
        if (!(g in top) || best[n][g] > top[g]) top[g] = best[n][g];
      });
    });

    var multi = !games || games.length > 1;
    var solo = opt.members.map(function (m) {
      var b = best[m.student_name] || {}, sc = 0;
      if (multi) {
        Object.keys(b).forEach(function (g) { if (top[g] > 0) sc += 100 * b[g] / top[g]; });
        sc = Math.round(sc);
      } else {
        sc = b[games[0]] || 0;
      }
      return {
        name: m.student_name, team: m.team_no, score: sc,
        grow: growth(m.student_name, b, opt.baseline), best: b
      };
    });

    var names = opt.session.team_names || {};
    function teamRank(key) {
      var byTeam = {};
      solo.forEach(function (x) { (byTeam[x.team] = byTeam[x.team] || []).push(x); });
      return Object.keys(byTeam).map(function (t) {
        var list = byTeam[t];
        var sum = list.reduce(function (a, m) { return a + m[key]; }, 0);
        return {
          no: +t, name: names[t] || (t + '모둠'),
          score: Math.round(sum / list.length),
          members: list.slice().sort(function (a, b) { return b[key] - a[key]; })
        };
      }).sort(function (a, b) { return b.score - a.score || a.no - b.no; });
    }

    var byScore = solo.slice().sort(function (a, b) {
      return b.score - a.score || a.name.localeCompare(b.name, 'ko'); });
    var byGrow = solo.slice().sort(function (a, b) {
      return b.grow - a.grow || a.name.localeCompare(b.name, 'ko'); });

    return { solo: solo, byScore: byScore, byGrow: byGrow,
             teams: teamRank('score'), growTeams: teamRank('grow'), top: top, multi: multi };
  }

  /* score_history 를 읽어 baseline(세션 시작 이전 게임별 최고점)을 만든다.
     이름으로 거르지 않는다 — 별칭으로 남은 기록도 가져와야 하기 때문. */
  async function loadBaseline(db, session, members, alias) {
    var inS = {}; members.forEach(function (m) { inS[m.student_name] = 1; });
    var out = {};
    var res = await db.from('score_history').select('user_name,game_id,score')
      .eq('group_id', session.group_id).lt('played_at', session.started_at).limit(20000);
    if (res.error || !res.data) return out;
    res.data.forEach(function (r) {
      var n = (alias || {})[r.user_name] || r.user_name;
      if (!inS[n]) return;
      var v = parseInt(r.score, 10);
      if (!isFinite(v)) return;
      if (!out[n]) out[n] = {};
      if (!(r.game_id in out[n]) || v > out[n][r.game_id]) out[n][r.game_id] = v;
    });
    return out;
  }

  async function loadAlias(db, groupId) {
    var a = {};
    var res = await db.from('roster').select('name,alias_of').eq('group_id', groupId);
    if (res.data) res.data.forEach(function (r) { if (r.alias_of) a[r.name] = r.alias_of; });
    return a;
  }

  global.TeamScore = { compute: compute, loadBaseline: loadBaseline, loadAlias: loadAlias, GROW_CAP: GROW_CAP };
})(window);
