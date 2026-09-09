/* ============================================================
 *  teambattle.js — 팀전(모둠 대항전) 편성
 *  전산회계 오락실 · 교수자 대시보드(admin.html) 전용
 *
 *  기획: 팀전_기획.md
 *
 *  ── 구버전 호환 ──────────────────────────────────────────
 *  이 파일은 **교사용 웹 화면에서만** 쓴다. 학생 앱은 하나도 안 고친다.
 *  건드리는 것은 새로 만든 roster / team_session / team_member 뿐이고,
 *  스토어에 나가 있는 2.0.4 는 이 테이블도 RPC 도 모른다 → 영향 0.
 *  기존 테이블(scores 등)은 **읽기만** 한다.
 *
 *  ── 실력 점수 (기획서 4-1 확정본) ─────────────────────────
 *  ① 게임별 최고점        scores 테이블. 별칭(alias_of)은 본인에게 합산
 *  ② 반 안에서 백분위     midrank = 100 × (순위 − 0.5) ÷ 인원
 *  ③ 3명 미만 게임 제외   혼자 한 게임은 정보가 0인데 50점이 들어간다
 *  ④ 단순 평균            못하는 게임도 세야 전 게임을 고루 한다(교사 확정)
 *  ⑤ 무기록 학생은 0      최하위로 보고 상위권과 한 팀이 되게 한다
 *
 *  ⚠ 이 앱의 점수는 학생이 **저장 버튼을 눌러야만** 기록된다. 그래서 총점·판수는
 *    실력이 아니라 '저장 습관'을 재는 값이다. 비교 가능한 건 최고점뿐이다.
 *
 *  window.TeamBattle 로 노출. admin.html 의 db / currentGid / verifiedPass 를 쓴다.
 * ============================================================ */
