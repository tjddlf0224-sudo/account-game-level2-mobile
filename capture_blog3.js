// 블로그용 신규 화면 3종 캡처 — Playwright, 440x956 @3x
const { chromium } = require('playwright');
const path = require('path');

const SRV = 'http://localhost:8940';
const OUT = '/Users/yunsismac/Desktop/전산회계블로그';

(async () => {
  const browser = await chromium.launch();

  // 1) 이론 모드 — 개념 해설(deep dive) 펼친 화면
  {
    const page = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
    await page.addInitScript(() => localStorage.setItem('hub_nickname', '캡처용닉네임'));
    await page.goto(`${SRV}/theory.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof BANK !== 'undefined' && BANK.length > 0);
    await page.evaluate(() => {
      QUEUE = [BANK.find((q) => q.id === 'O111-1')];
      qi = 0;
      document.getElementById('home').style.display = 'none';
      document.getElementById('quiz').style.display = 'block';
      showQ();
    });
    await page.waitForTimeout(200);
    await page.click('.choice[data-i="4"]'); // 정답 선택 -> 해설 패널 오픈
    await page.waitForTimeout(200);
    await page.click('#dd-toggle'); // 자세한 개념 알아보기
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('expl').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, '1.png') });
    console.log('1.png (이론모드 개념해설) done');
    await page.close();
  }

  // 2) T계정/시산표 정상 표시 화면 (문제 스템에 표가 있는 문항)
  {
    const page = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
    await page.addInitScript(() => localStorage.setItem('hub_nickname', '캡처용닉네임'));
    await page.goto(`${SRV}/theory.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof BANK !== 'undefined' && BANK.length > 0);
    await page.evaluate(() => {
      QUEUE = [BANK.find((q) => q.id === 'O112-10')]; // stemTAccount 있는 문항
      qi = 0;
      document.getElementById('home').style.display = 'none';
      document.getElementById('quiz').style.display = 'block';
      showQ();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, '2.png') });
    console.log('2.png (T계정 표시) done');
    await page.close();
  }

  // 3) 게임 허브 — 스테이지 노드맵 화면
  {
    const page = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
    await page.addInitScript(() => localStorage.setItem('hub_nickname', '캡처용닉네임'));
    await page.goto(`${SRV}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, '3.png') });
    console.log('3.png (허브 노드맵) done');
    await page.close();
  }

  await browser.close();
})();
