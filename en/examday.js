/* ============================================================
 *  examday.js - shared exam-date (D-day) module.
 *  US edition: there is no single national exam date, so the countdown is disabled.
 *  The API is kept so other scripts keep working; everything returns "nothing".
 *  window.ExamDay
 * ============================================================ */
(function (global) {
  'use strict';
  // US edition: no official exam dates.
  var OFFICIAL = [];
  var KEY = 'hub_examdate';

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var d = new Date(s + 'T00:00:00'); return isNaN(d.getTime()) ? null : d; }
  function today0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function diff(a, b) { return Math.round((a.getTime() - b.getTime()) / 86400000); }
  function saved() { try { var v = localStorage.getItem(KEY); return v && parse(v) ? v : null; } catch (e) { return null; } }

  /* 지금 보여 줄 시험일 — { date:'YYYY-MM-DD', d: Date, days: 남은 날, auto: 공식표 값인가 } 또는 null(모름) */
  function current() {
    return null;   // US edition: no exam countdown
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
  function ddayText(days) { return days > 1 ? days + ' days left' : days === 1 ? '1 day left' : 'Exam day'; }

  /* 허브의 D-day 상자(#ed-dday · #ed-date · #ed-set-btn)를 채운다. 안내 줄(#ed-note)은 없으면 만든다. */
  function render() {
    var dd = document.getElementById('ed-dday'), de = document.getElementById('ed-date'), btn = document.getElementById('ed-set-btn');
    // US edition: no single exam date, so show nothing.
    if (dd) dd.style.display = 'none'; if (de) de.style.display = 'none'; if (btn) btn.style.display = 'none';
    return;
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
      de.textContent = 'Enter your exam date';
      if (note) { note.style.display = ''; note.innerHTML = 'Enter the date you booked'; }
      if (btn) btn.textContent = 'Set Exam Date';
      return;
    }
    dd.textContent = ddayText(c.days);
    // 2026-10-18 성일님 "깔끔하게" — 자동(공식 일정)일 때 붙던 '· 공식 일정 기준' 뺌
    de.textContent = (c.auto ? 'Exam ' : 'Exam date ') + fmt(c.d) + (c.auto ? '' : ' · set by you');
    if (note) {
      if (c.auto) { note.style.display = ''; note.textContent = 'Enter the date you booked'; }   // 같은 날 '한국세무사회(…)에서 꼭 확인하세요' 뺌
      else note.style.display = 'none';
    }
    if (btn) btn.textContent = 'Edit';
  }

  /* '✏️ 변경' — 비우면 직접 설정을 지우고 공식 일정으로 돌아간다 */
  async function edit(after) {
    if (!global.Ask) return;
    var c = current();
    var input = await Ask.prompt('Enter your exam date (e.g. ' + (c ? c.date : '2027-02-28') + ')\nLeave blank to clear it', saved() || '');
    if (input === null) return;
    var v = String(input).trim();
    if (!v) { try { localStorage.removeItem(KEY); } catch (e) {} render(); if (after) after(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !parse(v)) { await Ask.alert('Invalid date format. Example: 2027-02-28'); return; }
    try { localStorage.setItem(KEY, v); } catch (e) {}
    render(); if (after) after();
  }

  /* 시험 뒤 다음 목표로 잇기 — 시험 다음 날부터 5일 동안 허브에서 **한 번만** 묻는다(답하면 다시 안 묻는다).
     답은 기기 안에만 둔다(합격 여부를 서버에 보내지 않는다). 하루 합계에는 어느 쪽을 골랐는지만 +1(아이디 없음).
     level: 'lv2'(2급 허브) | 'lv1'(1급 허브). 물었으면 true */
  async function afterExamOnce(level) {
    return false;   // US edition: no exam, no post-exam prompt
    if (!global.Ask || !Ask.confirm) return false;
    var p = justPassed(5);
    if (!p) return false;
    var k = 'am_postexam_' + p.date;
    try { if (localStorage.getItem(k)) return false; localStorage.setItem(k, '1'); } catch (e) { return false; }
    var lv2 = level !== 'lv1';
    var good = await Ask.confirm(fmt(parse(p.date)) + ' exam: how did it go?\nPick your next goal to keep going.',
      { ok: 'Went well', cancel: 'Next exam' });
    try { localStorage.setItem(k, good ? 'good' : 'retry'); } catch (e) {}
    try { if (global.DayLog) DayLog.hit('act', 'postexam_' + (lv2 ? 'lv2' : 'lv1'), good ? 'good' : 'retry'); } catch (e) {}
    if (good) {
      await Ask.alert('Nice work! Hope you passed.');
      return true;
    }
    var c = current();
    var msg = c ? 'Next exam: ' + fmt(c.d) + ' (' + c.days + (c.days === 1 ? ' day' : ' days') + ' left).\nReview the questions you missed.' : 'Review the questions you missed.';
    var rv = await Ask.confirm(msg, { ok: 'Review', cancel: 'Later' });
    if (rv) location.href = 'review.html';
    return true;
  }

  global.ExamDay = { OFFICIAL: OFFICIAL, current: current, justPassed: justPassed, render: render, edit: edit, fmt: fmt, ymd: ymd, afterExamOnce: afterExamOnce };
})(window);
