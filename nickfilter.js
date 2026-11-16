/* ============================================================
 *  nickfilter.js — 닉네임 거르기(욕설·비하·성적 표현·개인정보)  2026-11-14 (성일님 "진행해", 팀장 경유)
 *  전산회계 오락실 · 한국판과 일본판(www/ja)·미국판(www/en)·대만판(www/tw) 공용(각 판은 ../nickfilter.js 를 같이 씀)
 *  목록·판정은 보카 바리스타 shared/nickfilter.js(2026-11-10, 시험 71건)를 그대로 옮김 — 고칠 땐 보카와 같이.
 *
 *  기준: 욕설·비하·성적 표현·개인정보(전화번호·이메일·주소 꼴)만. 학생 닉네임은 문장처럼 생길 수 있어 넓게 막지 않는다
 *    (예: '성일쌤 오늘은 쉬어요' 같은 닉네임도 통과). 한국어·영어·일본어·중국어 목록을 언어 구분 없이 늘 검사.
 *  쓰는 곳: **새로 정하거나 바꾸는 닉네임만** — login.html 첫 닉네임, 허브 닉네임 변경, 게임 결과 화면에서 다른 이름을 칠 때.
 *    지금 쓰고 있는 닉네임(hub_nickname)은 막지 않는다(성일님: 기존 닉네임은 그대로).
 *  window.AmNick.bad(name) → 'word' | 'phone' | 'email' | 'url' | null,  AmNick.msg(reason) → 화면 안내 글(한·일·영·번체, <html lang> 로)
 *  type=module 금지(file:// 에서 막힘) — 일반 script.
 * ============================================================ */
