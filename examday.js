/* ============================================================
 *  examday.js — 시험일(D-day) 공용 · 2026-10-09
 *
 *  왜. 허브의 D-day 는 사용자가 직접 날짜를 넣어야만 떴고(대부분 안 넣음), 지난 날짜는
 *  'D+N' 으로 계속 남았다. 시험 대비 앱에서 D-day 는 다시 올 이유 그 자체다(분석팀 10/3).
 *
 *  규칙.
 *   1. 사용자가 정한 날짜(hub_examdate)가 오늘 이후면 그게 먼저다('직접 설정').
 *   2. 없거나 지났으면 **공식 일정 표**에서 오늘 이후 가장 가까운 날('공식 일정 기준').
 *      → 시험일이 지나면 저절로 다음 회차로 넘어간다.
 *   3. 표의 마지막 날짜가 지나면 자동값을 내지 않는다("다음 시험일을 확인해 주세요").
 *  ⚠ 일정은 **규칙으로 계산하지 말고 표로** 둔다 — 짝수달 첫째 토요일이 보통이지만 2026년 2월 회차는
 *    1월 31일(1월 마지막 토)이었다. 해마다 한국세무사회 공식 발표를 보고 OFFICIAL 에 더할 것.
 *    1급·2급은 같은 날 시행.
 *
 *  window.ExamDay
 * ============================================================ */
