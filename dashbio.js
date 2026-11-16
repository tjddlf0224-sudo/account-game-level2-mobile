/* ============================================================
 *  dashbio.js — 교수자 대시보드 비밀번호를 Face ID·지문으로 (2026-10-23)
 *  전산회계 오락실
 *
 *  왜. 성일님 "다른 앱에서도 Face ID·지문 로그인 넣자"(개발팀 작업지시 10/23).
 *  이 앱은 이메일 로그인 화면이 없어(구글·애플·손님만) 대신 **대시보드 비밀번호**에 붙였다.
 *
 *  어떻게. 앱(네이티브)에서 비밀번호로 대시보드를 한 번 열면 "다음부터 Face ID로 열까요?"를
 *  묻고, 동의하면 그 비밀번호를 기기 잠금 보관함(iOS 키체인·안드로이드 키스토어,
 *  accessControl 2 = BIOMETRY_ANY)에만 넣는다. 다음엔 얼굴·지문으로 꺼내 **같은 서버 확인**
 *  (verify_group_pass)을 거친다. 그룹마다 따로(server = 'am-dash-<그룹id>').
 *  · 생체가 안 되면(등록 없음·취소·실패·플러그인 없음) 막지 않고 평소처럼 비밀번호 칸.
 *  · 비밀번호가 바뀌어 틀리면 보관한 것을 지우고 비밀번호로 다시 받는다.
 *  · 웹판(대시보드 TV 화면 등)에선 아무것도 안 보인다.
 *  · 비밀번호는 보관함에만. localStorage 에는 '어느 그룹을 저장했는지' 목록(hub_dash_bio)만.
 *  · 지우는 때(10/23 성일님 "맞춰" — 장원급제반·상담일지와 같은 규칙): ① 회원 탈퇴(auth.js)·그룹 삭제
 *    ② 이미 저장된 그룹을 비밀번호로 다시 열었을 때 — 바꿀지 묻고 덮어쓰기 ③ 꺼낸 비밀번호가 틀릴 때.
 *    **로그아웃 때는 남긴다**(그 폰에 등록된 얼굴·지문으로만 꺼낼 수 있다).
 *  플러그인: @capgo/capacitor-native-biometric 8.9.1(전 앱 공통, 장원급제반과 같음)
 * ============================================================ */
(function (global) {
  'use strict';
  if (global.DashBio) return;

  var LIST = 'hub_dash_bio';
  var label = 'Face ID';

  function plugin() {
    var C = global.Capacitor;
    if (!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
    return (C.Plugins && C.Plugins.NativeBiometric) || null;
  }
  function server(gid) { return 'am-dash-' + gid; }
  function getList() { try { return JSON.parse(localStorage.getItem(LIST) || '[]') || []; } catch (e) { return []; } }
  function setList(a) { try { localStorage.setItem(LIST, JSON.stringify(a)); } catch (e) {} }

  /** 쓸 수 있으면 플러그인, 아니면 null. 기기에 맞는 이름(Face ID·Touch ID·얼굴 인식·지문)도 정한다 */
  async function avail() {
    var B = plugin(); if (!B) return null;
    try {
      var r = await B.isAvailable({ useFallback: false });
      if (!r || !r.isAvailable) return null;
      label = r.biometryType === 2 ? 'Face ID' : r.biometryType === 1 ? 'Touch ID'
            : r.biometryType === 4 ? '얼굴 인식' : '지문';
      return B;
    } catch (e) { return null; }
  }
  /** 'Face ID로' · '지문으로' */
  function word() { return label + (label === '지문' || label === '얼굴 인식' ? '으로' : '로'); }

  async function saved(gid) {
    var B = await avail(); if (!B) return false;
    try { return !!(await B.isCredentialsSaved({ server: server(gid) })).isSaved; } catch (e) { return false; }
  }

  /** 비밀번호로 막 열었을 때 — 묻고, 동의하면 보관함에.
   *  이미 저장된 그룹이면(다른 선생님 비밀번호이거나 바뀐 비밀번호일 수 있다) 바꿀지 묻고 덮어쓴다 —
   *  보관 값은 얼굴·지문 없이는 꺼낼 수 없어 같은지 미리 비교하지 못한다. */
  async function offer(gid, pass) {
    var B = await avail(); if (!B) return;
    var had = await saved(gid);
    var msg = had
      ? '이 기기에 저장된 ' + label + ' 열기를 방금 입력한 비밀번호로 바꿀까요?'
      : '다음부터 ' + word() + ' 이 대시보드를 열까요?\n비밀번호는 이 기기 잠금 보관함에만 들어가요.';
    var ok = global.Ask ? await global.Ask.confirm(msg, had ? { ok: '바꾸기', cancel: '그대로' } : { ok: '켜기', cancel: '괜찮아요' })
                        : global.confirm(msg);
    if (!ok) return;
    if (had) { try { await B.deleteCredentials({ server: server(gid) }); } catch (e) {} }
    try {
      // 안드로이드는 저장할 때도 지문 창을 띄운다 — 제목·단추를 우리말로(기본값은 영어 'Protect Credentials'·'Cancel', S9 실기기에서 확인)
      await B.setCredentials({ username: String(gid), password: String(pass), server: server(gid), accessControl: 2,
        title: '대시보드 ' + label + ' 열기 켜기', negativeButtonText: '취소' });
      var l = getList(); if (l.indexOf(gid) < 0) { l.push(gid); setList(l); }
    } catch (e) {
      if (global.Ask) global.Ask.alert(label + ' 설정을 하지 못했어요. 다음에 다시 해 볼게요.');
    }
  }

  /** 얼굴·지문으로 비밀번호 꺼내기 — 취소·실패면 null(조용히) */
  async function get(gid, groupName) {
    var B = await avail(); if (!B) return null;
    try {
      var c = await B.getSecureCredentials({ server: server(gid), reason: '대시보드 열기',
        title: '대시보드 열기', subtitle: groupName || '', negativeButtonText: '비밀번호로 열기' });
      return (c && c.password) || null;
    } catch (e) {
      if (String(e && e.code) === '21') await forget(gid);   // 보관함이 비었다(생체 등록이 바뀐 경우 등)
      return null;
    }
  }

  async function forget(gid) {
    var B = plugin();
    if (B) { try { await B.deleteCredentials({ server: server(gid) }); } catch (e) {} }
    setList(getList().filter(function (x) { return x !== gid; }));
  }

  global.DashBio = { avail: avail, word: word, saved: saved, offer: offer, get: get, forget: forget,
                     label: function () { return label; } };
})(window);