(function (global) {
  'use strict';

  var S = {
    roster: [],      // [{name, class_label, alias_of, excluded}]
    scores: [],      // scores 행
    cls: null,       // 지금 보고 있는 반
    absent: {},      // {name:true} 결석
    locked: {},      // {name:true} 자동 편성 시 자리 고정
    teams: [],       // [[name,...], ...]
    skill: {},       // {name: 0~100}
    session: null,   // 진행 중 세션
    rosterOpen: false,
    past: [],        // 끝난 세션(결과 다시 열기)
    edit: {}         // 명단 편집 버퍼 {name:{class_label,alias_of,excluded}}
  };

  /* ⚠ admin.html 의 db·currentGid·dashData·verifiedPass 는 전부 let/const 로 선언돼 있다.
     **let/const 전역은 window 의 속성이 되지 않는다** — global.db 로 읽으면 undefined 라
     load() 가 즉시 반환해 팀전이 통째로 안 떴다(한국사 게임에서도 여섯 번 걸린 함정).
     같은 classic script 끼리는 전역 렉시컬 환경을 공유하므로 **이름으로 직접** 참조한다.
     아직 로드되지 않았을 때를 대비해 typeof 로 감싼다. */
  function sb()   { return typeof db         !== 'undefined' ? db         : null; }
  function gid()  { return typeof currentGid !== 'undefined' ? currentGid : null; }
  function dash() { return typeof dashData   !== 'undefined' && dashData ? dashData : []; }
  function esc(s){ return typeof escHTML === 'function' ? escHTML(s) : String(s == null ? '' : s); }

  /* ── 실력 점수 ─────────────────────────────────────────── */

  // 별칭 해석: DB에 찍힌 이름 → 실제 학생
  function whoMap() {
    var m = {};
    S.roster.forEach(function (r) {
      if (r.excluded) return;
      m[r.name] = r.alias_of || r.name;
    });
    return m;
  }

  function studentsOf(cls) {
    return S.roster
      .filter(function (r) { return !r.excluded && !r.alias_of && r.class_label === cls; })
      .map(function (r) { return r.name; });
  }

  /* 반 안에서 게임별 최고점 → midrank 백분위 → 평균 */
  function computeSkill(cls) {
    var who = whoMap(), names = studentsOf(cls), inClass = {};
    names.forEach(function (n) { inClass[n] = true; });

    // best[학생][게임] = 최고점 (별칭 합산 = 더 높은 쪽)
    var best = {};
    S.scores.forEach(function (row) {
      var owner = who[row.name];
      if (!owner || !inClass[owner]) return;
      var v = parseInt(row.score, 10);
      if (!isFinite(v)) return;
      if (!best[owner]) best[owner] = {};
      if (!(row.game_id in best[owner]) || v > best[owner][row.game_id]) {
        best[owner][row.game_id] = v;
      }
    });

    // 게임별로 그 반에서 기록을 남긴 사람들을 모은다
    var byGame = {};
    Object.keys(best).forEach(function (n) {
      Object.keys(best[n]).forEach(function (g) {
        (byGame[g] = byGame[g] || []).push({ n: n, v: best[n][g] });
      });
    });

    var pct = {};   // pct[학생] = [백분위, ...]
    Object.keys(byGame).forEach(function (g) {
      var list = byGame[g];
      // ③ 3명 미만이 기록한 게임은 통째로 뺀다 — 혼자 한 게임은 정보가 없다
      if (list.length < 3) return;
      list.sort(function (a, b) { return a.v - b.v; });   // 오름차순
      var n = list.length;
      for (var i = 0; i < n; i++) {
        // 동점은 같은 순위(rank)를 준다 — SQL rank() 와 같게
        var rank = i + 1;
        for (var k = i - 1; k >= 0 && list[k].v === list[i].v; k--) rank = k + 1;
        var p = Math.round(100 * (rank - 0.5) / n);
        (pct[list[i].n] = pct[list[i].n] || []).push(p);
      }
    });

    var out = {};
    names.forEach(function (n) {
      var a = pct[n];
      // ⑤ 기록이 아예 없으면 0(최하위)
      out[n] = (a && a.length)
        ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length)
        : 0;
    });
    return out;
  }

  /* ── 편성: 뱀 배치 + 같은 계층 안에서만 교환 ─────────────
     자유 교환을 허용하면 뱀 배치가 만들어 준 '팀마다 상·중·하 한 명씩' 구조가
     깨진다(실제로 6반 1모둠이 55·49·49 중위권만 모였다). 같은 계층(draft
     라운드) 안에서만 바꾸면 그 구조가 유지되면서 팀 평균도 맞춰진다.
     제약을 걸었더니 오히려 평균 편차가 4.2 → 1.3 으로 줄었다. */

  function teamsFromSlots(slots, k) {
    var t = [];
    for (var i = 0; i < k; i++) {
      t.push(slots.map(function (row) { return row[i]; })
                   .filter(function (x) { return x; }));
    }
    return t;
  }

  function meanSpread(slots, k) {
    var t = teamsFromSlots(slots, k), lo = Infinity, hi = -Infinity;
    for (var i = 0; i < k; i++) {
      if (!t[i].length) continue;
      var s = 0;
      for (var j = 0; j < t[i].length; j++) s += S.skill[t[i][j]] || 0;
      var a = s / t[i].length;
      if (a < lo) lo = a;
      if (a > hi) hi = a;
    }
    return hi - lo;
  }

  function autoAssign(k) {
    var names = studentsOf(S.cls).filter(function (n) { return !S.absent[n]; });
    if (!names.length) { S.teams = []; return; }
    k = Math.max(1, Math.min(k, names.length));

    // 잠긴 학생은 지금 자리를 그대로 지킨다
    var fixed = {};
    S.teams.forEach(function (team, ti) {
      team.forEach(function (n) { if (S.locked[n]) fixed[n] = ti; });
    });

    var pool = names.filter(function (n) { return !(n in fixed); })
                    .sort(function (a, b) { return (S.skill[b] || 0) - (S.skill[a] || 0); });

    // 계층(= draft 라운드)별로 지그재그 배치
    var slots = [];
    for (var i = 0; i < pool.length; i += k) {
      var tier = pool.slice(i, i + k), row = new Array(k).fill(null), t = slots.length;
      for (var p = 0; p < tier.length; p++) row[t % 2 === 0 ? p : k - 1 - p] = tier[p];
      slots.push(row);
    }

    // 같은 계층 안에서만 교환해 팀 평균 편차를 줄인다
    S.teams = teamsFromSlots(slots, k);
    for (var pass = 0; pass < 60; pass++) {
      var bestD = meanSpread(slots, k), moved = false;
      for (var r = 0; r < slots.length; r++) {
        for (var a = 0; a < k; a++) for (var b = a + 1; b < k; b++) {
          if (!slots[r][a] || !slots[r][b]) continue;
          var tmp = slots[r][a]; slots[r][a] = slots[r][b]; slots[r][b] = tmp;
          var d = meanSpread(slots, k);
          if (d < bestD - 1e-9) { bestD = d; moved = true; }
          else { tmp = slots[r][a]; slots[r][a] = slots[r][b]; slots[r][b] = tmp; }
        }
      }
      if (!moved) break;
    }

    var teams = teamsFromSlots(slots, k);
    // 잠근 학생을 원래 팀에 되돌려 놓는다
    Object.keys(fixed).forEach(function (n) {
      var ti = Math.min(fixed[n], k - 1);
      if (!teams[ti]) teams[ti] = [];
      teams[ti].push(n);
    });
    S.teams = teams;
  }

  /* ── 렌더 ──────────────────────────────────────────────── */

  function teamStat(team) {
    if (!team.length) return { avg: 0, lo: 0, hi: 0 };
    var v = team.map(function (n) { return S.skill[n] || 0; });
    var s = v.reduce(function (x, y) { return x + y; }, 0);
    return { avg: Math.round(s / v.length), lo: Math.min.apply(null, v), hi: Math.max.apply(null, v) };
  }

  function sessionBar() {
    if (!S.session) return '';
    var url = location.href.replace(/admin\.html.*$/, '') + 'board.html?s=' + encodeURIComponent(S.session.id);
    return '<div class="tb-live">' +
      '<span class="tb-live-dot"></span>' +
      '<b>진행 중</b> ' + esc(S.session.class_label || '') + ' · 세션 <code>' + esc(S.session.id) + '</code>' +
      '<a class="tb-btn" href="' + esc(url) + '" target="_blank">전광판 열기 ↗</a>' +
      '<a class="tb-btn" href="' + esc(url.replace('board.html','result.html')) + '" target="_blank">결과 보기 ↗</a>' +
      '<button class="tb-btn" onclick="TeamBattle.finish()">세션 종료</button>' +
      '</div>';
  }

  /* 지난 세션 — 수업이 끝난 뒤 결과를 다시 열어 상을 줄 수 있어야 한다 */
  function pastList() {
    if (!S.past || !S.past.length) return '';
    var root = location.href.replace(/admin\.html.*$/, '');
    return '<div class="tb-past"><div class="tb-pt">지난 세션</div>' +
      S.past.map(function (p) {
        var d = new Date(p.started_at);
        var when = (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
                   String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        return '<a class="tb-prow" href="' + esc(root) + 'result.html?s=' + encodeURIComponent(p.id) + '" target="_blank">' +
          '<span class="tb-pw">' + when + '</span>' +
          '<span class="tb-pn">' + esc(p.class_label || '전체') + ' · ' + esc(p.title || '팀전') + '</span>' +
          '<span class="tb-pc">' + esc(p.id) + '</span>' +
          '<span class="tb-pg">결과 ↗</span></a>';
      }).join('') + '</div>';
  }

  function render() {
    var host = document.getElementById('tb-body');
    if (!host) return;
    var classes = [];
    S.roster.forEach(function (r) {
      if (!r.excluded && !r.alias_of && r.class_label && classes.indexOf(r.class_label) < 0) {
        classes.push(r.class_label);
      }
    });
    classes.sort();
    if (!S.cls && classes.length) { S.cls = classes[0]; S.skill = computeSkill(S.cls); }

    var all = S.cls ? studentsOf(S.cls) : [];
    var present = all.filter(function (n) { return !S.absent[n]; });

    var h = sessionBar();
    h += '<div class="tb-bar">';
    h += '<label>반</label><select id="tb-cls" onchange="TeamBattle.setClass(this.value)">' +
         classes.map(function (c) {
           return '<option' + (c === S.cls ? ' selected' : '') + '>' + esc(c) + '</option>';
         }).join('') + '</select>';
    h += '<label>팀 수</label><input id="tb-k" type="number" min="1" max="10" value="' +
         (S.teams.length || Math.max(1, Math.round(present.length / 4))) + '">';
    h += '<button class="tb-btn primary" onclick="TeamBattle.auto()">↻ 자동 편성</button>';
    h += '<span class="tb-count">출석 <b>' + present.length + '</b>/' + all.length + '</span>';
    h += '<button class="tb-btn" onclick="TeamBattle.toggleRoster()">명단 관리</button>';
    h += '</div>';

    // 출석 체크
    h += '<div class="tb-attend" id="tb-attend">';
    h += all.map(function (n) {
      return '<label class="tb-chip' + (S.absent[n] ? ' off' : '') + '">' +
             '<input type="checkbox"' + (S.absent[n] ? '' : ' checked') +
             ' onchange="TeamBattle.setAbsent(\'' + esc(n).replace(/'/g, '&#39;') + '\',!this.checked)">' +
             esc(n) + '<i>' + (S.skill[n] || 0) + '</i></label>';
    }).join('');
    h += '</div>';

    // 팀 카드
    if (S.teams.length) {
      h += '<div class="tb-teams">';
      S.teams.forEach(function (team, i) {
        var st = teamStat(team);
        h += '<div class="tb-team" ondragover="event.preventDefault()" ' +
             'ondrop="TeamBattle.drop(event,' + i + ')">';
        h += '<div class="tb-th"><b>' + (i + 1) + '모둠</b>' +
             '<span>평균 ' + st.avg + ' · ' + team.length + '명</span></div>';
        h += team.slice().sort(function (a, b) { return (S.skill[b] || 0) - (S.skill[a] || 0); })
              .map(function (n) {
                var nk = esc(n).replace(/'/g, '&#39;');
                return '<div class="tb-card' + (S.locked[n] ? ' lock' : '') + '" draggable="true" ' +
                  'ondragstart="TeamBattle.drag(event,\'' + nk + '\')">' +
                  '<span class="tb-n">' + esc(n) + '</span>' +
                  '<span class="tb-s">' + (S.skill[n] || 0) + '</span>' +
                  '<button class="tb-lk" title="자리 고정" onclick="TeamBattle.toggleLock(\'' + nk + '\')">' +
                  (S.locked[n] ? '🔒' : '🔓') + '</button></div>';
              }).join('');
        h += '</div>';
      });
      h += '</div>';

      h += '<div class="tb-go">';
      h += '<label>게임</label><select id="tb-games" multiple size="4">' +
           GAMES.map(function (g) {
             return '<option value="' + g[0] + '">' + g[1] + '</option>';
           }).join('') + '</select>';
      h += '<div class="tb-go-r">' +
           '<div class="tb-hint">여러 개 고르면 게임마다 “그 시간 1등 대비 %”로 환산해 합산합니다.<br>' +
           '아무것도 안 고르면 전체 게임이 집계됩니다.</div>' +
           '<button class="tb-btn primary" onclick="TeamBattle.start()">세션 시작 ▶</button></div>';
      h += '</div>';
    }
    h += rosterPanel();
    h += pastList();
    host.innerHTML = h;
  }

  /* ── 명단 관리 ─────────────────────────────────────────────
     교사가 화면에서 반·별칭·제외를 고칠 수 있어야 한다. 안 그러면 새 학생이
     올 때마다 SQL 을 손대야 한다.
     **DB에 기록이 있는데 명단에 없는 이름을 맨 위에 띄우는 것**이 핵심이다 —
     닉네임을 바꿨거나 새로 들어온 학생이 그렇게 드러난다. */
  function cur(name, field) {
    if (S.edit[name] && field in S.edit[name]) return S.edit[name][field];
    var r = S.roster.filter(function (x) { return x.name === name; })[0];
    return r ? (r[field] || '') : '';
  }

  function rosterPanel() {
    if (!S.rosterOpen) return '';
    // DB(scores)에 있는 이름까지 모두 모은다 — 명단에 없는 새 이름을 찾아내려고
    var known = {}, all = [];
    S.roster.forEach(function (r) { if (!known[r.name]) { known[r.name] = 1; all.push(r.name); } });
    var isNew = {};
    S.scores.forEach(function (row) {
      if (!known[row.name]) { known[row.name] = 1; all.push(row.name); isNew[row.name] = 1; }
    });

    var classes = [];
    S.roster.forEach(function (r) {
      if (r.class_label && classes.indexOf(r.class_label) < 0) classes.push(r.class_label);
    });
    classes.sort();
    var reals = S.roster.filter(function (r) { return !r.excluded && !r.alias_of; })
                        .map(function (r) { return r.name; }).sort();

    // 새 이름 먼저, 그다음 반·이름 순
    all.sort(function (a, b) {
      if (!!isNew[a] !== !!isNew[b]) return isNew[a] ? -1 : 1;
      var ca = cur(a, 'class_label'), cb = cur(b, 'class_label');
      return (ca === cb) ? a.localeCompare(b, 'ko') : (ca || '힣').localeCompare(cb || '힣', 'ko');
    });

    var h = '<div class="tb-roster" id="tb-roster">';
    h += '<div class="tb-rhead"><b>명단 관리</b>' +
         '<span>반을 지정해야 팀을 짤 수 있습니다. 닉네임을 바꾼 학생은 “실제 주인”을 골라 주세요.</span>' +
         '<button class="tb-btn primary" onclick="TeamBattle.saveRoster()">명단 저장</button></div>';
    h += '<table class="tb-rt"><thead><tr><th>이름</th><th>반</th><th>실제 주인(닉네임 변경 시)</th><th>제외</th></tr></thead><tbody>';
    h += all.map(function (n) {
      var nk = esc(n).replace(/'/g, "\\'");
      var al = cur(n, 'alias_of'), exc = !!cur(n, 'excluded');
      return '<tr' + (isNew[n] ? ' class="new"' : '') + '>' +
        '<td>' + esc(n) + (isNew[n] ? ' <i class="tb-new">새 이름</i>' : '') + '</td>' +
        '<td><input list="tb-classes" value="' + esc(cur(n, 'class_label')) + '"' +
          (al ? ' disabled' : '') +
          ' onchange="TeamBattle.setRow(\'' + nk + '\',\'class_label\',this.value)"></td>' +
        '<td><select onchange="TeamBattle.setRow(\'' + nk + '\',\'alias_of\',this.value)">' +
          '<option value="">— 본인 —</option>' +
          reals.filter(function (x) { return x !== n; }).map(function (x) {
            return '<option' + (al === x ? ' selected' : '') + '>' + esc(x) + '</option>';
          }).join('') + '</select></td>' +
        '<td style="text-align:center"><input type="checkbox"' + (exc ? ' checked' : '') +
          ' onchange="TeamBattle.setRow(\'' + nk + '\',\'excluded\',this.checked)"></td></tr>';
    }).join('');
    h += '</tbody></table>';
    h += '<datalist id="tb-classes">' + classes.map(function (c) {
      return '<option value="' + esc(c) + '">';
    }).join('') + '</datalist>';
    h += '</div>';
    return h;
  }

  var GAMES = [
    ['acid', '계정과목 산성비'], ['memory', '기억의 전당'], ['debit', '차변대변'],
    ['factory', '분개 공장'], ['flight', '결산 비행'], ['theory', '이론 객관식'],
    ['cost_lv1', '원가의 길(1급)'], ['capital_lv1', '자본(1급)'],
    ['voucher_lv1', '전표(1급)'], ['vat_lv1', '부가세(1급)'], ['alloc_lv1', '배분(1급)'],
    ['theory_lv1', '이론(1급)']
  ];

  /* ── 조작 ──────────────────────────────────────────────── */

  var dragging = null;
  var api = {
    setClass: function (c) { S.cls = c; S.skill = computeSkill(c); S.teams = []; S.locked = {}; render(); },
    setAbsent: function (n, off) { if (off) S.absent[n] = true; else delete S.absent[n]; render(); },
    toggleLock: function (n) { if (S.locked[n]) delete S.locked[n]; else S.locked[n] = true; render(); },
    auto: function () {
      var k = parseInt((document.getElementById('tb-k') || {}).value, 10);
      autoAssign(isFinite(k) && k > 0 ? k : Math.max(1, Math.round(
        studentsOf(S.cls).filter(function (n) { return !S.absent[n]; }).length / 4)));
      render();
    },
    drag: function (e, n) { dragging = n; try { e.dataTransfer.setData('text/plain', n); } catch (x) {} },
    drop: function (e, ti) {
      e.preventDefault();
      var n = dragging || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
      if (!n) return;
      S.teams = S.teams.map(function (t) {
        return t.filter(function (x) { return x !== n; });
      });
      if (!S.teams[ti]) S.teams[ti] = [];
      S.teams[ti].push(n);
      dragging = null;
      render();
    },
    toggleRoster: function () {
      S.rosterOpen = !S.rosterOpen;
      render();
      if (S.rosterOpen) {
        var el = document.getElementById('tb-roster');
        if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    },
    setRow: function (name, field, val) {
      var r = S.edit[name] || (S.edit[name] = {});
      r[field] = val;
      if (field === 'alias_of' && val) { r.class_label = ''; }   // 별칭은 반을 안 갖는다
      render();
    },
    state: function () { return S; }
  };

  /* ── 저장 ──────────────────────────────────────────────── */

  // 교사 비번은 admin.html 의 verifiedPass 를 재사용하고, 없을 때만 한 번 묻는다
  function askPass() {
    if (typeof verifiedPass !== 'undefined' && verifiedPass) return verifiedPass;
    var p = prompt('대시보드 비밀번호를 입력해주세요:');
    return p == null ? null : p.trim();
  }

  api.start = async function () {
    if (!S.teams.length) { alert('먼저 팀을 편성해주세요.'); return; }
    var pass = askPass();
    if (pass == null) return;

    var members = [];
    S.teams.forEach(function (t, i) {
      t.forEach(function (n) { members.push({ name: n, team: i + 1 }); });
    });
    var sel = document.getElementById('tb-games');
    var games = sel ? Array.prototype.slice.call(sel.selectedOptions).map(function (o) { return o.value; }) : [];

    try {
      var res = await sb().rpc('team_session_start', {
        p_group_id: gid(), p_pass: pass, p_class: S.cls,
        p_title: (S.cls || '') + ' 팀전',
        p_games: games.length ? games : null,
        p_members: members
      });
      if (res.error) throw res.error;
      if (res.data === 'wrong_pass') { try { verifiedPass = null; } catch (x) {} alert('비밀번호가 일치하지 않습니다.'); return; }
      if (res.data === 'invalid')    { alert('팀 편성이 비어 있습니다.'); return; }
      try { verifiedPass = pass; } catch (x) {}   // 다음 저장 때 재입력 안 받도록
      var url = location.href.replace(/admin\.html.*$/, '') + 'board.html?s=' + encodeURIComponent(res.data);
      S.session = { id: res.data, class_label: S.cls };
      render();
      if (confirm('세션이 시작됐습니다 (코드 ' + res.data + ').\n전광판을 새 창으로 열까요?')) {
        window.open(url, '_blank');
      }
    } catch (e) {
      console.error(e);
      alert('세션 시작 실패 — 인터넷 연결을 확인해 주세요.');
    }
  };

  api.saveRoster = async function () {
    var pass = askPass();
    if (pass == null) return;
    var names = {};
    S.roster.forEach(function (r) { names[r.name] = 1; });
    S.scores.forEach(function (r) { names[r.name] = 1; });
    var rows = Object.keys(names).map(function (n) {
      return { name: n, class_label: cur(n, 'class_label') || null,
               alias_of: cur(n, 'alias_of') || null, excluded: !!cur(n, 'excluded') };
    });
    try {
      var res = await sb().rpc('team_roster_set', { p_group_id: gid(), p_pass: pass, p_rows: rows });
      if (res.error) throw res.error;
      if (res.data === 'wrong_pass') { try { verifiedPass = null; } catch (x) {} alert('비밀번호가 일치하지 않습니다.'); return; }
      try { verifiedPass = pass; } catch (x) {}
      S.edit = {};
      await api.load();                 // 저장한 명단으로 실력 점수를 다시 계산한다
      S.rosterOpen = true; render();
      alert('명단을 저장했습니다.');
    } catch (e) { console.error(e); alert('명단 저장 실패 — 인터넷 연결을 확인해 주세요.'); }
  };

  api.finish = async function () {
    if (!S.session) return;
    if (!confirm('세션을 종료할까요? 전광판의 시계가 멈추고 이후 기록은 집계되지 않습니다.')) return;
    var pass = askPass();
    if (pass == null) return;
    try {
      var res = await sb().rpc('team_session_finish',
        { p_group_id: gid(), p_pass: pass, p_session_id: S.session.id });
      if (res.error) throw res.error;
      if (res.data === 'wrong_pass') { try { verifiedPass = null; } catch (x) {} alert('비밀번호가 일치하지 않습니다.'); return; }
      try { verifiedPass = pass; } catch (x) {}
      S.session = null; render();
    } catch (e) { alert('세션 종료 실패 — 인터넷 연결을 확인해 주세요.'); }
  };

  /* ── 진입점 ────────────────────────────────────────────── */

  api.load = async function () {
    if (!sb() || !gid()) return;
    try {
      var r = await sb().from('roster').select('name,class_label,alias_of,excluded').eq('group_id', gid());
      // roster 테이블이 아직 없는 DB(마이그레이션 전)면 조용히 접는다
      if (r.error) { console.warn('roster 없음 — 팀전 비활성', r.error.message); return; }
      S.roster = r.data || [];
      S.scores = dash();
      if (!S.roster.length) {
        var host = document.getElementById('tb-body');
        if (host) host.innerHTML = '<div class="tb-empty">이 그룹은 아직 반 명단이 없습니다.<br>' +
          '학생 이름에 반을 지정해야 팀을 짤 수 있어요.</div>';
        return;
      }
      // 아직 안 끝난 세션이 있으면 이어받는다(창을 닫아도 코드를 다시 찾을 수 있게)
      var ses = await sb().from('team_session')
        .select('id,class_label,title,started_at,ended_at').eq('group_id', gid())
        .order('started_at', { ascending: false }).limit(12);
      var list = ses.data || [];
      S.session = list.filter(function (x) { return !x.ended_at; })[0] || null;
      S.past = list.filter(function (x) { return !!x.ended_at; }).slice(0, 8);

      S.cls = null; S.teams = []; S.absent = {}; S.locked = {}; S.edit = {};
      render();
    } catch (e) { console.warn('팀전 로드 실패', e); }
  };

  global.TeamBattle = api;
})(window);
