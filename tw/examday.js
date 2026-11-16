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
  // 臺灣版(2026-11-15): 勞動部 116年度全國技術士技能檢定 公告(行政院公報 第32卷第160期, 2026-08-28) —
  //   14901 會計事務-人工記帳 丙級은 第3梯次에만: 學科 116/11/7(日), 報名 8/27~9/7. 第1(3/14)·第2(7/4) 梯次엔 없음.
  //   출처 https://www.rootlaw.com.tw/Attach/S-Doc/02311508280009-001.pdf (天災 등으로 바뀌면 技檢中心 공고 따름)
  //   在校生專案(高職 商科, 보통 5월 토요일)은 116년 날짜 공식 공고를 못 찾음 → 넣지 않음, 학생이 '修改'로 직접 넣게 안내.
  //   117년 공고(보통 8월 말 공보)가 나오면 여기에 더할 것.
  var OFFICIAL = ['2027-11-07'];
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
  function ddayText(days) { return days > 0 ? '剩 ' + days + ' 天' : '考試當天'; }

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
      de.textContent = '請輸入考試日';
      if (note) note.style.display = 'none';   // 같은 말 두 줄 → 한 줄(11/15 화면 글 짧게)
      if (btn) btn.textContent = '📅 設定考試日';
      return;
    }
    dd.textContent = ddayText(c.days);
    // 2026-10-18 성일님 "깔끔하게" — 자동(공식 일정)일 때 붙던 '· 공식 일정 기준' 뺌
    de.textContent = (c.auto ? '全國技檢 ' : '考試日 ') + fmt(c.d) + (c.auto ? '' : ' · 自行設定');
    if (note) {
      if (c.auto) { note.style.display = ''; note.textContent = '請輸入你的考試日期'; }   // 같은 날 '한국세무사회(…)에서 꼭 확인하세요' 뺌
      else note.style.display = 'none';
    }
    if (btn) btn.textContent = '✏️ 修改';
  }

  /* '✏️ 변경' — 비우면 직접 설정을 지우고 공식 일정으로 돌아간다 */
  async function edit(after) {
    if (!global.Ask) return;
    var c = current();
    var input = await Ask.prompt('請輸入考試日期（例：' + (c ? c.date : '2027-11-07') + '）\n留空則恢復預設', saved() || '');
    if (input === null) return;
    var v = String(input).trim();
    if (!v) { try { localStorage.removeItem(KEY); } catch (e) {} render(); if (after) after(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !parse(v)) { await Ask.alert('日期格式不正確。例: 2027-11-07'); return; }
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
    var good = await Ask.confirm(fmt(parse(p.date)) + ' 的考試，考得怎麼樣？\n結果出來前先訂好下一個目標，比較容易持續。',
      { ok: '覺得不錯', cancel: '準備下一次' });
    try { localStorage.setItem(k, good ? 'good' : 'retry'); } catch (e) {}
    try { if (global.DayLog) DayLog.hit('act', 'postexam_' + (lv2 ? 'lv2' : 'lv1'), good ? 'good' : 'retry'); } catch (e) {}
    if (good) {
      // 臺灣版: 沒有更高級別，只給鼓勵
      await Ask.alert('辛苦了！\n期待你的好消息。');
      return true;
    }
    var c = current();
    var msg = c ? '下次考試是 ' + fmt(c.d) + '(還有 ' + c.days + ' 天)。\n先從答錯的題目開始複習吧。' : '先從答錯的題目開始複習吧。';
    var rv = await Ask.confirm(msg, { ok: '去複習', cancel: '晚點再說' });
    if (rv) location.href = 'review.html';
    return true;
  }

  global.ExamDay = { OFFICIAL: OFFICIAL, current: current, justPassed: justPassed, render: render, edit: edit, fmt: fmt, ymd: ymd, afterExamOnce: afterExamOnce };
})(window);