(function (global) {
  'use strict';
  // 2026 전산세무회계 정기시험(한국세무사회). 2027 일정이 발표되면 여기에 더한다.
  var OFFICIAL = ['2026-01-31', '2026-04-04', '2026-06-06', '2026-08-01', '2026-10-03', '2026-12-05'];
  var KEY = 'hub_examdate';

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var d = new Date(s + 'T00:00:00'); return isNaN(d.getTime()) ? null : d; }
  function today0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function diff(a, b) { return Math.round((a.getTime() - b.getTime()) / 86400000); }
  function saved() { try { var v = localStorage.getItem(KEY); return v && parse(v) ? v : null; } catch (e) { return null; } }

  /* 지금 보여 줄 시험일 — { date:'YYYY-MM-DD', d: Date, days: 남은 날, auto: 공식표 값인가 } 또는 null(모름) */
  function current() {
    var t = today0(), u = saved();
    if (u && diff(parse(u), t) >= 0) return { date: u, d: parse(u), days: diff(parse(u), t), auto: false };
    for (var i = 0; i < OFFICIAL.length; i++) {
      var d = parse(OFFICIAL[i]);
      if (diff(d, t) >= 0) return { date: OFFICIAL[i], d: d, days: diff(d, t), auto: true };
    }
    return null;
  }
  /* 며칠 전에 끝난 시험(1~maxDays 일 전) — 사용자 날짜와 공식표 둘 다 본다. 없으면 null */
  function justPassed(maxDays) {
    var t = today0(), best = null, cand = OFFICIAL.slice();
    var u = saved(); if (u) cand.push(u);
    cand.forEach(function (s) {
      var g = diff(t, parse(s));
      if (g >= 1 && g <= (maxDays || 5) && (!best || g < best.ago)) best = { date: s, ago: g };
    });
    return best;
  }
  function fmt(d) { return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()); }
  function ddayText(days) { return days > 0 ? 'D-' + days : 'D-DAY'; }

  /* 허브의 D-day 상자(#ed-dday · #ed-date · #ed-set-btn)를 채운다. 안내 줄(#ed-note)은 없으면 만든다. */
  function render() {
    var dd = document.getElementById('ed-dday'), de = document.getElementById('ed-date'), btn = document.getElementById('ed-set-btn');
    if (!dd || !de) return;
    var note = document.getElementById('ed-note');
    if (!note && de.parentNode) {
      note = document.createElement('div');
      note.id = 'ed-note'; note.className = 'ed-note';
      de.parentNode.insertBefore(note, de.nextSibling);
    }
    var c = current();
    if (!c) {
      dd.textContent = 'D-?';
      de.textContent = '다음 시험일을 확인해 주세요';
      if (note) { note.style.display = ''; note.innerHTML = '한국세무사회(license.kacpta.or.kr)에서 일정을 확인하고 직접 넣어 주세요'; }
      if (btn) btn.textContent = '📅 시험일 설정';
      return;
    }
    dd.textContent = ddayText(c.days);
    de.textContent = '시험일 ' + fmt(c.d) + ' · ' + (c.auto ? '공식 일정 기준' : '직접 설정');
    if (note) {
      if (c.auto) { note.style.display = ''; note.textContent = '시험일은 바뀔 수 있어요 · 한국세무사회(license.kacpta.or.kr)에서 꼭 확인하세요'; }
      else note.style.display = 'none';
    }
    if (btn) btn.textContent = '✏️ 변경';
  }

  /* '✏️ 변경' — 비우면 직접 설정을 지우고 공식 일정으로 돌아간다 */
  async function edit(after) {
    if (!global.Ask) return;
    var c = current();
    var input = await Ask.prompt('전산회계 시험일을 입력하세요 (예: ' + (c ? c.date : '2026-12-05') + ')\n비우면 공식 일정으로 돌아가요', saved() || '');
    if (input === null) return;
    var v = String(input).trim();
    if (!v) { try { localStorage.removeItem(KEY); } catch (e) {} render(); if (after) after(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !parse(v)) { await Ask.alert('날짜 형식이 올바르지 않아요. 예: 2026-12-05'); return; }
    try { localStorage.setItem(KEY, v); } catch (e) {}
    render(); if (after) after();
  }

  /* 시험 뒤 다음 목표로 잇기 — 시험 다음 날부터 5일 동안 허브에서 **한 번만** 묻는다(답하면 다시 안 묻는다).
     답은 기기 안에만 둔다(합격 여부를 서버에 보내지 않는다). 하루 합계에는 어느 쪽을 골랐는지만 +1(아이디 없음).
     level: 'lv2'(2급 허브) | 'lv1'(1급 허브). 물었으면 true */
  async function afterExamOnce(level) {
    if (!global.Ask || !Ask.confirm) return false;
    var p = justPassed(5);
    if (!p) return false;
    var k = 'am_postexam_' + p.date;
    try { if (localStorage.getItem(k)) return false; localStorage.setItem(k, '1'); } catch (e) { return false; }
    var lv2 = level !== 'lv1';
    var good = await Ask.confirm(fmt(parse(p.date)) + ' 시험 잘 보셨나요?\n결과가 나오기 전이라도 다음 목표를 정해 두면 좋아요.',
      { ok: lv2 ? '잘 봤어요 · 1급 도전' : '잘 봤어요', cancel: '다음 회차 준비' });
    try { localStorage.setItem(k, good ? 'good' : 'retry'); } catch (e) {}
    try { if (global.DayLog) DayLog.hit('act', 'postexam_' + (lv2 ? 'lv2' : 'lv1'), good ? 'good' : 'retry'); } catch (e) {}
    if (good) {
      if (lv2) {
        var go = await Ask.confirm('수고 많으셨어요!\n1급은 원가회계·부가가치세가 더해져요. 1급 허브에서 이어 가 볼까요?', { ok: '1급 허브로', cancel: '나중에' });
        if (go) { try { localStorage.setItem('hub_level', 'lv1'); } catch (e) {} location.href = 'index_lv1.html'; }
      } else {
        await Ask.alert('수고 많으셨어요!\n합격 소식 기다릴게요.');
      }
      return true;
    }
    var c = current();
    var msg = c ? '다음 시험은 ' + fmt(c.d) + ' (D-' + c.days + ')이에요.\n틀렸던 문제부터 다시 잡아 볼까요?' : '틀렸던 문제부터 다시 잡아 볼까요?';
    var rv = await Ask.confirm(msg, { ok: '오답 복습', cancel: '나중에' });
    if (rv) location.href = 'review.html';
    return true;
  }

  global.ExamDay = { OFFICIAL: OFFICIAL, current: current, justPassed: justPassed, render: render, edit: edit, fmt: fmt, ymd: ymd, afterExamOnce: afterExamOnce };
})(window);
