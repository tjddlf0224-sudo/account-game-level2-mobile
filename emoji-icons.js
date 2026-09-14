/* ============================================================
 *  emoji-icons.js  —  이모지 → 자체제작 네온 라인 SVG 아이콘
 *  전산회계 오락실 (account-game-level2-mobile)
 *
 *  - 소스 데이터(문자열)는 이모지 그대로 두고, 렌더링된 DOM에서만
 *    시각적으로 치환한다 (다국어/DB/로그 등 데이터 계층은 건드리지 않음).
 *  - 정적 HTML은 최초 1회, 게임 로직이 innerHTML로 동적 주입하는
 *    이모지는 MutationObserver로 실시간 포착해 동일하게 치환한다.
 *  - 화살표(→ ← ↑ ↓ ↔ ↗ ↺ ↻ ☰ ➕)와 체크/엑스(✓ ✅ ✗ ✕ ❌ ★)는
 *    타이포그래픽 기호로 보고 이번 치환 대상에서 제외했다.
 * ============================================================ */
(function (global) {
  'use strict';

  // 2026-08 업데이트: 글로우 없는 순수 라인 스타일로 확정.
  // 대부분은 currentColor로 주변 텍스트 색을 그대로 물려받고(문맥에 자동으로 맞음),
  // 등수를 뜻하는 메달(금·은·동)과 상태 점(초록·노랑·빨강)만 의미 전달을 위해 고정 색을 유지한다.
  function svg(color, glow, inner) {
    var body = inner.split(color).join('currentColor');
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;display:inline-block;' +
      'vertical-align:-0.15em;overflow:visible">' + body + '</svg>';
  }

  // ── 재사용 베이스 도형 ──
  var MEDAL = '<path d="M8 3h8l-2 6.5"/><path d="M8 3 6 9.5"/><circle cx="12" cy="15" r="5.5"/>' +
    '<path d="M12 12.2l1 2.3h2.4l-1.9 1.5.7 2.4-2.2-1.4-2.2 1.4.7-2.4-1.9-1.5h2.4z"/>';
  var POINT = '<path d="M13 3.3a1.4 1.4 0 0 0-2.8 0v6.8L8.4 8.6a1.5 1.5 0 0 0-2.2 2l3.8 5.8A4 4 0 0 0 13.4 18h1.6a4 4 0 0 0 4-4V8.2a1.4 1.4 0 0 0-2.8 0V7a1.4 1.4 0 0 0-2.8 0V6a1.4 1.4 0 0 0-1.4-1.3z"/>';

  function medal(color) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;display:inline-block;' +
      'vertical-align:-0.15em;overflow:visible">' + MEDAL + '</svg>';
  }
  function point(color, glow, deg) {
    return svg(color, glow, '<g transform="rotate(' + deg + ' 12 12)">' + POINT + '</g>');
  }
  /* ── 컬러 아이콘(제미나이 생성, 2026-09-14) ─────────────────────────
     라인 SVG 로는 허접하던 것들만 골라 컬러 아트로 교체했다(사용자 지적:
     "산성비에서 쓰는 폭탄, 얼음 svg가 좀 허접했거든").
     **전부 바꾸지는 않는다** — 게임 화면 안에서 크게 보이거나(28px+, 움직임)
     결과화면 한가운데, 허브 노드에 오는 28종만. 버튼 안·글자 옆의 작은
     아이콘은 라인 SVG 가 오히려 낫다(작은 크기에서 또렷하고 currentColor 로
     주변 글자색을 물려받는다). 기준과 프롬프트는
     docs/이모지_제미나이_프롬프트.md 참고.
     경로는 페이지 기준 상대경로다 — www 루트에서만 로드되므로 문제없다. */
  function img(name) {
    return '<img src="assets/icons/' + name + '.webp" alt="" aria-hidden="true" ' +
      'style="width:1.15em;height:1.15em;display:inline-block;vertical-align:-0.25em;' +
      'object-fit:contain">';
  }

  function dot(color) {
    return '<svg viewBox="0 0 24 24" style="width:1em;height:1em;display:inline-block;vertical-align:-0.15em;overflow:visible">' +
      '<circle cx="12" cy="12" r="7.5" fill="' + color + '" stroke="none"/></svg>';
  }

  // ── 색상 팔레트 (기존 카드/버튼 네온 톤과 통일) ──
  var GOLD = '#FFD34D', GOLDG = '#FFD34D99';
  var SILVER = '#C7D2E0', SILVERG = '#C7D2E099';
  var BRONZE = '#D98A5C', BRONZEG = '#D98A5C99';
  var CYAN = '#4DF0FF', CYANG = '#4DF0FF99';
  var PURPLE = '#B98CFF', PURPLEG = '#B98CFF99';
  var PINK = '#FF6A9E', PINKG = '#FF6A9E99';
  var ORANGE = '#FF7A45', ORANGEG = '#FF7A4599';
  var ORANGE2 = '#FF9F4D', ORANGE2G = '#FF9F4D99';
  var GREEN = '#4ADE80', GREENG = '#4ADE8099';
  var RED = '#FF4D6A', REDG = '#FF4D6A99';
  var GRAY = '#8A93B0', GRAYG = '#8A93B080';
  var WHITE = '#E8ECF6', WHITEG = '#E8ECF680';
  var ICEBLUE = '#9FE8FF', ICEBLUEG = '#9FE8FF99';
  var BLUE = '#7EA6FF', BLUEG = '#7EA6FF99';

  var ICONS = {
    // 등급 · 메달
    '🥇': img('medal1'),
    '🥈': img('medal2'),
    '🥉': img('medal3'),
    '🎖': img('rosette'),
    '🏅': img('laurel'),
    '👑': img('crown'),
    '🏆': img('trophy'),
    '⭐': img('star'),
    '💎': img('gem'),

    // 음악 · 소리
    '🎵': svg(PURPLE, PURPLEG, '<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>'),
    '🔊': svg(CYAN, CYANG, '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
    '🔇': svg(GRAY, GRAYG, '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9l5 6M21 9l-5 6"/>'),

    // 문서 · UI
    '📋': svg(CYAN, CYANG, '<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2.5" width="6" height="3" rx="1"/>' +
      '<path d="M8 10h8M8 14h8M8 18h5"/>'),
    '📝': svg(CYAN, CYANG, '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
    '✏': svg(GOLD, GOLDG, '<path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20z"/><path d="M13.5 6.5L17.5 10.5"/>'),
    '📖': svg(PURPLE, PURPLEG, '<path d="M12 6c-1.8-1.3-4-2-6.5-2S3 4.3 3 4.3v14S5.2 18 7.5 18s4 .7 4.5 2c.5-1.3 2-2 4.5-2s4.5.3 4.5.3v-14S18.8 4 16.5 4 13.8 4.7 12 6z"/><path d="M12 6v12"/>'),
    '📁': svg(GOLD, GOLDG, '<path d="M4 6h6l2 2h8v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/>'),
    '🗂': svg(PURPLE, PURPLEG, '<path d="M4 6h6l2 2h8v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/><path d="M8 6v3M12 6v3"/>'),
    '📌': svg(PINK, PINKG, '<path d="M9 3h6l-1 6 4 4-5 1-3 6-1-6-5-1 4-4z"/>'),
    '📅': svg(CYAN, CYANG, '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/>'),
    '⏱': svg(CYAN, CYANG, '<circle cx="12" cy="13" r="8"/><path d="M12 13V9"/><path d="M9.5 2h5"/><path d="M12 2v2.5"/>'),
    '⏰': svg(CYAN, CYANG, '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5"/><path d="M4.5 4L7 6.5M19.5 4L17 6.5"/>'),
    '💾': svg(CYAN, CYANG, '<path d="M5 3h12l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v6h8V3"/><rect x="8" y="14" width="8" height="6"/>'),
    '🔍': svg(CYAN, CYANG, '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-5-5"/>'),
    '🗑': svg(RED, REDG, '<path d="M5 7h14M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10 11v6M14 11v6"/>'),
    '📊': svg(GREEN, GREENG, '<path d="M5 20V13M10 20V8M15 20v-5M20 20v3"/>'),
    '📈': svg(GREEN, GREENG, '<path d="M4 17l5-5 4 4 8-9"/><path d="M15 6h5v5"/>'),
    '📉': svg(RED, REDG, '<path d="M4 7l5 5 4-4 8 9"/><path d="M15 18h5v-5"/>'),

    // 게임 · 도메인
    '🎯': img('target'),
    '🎮': svg(PURPLE, PURPLEG, '<path d="M6 9h12a4 4 0 0 1 4 4.5l-.8 3a2 2 0 0 1-3.4.9L15 14H9l-2.8 3.4a2 2 0 0 1-3.4-.9l-.8-3A4 4 0 0 1 6 9z"/>' +
      '<path d="M8 11v3M6.5 12.5h3"/><circle cx="16" cy="11.5" r=".8" fill="' + PURPLE + '" stroke="none"/><circle cx="18" cy="13.5" r=".8" fill="' + PURPLE + '" stroke="none"/>'),
    '🛡': img('shield'),
    '🧲': img('magnet'),
    '🚀': img('rocket'),
    '🏁': svg(WHITE, WHITEG, '<path d="M5 3v18"/><path d="M5 4h6v3h-3v3h3v3H5z"/><path d="M11 4h6v3h-3v3h3v3h-6z"/>'),
    '🧮': svg(ORANGE2, ORANGE2G, '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 10h16M4 15h16"/>' +
      '<circle cx="8" cy="7" r="1.3" fill="' + ORANGE2 + '" stroke="none"/><circle cx="13" cy="7" r="1.3" fill="' + ORANGE2 + '" stroke="none"/>' +
      '<circle cx="9" cy="12.5" r="1.3" fill="' + ORANGE2 + '" stroke="none"/><circle cx="16" cy="12.5" r="1.3" fill="' + ORANGE2 + '" stroke="none"/>' +
      '<circle cx="7" cy="18" r="1.3" fill="' + ORANGE2 + '" stroke="none"/><circle cx="14" cy="18" r="1.3" fill="' + ORANGE2 + '" stroke="none"/>'),
    '💰': img('coin'),
    '💊': img('pill'),
    '❄': img('ice'),
    '🔥': img('fire'),
    '💡': svg(GOLD, GOLDG, '<path d="M9 18h6M10 21h4"/><path d="M12 2a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9v.2h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 2z"/>'),
    '💣': img('bomb'),
    '💥': img('boom'),
    '🎁': img('gift'),
    '🎉': img('party'),
    '✨': svg(GOLD, GOLDG, '<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 15l.7 2.1L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.9z"/>'),
    '🌱': svg(GREEN, GREENG, '<path d="M12 21v-8"/><path d="M12 13c0-4-3-6-7-6 0 4 3 6 7 6zM12 13c0-3 2-5 5-5 0 3-2 5-5 5z"/>'),
    '🔧': svg(GRAY, GRAYG, '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2z"/>'),
    '🔄': svg(CYAN, CYANG, '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>'),

    // 상태 · 경고
    '⚠': svg(GOLD, GOLDG, '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 17.5h.01"/>'),
    '🚨': svg(RED, REDG, '<path d="M12 3a4 4 0 0 1 4 4v6H8V7a4 4 0 0 1 4-4z"/><path d="M4 20h16M6 20v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><path d="M12 3V1"/>'),
    '🔓': svg(GOLD, GOLDG, '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
    '🟢': dot(GREEN, GREENG),
    '🟡': dot(GOLD, GOLDG),
    '🔴': dot(RED, REDG),

    // 사람 · 손짓
    '👥': svg(CYAN, CYANG, '<circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/>' +
      '<path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M14.5 14.7c2.6.3 4.5 2.2 4.5 5.3"/>'),
    '👤': svg(CYAN, CYANG, '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>'),
    '👈': point(CYAN, CYANG, -90),
    '👉': point(CYAN, CYANG, 90),
    '👆': point(CYAN, CYANG, 0),
    '👀': svg(CYAN, CYANG, '<ellipse cx="8" cy="12" rx="4" ry="3.2"/><ellipse cx="16" cy="12" rx="4" ry="3.2"/>' +
      '<circle cx="8" cy="12" r="1.4" fill="' + CYAN + '" stroke="none"/><circle cx="16" cy="12" r="1.4" fill="' + CYAN + '" stroke="none"/>'),
    '👏': svg(GOLD, GOLDG, '<path d="M9 3l6 6-2 2-6-6z"/><path d="M15 9l4 4-6 6-7-7 2-2 5 5 4-4z"/>'),
    '💪': svg(ORANGE, ORANGEG, '<path d="M4 14c0-2 1-3 2-3 0-3 2-5 5-5 2 0 3.5 1 4.5 2.5.8-.3 1.7 0 2 .8.4 1-.1 2-1 2.3 0 3-2 5.5-5.5 5.5H8a4 4 0 0 1-4-4z"/>'),
    '😢': svg(BLUE, BLUEG, '<circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01"/><path d="M8 16c1-1.3 2.5-2 4-2s3 .7 4 2"/><path d="M7 12l-1.5 3M17 12l1.5 3"/>'),

    // 기기 · 장소
    '🏠': svg(CYAN, CYANG, '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h5v-6h2v6h5V10"/>'),
    '💼': svg(CYAN, CYANG, '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>'),
    '📱': svg(CYAN, CYANG, '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 19h2"/>'),
    '📴': svg(GRAY, GRAYG, '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M4 4l16 16"/>'),
    '📺': svg(CYAN, CYANG, '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8M9 6l3-3 3 3"/>'),

    /* ── 2026-09-14 추가분 ──────────────────────────────────────────
       그때까지 66종만 치환되고 있어서 나머지는 OS 기본 이모지가 그대로
       튀어나왔다(사용자 지적: 원가의 길 결과창의 "🚪 중도 이탈").
       기기·OS 마다 모양이 달라 화면 톤이 깨진다. 아래는 실제로 쓰이는데
       빠져 있던 것들 — 같은 24x24 라인 스타일로 맞췄다.
       ⚠ 체크·엑스·화살표(✓ ✅ ✗ ✕ ❌ ★ ✔ ☰ ➕ ⬆ ⬇ 🔁)는 파일 머리말대로
         **타이포그래픽 기호라 일부러 제외한다** — 건드리지 말 것. */

    // 스테이지 · 장소
    '🏭': img('factory'),
    '🏛': img('temple'),
    '🚪': svg(GOLD, GOLDG, '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 3v18"/><circle cx="12.5" cy="12" r="1" fill="' + GOLD + '" stroke="none"/>'),
    '☁': img('raincloud'),
    '🌙': svg(ICEBLUE, ICEBLUEG, '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>'),

    // 운송 · 물류
    '🛩': img('plane'),
    '🚚': svg(GOLD, GOLDG, '<path d="M2 6h11v10H2z"/><path d="M13 9h4l3 3.5V16h-7z"/><circle cx="6.5" cy="18" r="2"/><circle cx="16.5" cy="18" r="2"/>'),
    '📦': svg(GOLD, GOLDG, '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>'),
    '🚶': svg(WHITE, WHITEG, '<circle cx="13" cy="4.5" r="2"/><path d="M13 8l-3 4 1 4-2 4"/><path d="M13 8l3 3 2 4"/><path d="M10 12L7 10"/>'),

    // 도구 · 사물
    '🔒': svg(GRAY, GRAYG, '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    '🔑': svg(GOLD, GOLDG, '<circle cx="8" cy="8" r="4.5"/><path d="M11.2 11.2L20 20"/><path d="M17 17l2-2M15 15l2-2"/>'),
    '⚙': svg(GRAY, GRAYG, '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3"/>'),
    '🔧': svg(GRAY, GRAYG, '<path d="M15.5 3a6 6 0 0 0-5.2 9L3 19.3 4.7 21l7.3-7.3A6 6 0 0 0 21 8.5l-3.3 3.3-2.5-2.5L18.5 6A6 6 0 0 0 15.5 3z"/>'),
    '🪚': svg(GRAY, GRAYG, '<path d="M3 8h13l4 4-4 4"/><path d="M4 12h1.5M7 12h1.5M10 12h1.5M13 12h1.5"/><path d="M3 8v8"/>'),
    '🔌': svg(GOLD, GOLDG, '<path d="M9 3v6M15 3v6"/><path d="M6 9h12v3a6 6 0 0 1-12 0z"/><path d="M12 18v3"/>'),
    '🔔': svg(GOLD, GOLDG, '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>'),
    '🧴': svg(ICEBLUE, ICEBLUEG, '<path d="M9 3h4v3H9z"/><path d="M8 6h6a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z"/><path d="M5 12h12"/>'),
    '☕': svg(BRONZE, BRONZEG, '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M7 3v2M11 3v2"/>'),
    '🍚': svg(WHITE, WHITEG, '<path d="M4 12h16a8 8 0 0 1-8 7 8 8 0 0 1-8-7z"/><path d="M8 9c1-2 2.5-3 4-3s3 1 4 3"/>'),
    '⚔': svg(RED, REDG, '<path d="M4 4l9 9M20 4l-9 9"/><path d="M3 18l3 3 3-3-3-3z"/><path d="M21 18l-3 3-3-3 3-3z"/>'),
    '🧩': img('puzzle'),
    '🏷': svg(PINK, PINKG, '<path d="M3 11V4h7l11 11-7 7z"/><circle cx="7" cy="8" r="1.4"/>'),
    '📐': svg(CYAN, CYANG, '<path d="M4 4v16h16z"/><path d="M4 12h5M4 16h9"/>'),
    '⚡': img('bolt'),
    '🕐': svg(CYAN, CYANG, '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
    '🙂': svg(WHITE, WHITEG, '<circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01"/><path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8"/>'),
    '❔': svg(GRAY, GRAYG, '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.9-.9 1.6v.6"/><path d="M12 17.5h.01"/>'),

    // 서류(원가의 길 수집물)
    '📄': svg(WHITE, WHITEG, '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>'),
    '📑': svg(PURPLE, PURPLEG, '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 11h6M9 15h4"/><path d="M3 7v13a1 1 0 0 0 1 1h11"/>'),
    '📗': svg(GREEN, GREENG, '<path d="M5 4a2 2 0 0 1 2-2h12v18H7a2 2 0 0 0-2 2z"/><path d="M5 4v16"/><path d="M15 2v7l-2-1.5L11 9V2"/>'),
    '🧾': img('receipt'),

    // 상태 점(🟢🟡🔴 과 같은 계열)
    '🟣': dot(PURPLE, PURPLEG),
    '🔵': dot(BLUE, BLUEG)
  };

  var KEYS = Object.keys(ICONS).sort(function (a, b) { return b.length - a.length; });
  var RE = new RegExp(KEYS.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|'), 'g');

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, NOSCRIPT: 1 };

  function processTextNode(node) {
    var text = node.nodeValue;
    if (!text) return;
    RE.lastIndex = 0;
    if (!RE.test(text)) return;
    var frag = document.createDocumentFragment();
    var lastIndex = 0, m;
    RE.lastIndex = 0;
    while ((m = RE.exec(text))) {
      if (m.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
      var span = document.createElement('span');
      span.className = 'ei';
      span.setAttribute('aria-hidden', 'true');
      span.innerHTML = ICONS[m[0]];
      frag.appendChild(span);
      lastIndex = m.index + m[0].length;
      if (m.index === RE.lastIndex) RE.lastIndex++;
    }
    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    if (node.parentNode) node.parentNode.replaceChild(frag, node);
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { processTextNode(root); return; }
    if (root.nodeType !== 1) return;
    if (SKIP_TAGS[root.tagName]) return;
    if (root.classList && root.classList.contains('ei')) return;
    var kids = [];
    for (var i = 0; i < root.childNodes.length; i++) kids.push(root.childNodes[i]);
    for (var j = 0; j < kids.length; j++) walk(kids[j]);
  }

  function autoReplace(root) {
    walk(root || document.body);
  }

  var observing = false;
  function observe() {
    if (observing || !('MutationObserver' in global)) return;
    observing = true;
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList') {
          for (var k = 0; k < m.addedNodes.length; k++) walk(m.addedNodes[k]);
        } else if (m.type === 'characterData') {
          walk(m.target);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function boot() {
    autoReplace(document.body);
    observe();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.EmojiIcons = { autoReplace: autoReplace, ICONS: ICONS };
})(window);