(function (global) {
  'use strict';
  // 이어 붙인 글자 안에 들어 있으면 막는 것(한글·자모·영어 강한 욕)
  var SUB = [
    '씨발', '씨빨', '시빨', '쓰발', '씨팔', '시팔', '씹새', '씹년', '씹창', '씹할', 'ㅅㅂ', 'ㅆㅂ', '병신', '븅신', 'ㅂㅅ', '좆', 'ㅈㄴ', '존나', '지랄', 'ㅈㄹ',
    '개새', '쌔끼', 'ㅅㄲ', '니미럴', '느금', '니애미', '느개비', '엠창', '앰창', '창녀', '걸레년', '미친년', '미친놈', '썅년', '썅놈',
    '틀딱', '한남충', '김치녀', '맘충', '급식충', '짱깨', '쪽바리', '깜둥',
    '섹스', '야동', '강간',
    'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'nigg', 'porn', 'whore', 'slut', 'fag'
  ];
  // 한글인데 흔한 말 안에 들어 있는 것(보지 마·자지 마 등) — 띄어 쓴 낱말 전체가 같을 때만
  var KO_WORD = ['보지', '자지', '씹', '애미', '시발'];   // 마지막 낱말이거나 닉네임 전체일 때만('보지 마세요'·'새끼 고양이'는 통과)
  // 낱말 전체가 같을 때만(영어 — 다른 낱말 안에 흔히 들어 있음)
  var WORD = ['ass', 'asshole', 'sex', 'dick', 'pussy', 'cock', 'nazi', 'rape', 'xxx'];
  // 일본어(일본판 11/13): 욕설·비하·성적 표현 — 가나·한자만 남기고 이어 붙인 글자 안에 있으면 막는다(반각·전각은 NFKC 로 맞춤)
  var JA_SUB = ['ちんこ', 'チンコ', 'ちんぽ', 'チンポ', 'まんこ', 'マンコ', 'おっぱい', 'セックス', 'せっくす', 'レイプ', '強姦', '売春', '援交',
    '死ね', '氏ね', '殺す', 'ころすぞ', 'キチガイ', 'きちがい', '気違い', '池沼', 'ガイジ', 'ニガー', 'シナ人', 'クソ野郎', 'くそやろう', 'ホモ野郎', 'エロ動画', 'エロ画像'];
  // 중국어(번체판 11/14): 욕설·비하·성적 표현 — 번체·간체 둘 다. 흔한 낱말 안에 들기 쉬운 한 글자(幹·屌 등)는 넣지 않음
  var ZH_SUB = ['幹你娘', '幹您娘', '干你娘', '操你', '肏', '屄', '雞巴', '鸡巴', '機掰', '雞掰', '婊子', '賤人', '贱人', '妓女', '做愛', '做爱', '色情', '強姦', '强奸',
    '王八蛋', '去死', '智障', '白痴', '白癡', '腦殘', '脑残', '支那', '黑鬼', '陰莖', '阴茎', '陰道', '阴道', '草泥馬', '草泥马', '傻逼', '傻屄', '你媽的', '你妈的', '他媽的', '他妈的'];
  // 흔한 이름·낱말 안에 들어 있는 것(チョンさん·チョンマゲ·エロイーズ) — 이름 전체가 같거나 뒤에 욕이 붙을 때만
  var JA_WORD = ['チョン', 'エロ', 'えろ'], JA_TAIL = ['', '野郎', 'やろう', 'ども', '共'];

  function norm(s) {
    s = String(s || '').toLowerCase().normalize ? String(s || '').toLowerCase().normalize('NFC') : String(s || '').toLowerCase();
    // 흔한 바꿔 쓰기: 1→i, 0→o, 3→e, @→a, $→s
    return s.replace(/[1!|]/g, 'i').replace(/0/g, 'o').replace(/3/g, 'e').replace(/@/g, 'a').replace(/\$/g, 's');
  }
  // 한글·자모·영어만 남기고 이어 붙임(띄어쓰기·점·숫자 끼워 넣기 무력화)
  function squash(s) { return norm(s).replace(/[^a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, ''); }

  function bad(name) {
    var raw = String(name || '');
    // 개인정보: 전화번호 꼴(숫자 9자리 이상, 사이 기호 무시)·이메일·인터넷 주소
    if ((raw.replace(/[\s\-.·_()]/g, '').match(/\d/g) || []).length >= 9 && /\d{2,}[\s\-.·]?\d{3,4}[\s\-.·]?\d{4}/.test(raw)) return 'phone';
    if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(raw)) return 'email';
    if (/(https?:\/\/|www\.|\.com\b|\.kr\b|\.net\b|open\.kakao)/i.test(raw)) return 'url';
    var sq = squash(raw), sqKo = String(raw).normalize ? String(raw).normalize('NFC').replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, '') : raw.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
    var sqJa = (raw.normalize ? raw.normalize('NFKC') : raw).replace(/[^\u3040-\u30ff\u4e00-\u9fff]/g, '');
    for (var q = 0; q < JA_SUB.length; q++) if (sqJa.indexOf(JA_SUB[q]) >= 0) return 'word';
    for (var qz = 0; qz < ZH_SUB.length; qz++) if (sqJa.indexOf(ZH_SUB[qz]) >= 0) return 'word';
    for (var q2 = 0; q2 < JA_WORD.length; q2++) for (var t2 = 0; t2 < JA_TAIL.length; t2++) if (sqJa === JA_WORD[q2] + JA_TAIL[t2]) return 'word';
    for (var i = 0; i < SUB.length; i++) { var w = SUB[i]; if (/[a-z]/.test(w) ? sq.indexOf(w) >= 0 : sqKo.indexOf(w) >= 0) return 'word'; }   // 한글은 영어·숫자 끼워 넣기(병1신)도 무시
    var kt = norm(raw).split(/[^가-힣ㄱ-ㅎㅏ-ㅣ]+/).filter(Boolean);
    if (KO_WORD.indexOf(sqKo) >= 0 || (kt.length && KO_WORD.indexOf(kt[kt.length - 1]) >= 0)) return 'word';
    var toks = norm(raw).split(/[^a-z]+/);
    for (var j = 0; j < toks.length; j++) if (toks[j] && WORD.indexOf(toks[j]) >= 0) return 'word';
    return null;
  }
  // 화면 언어(<html lang>) — ko·ja·en(미국판 www/en)·zh(대만판 www/tw, zh-Hant-TW)
  function lang() { try { var l = (document.documentElement.lang || '').toLowerCase(); return /^ja/.test(l) ? 'ja' : /^en/.test(l) ? 'en' : /^zh/.test(l) ? 'zh' : 'ko'; } catch (e) { return 'ko'; } }
  // 화면 안내 글 — 짧게(성일님 "화면 글은 짧게")
  var MSG = {
    ko: ['전화번호·이메일·주소는 닉네임에 쓸 수 없어요', '사용할 수 없는 닉네임이에요'],
    ja: ['電話番号・メール・URL はニックネームに使えません', 'このニックネームは使えません'],
    en: ['Phone numbers, emails and links can\'t be used', 'This nickname isn\'t allowed'],
    zh: ['暱稱不能用電話、Email 或網址', '這個暱稱不能使用']
  };
  function msg(reason) {
    var m = MSG[lang()];
    return (reason === 'phone' || reason === 'email' || reason === 'url') ? m[0] : m[1];
  }
  global.AmNick = { bad: bad, msg: msg, _squash: squash };
})(typeof window !== 'undefined' ? window : globalThis);
