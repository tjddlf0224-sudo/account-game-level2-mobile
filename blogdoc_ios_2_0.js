// 전산회계 오락실 — iOS 2.0.1 업데이트 소식 블로그 복붙용 HTML 생성 (counsel-app의 blogdoc4.js와 동일 방식)
const fs = require('fs');
const path = require('path');
const os = require('os');

const ICON = path.join(__dirname, 'icon.png');
const iconB64 = 'data:image/png;base64,' + fs.readFileSync(ICON).toString('base64');

const OUTDIR = path.join(os.homedir(), 'Desktop', '전산회계블로그');
const shotCache = {};
const shotB64 = (n) => (shotCache[n] = shotCache[n] || ('data:image/png;base64,' + fs.readFileSync(path.join(OUTDIR, n + '.png')).toString('base64')));

const H1 = (t) => `<h1 style="font-size:26px;font-weight:800;line-height:1.4;color:#111;margin:0 0 20px;">${t}</h1>`;
const H2 = (t) => `<h2 style="font-size:21px;font-weight:700;margin:30px 0 12px;color:#222;">${t}</h2>`;
const P  = (t) => `<p style="font-size:16px;line-height:1.85;color:#333;margin:0 0 16px;">${t}</p>`;
const TAGS = (arr) => P(`<span style="color:#888;font-size:14px;">${arr.map(t=>'#'+t).join(' ')}</span>`);
const FIG = (n, cap) =>
  `<p style="text-align:center;margin:22px 0;"><img src="${shotB64(n)}" alt="${cap}" style="width:280px;max-width:80%;border:1px solid #e5e5e5;border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,0.08);"><br><span style="font-size:13px;color:#888;">${cap}</span></p>`;

const ICON_FIG =
  `<p style="text-align:center;margin:0 0 24px;"><img src="${iconB64}" alt="전산회계 오락실 아이콘" style="width:96px;border-radius:22px;box-shadow:0 4px 16px rgba(0,0,0,0.12);"></p>`;

const APPSTORE_URL = 'https://apps.apple.com/kr/app/id6772735613';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.teacherYun.accountingmaster';

const body =
  H1("아이폰으로 기다리셨던 분들, 전산회계 오락실 iOS 업데이트 드디어 나왔습니다")
  + ICON_FIG
  + P(`그동안 안드로이드 쪽에서만 계속 업데이트가 이어지는 동안, <strong>아이폰 버전은 한동안 멈춰있었어요.</strong> 기다려주신 분들께 죄송한 마음도 있었는데, 이번에 크게 정리해서 업데이트했습니다.`)
  + P(`<strong>전산회계 오락실 iOS 2.0.1, 지금 App Store에서 받으실 수 있어요.</strong>`)
  + H2('이번 업데이트, 뭐가 달라졌나요')
  + P(`✅ <strong>이론 문제 225개 전면 개편</strong> — 기출 출처를 표기하고, 헷갈리는 문제마다 "자세한 개념 알아보기" 해설을 추가했어요`)
  + FIG('1', '이론 모드 — 정답 후 "자세한 개념 알아보기" 해설')
  + P(`✅ <strong>T계정·원장·시산표 표시 버그 수정</strong> — 표 형태로 나와야 할 문제가 텍스트로 깨져 보이던 문제를 고쳤어요. 이제 실제 장부처럼 정확하게 보입니다`)
  + FIG('2', '손익계정 T계정이 표 형태로 정상 표시되는 화면')
  + P(`✅ <strong>차변대변·결산분개 조립공장에 "시간 정지" 기능</strong> — 설명을 읽는 동안엔 제한시간이 멈춰요. 이제 개념 익히면서 여유 있게 풀 수 있습니다`)
  + P(`✅ <strong>애플/구글 계정으로 로그인</strong> 가능 — 기기를 바꿔도 기록이 그대로 이어져요`)
  + P(`✅ 닉네임별 최고 기록이 정확하게 저장·구분되도록 개선`)
  + P(`✅ 교수자 대시보드에서 학생들의 이론 학습 현황도 확인 가능`)
  + P(`+ 광고·배경음악 관련 자잘한 불편함들도 이번에 같이 정리했어요.`)
  + H2('처음 들어보시는 분을 위해 — 한 줄 소개')
  + P(`「전산회계 오락실」은 <strong>전산회계 2급 시험 범위를 5개의 미니게임으로 반복 학습</strong>하는 앱이에요. 계정과목 암기부터 분개, 장부조회까지 — 징검다리처럼 이어지는 스테이지를 하나씩 깨면서 자연스럽게 실력이 쌓입니다.`)
  + FIG('3', '게임 허브 — 스테이지 노드맵 화면')
  + H2('안드로이드로 쓰시던 분도')
  + P(`계정으로 로그인해두시면 기기를 바꿔도 점수·오답노트·진행 상황이 그대로 이어집니다. 학교 컴퓨터, 아이패드, 폰 어디서 열어도 같은 기록이에요.`)
  + H2('다운로드')
  + P(`무료로 이용하실 수 있어요.`)
  + P(`👉 <strong>iPhone</strong>: <a href="${APPSTORE_URL}" target="_blank" rel="noopener">App Store에서 '전산회계 오락실' 열기</a>`)
  + P(`👉 <strong>Android</strong>: <a href="${PLAY_URL}" target="_blank" rel="noopener">Google Play에서 '전산회계 오락실' 열기</a>`)
  + P(`이미 쓰고 계셨다면 자동으로 업데이트됩니다. 기다려주셔서 감사하고, 이번 업데이트로 조금 더 편하게 공부하시길 바라요!`)
  + TAGS(['전산회계2급', '전산회계오락실', '전산회계공부', '전산회계기출문제', '분개', '계정과목', '아이폰앱', '앱스토어', '자격증공부', 'iOS업데이트']);

const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>전산회계 오락실 iOS 2.0 업데이트 네이버 (복붙용)</title>
<style>body{font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:680px;margin:0 auto;padding:30px 20px;background:#fff;}</style>
</head><body>${body}</body></html>`;

const out = path.join(os.homedir(), 'Desktop', '전산회계블로그');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, '3번째글_iOS2.0업데이트_네이버.html'), html);

console.log('생성 완료 →', path.join(out, '3번째글_iOS2.0업데이트_네이버.html'));
console.log('App Store 링크:', APPSTORE_URL);
console.log('Play 링크:', PLAY_URL);
console.log('이미지 3장(실제 스크린샷) 임베드 완료: 1.png, 2.png, 3.png');
