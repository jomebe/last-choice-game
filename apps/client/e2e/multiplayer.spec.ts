import { test, expect } from "@playwright/test";

test("4인 실시간 멀티플레이 심리 서바이벌 및 결승전 시나리오 검증", async ({ browser }) => {
  test.setTimeout(120000);
  // 1. 4개의 독립 브라우저 컨텍스트 생성
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const contextC = await browser.newContext();
  const contextD = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const pageC = await contextC.newPage();
  const pageD = await contextD.newPage();

  // 2. Player A 방 생성
  await pageA.goto("/");
  await pageA.fill("#nickname-input", "PlayerA");
  await pageA.click("#create-room-btn");

  // 방 코드 표시될 때까지 대기
  const roomCodeElement = pageA.locator("#room-code-display");
  await expect(roomCodeElement).toBeVisible({ timeout: 10000 });
  const roomCode = (await roomCodeElement.innerText()).trim();
  expect(roomCode.length).toBe(6);

  console.log(`생성된 방 코드: ${roomCode}`);

  // 3. Player B, C, D 참가
  const players = [
    { page: pageB, name: "PlayerB" },
    { page: pageC, name: "PlayerC" },
    { page: pageD, name: "PlayerD" }
  ];

  for (const p of players) {
    await p.page.goto("/");
    await p.page.fill("#nickname-input", p.name);
    await p.page.fill("#room-code-input", roomCode);
    await p.page.click("#join-room-btn");
    
    // 로비 진입 검증
    await expect(p.page.locator("#lobby-panel")).toBeVisible({ timeout: 8000 });
  }

  // 4. Player B, C, D 준비 완료 토글
  for (const p of players) {
    const readyBtn = p.page.locator("#toggle-ready-btn");
    await expect(readyBtn).toBeVisible({ timeout: 5000 });
    await readyBtn.click();
  }

  // pageA(방장)에서 모든 플레이어가 준비완료 상태로 전환되는 것을 보장 대기
  await expect(pageA.locator('#player-list > div', { hasText: 'PlayerB' }).first()).toContainText("준비완료", { timeout: 8000 });
  await expect(pageA.locator('#player-list > div', { hasText: 'PlayerC' }).first()).toContainText("준비완료", { timeout: 8000 });
  await expect(pageA.locator('#player-list > div', { hasText: 'PlayerD' }).first()).toContainText("준비완료", { timeout: 8000 });

  // 5. Host Player A가 게임 시작 버튼 누름
  const startBtn = pageA.locator("#start-game-btn");
  await expect(startBtn).toBeEnabled({ timeout: 5000 });
  await startBtn.click();

  // 모든 클라이언트가 게임 화면(selecting-panel)에 들어왔는지 확인
  const panels = [pageA, pageB, pageC, pageD];
  for (const page of panels) {
    await expect(page.locator("#selecting-panel")).toBeVisible({ timeout: 10000 });
  }

  console.log("게임 시작 성공, 선택 라운드 진입");

  // 6. 플레이어 선택 제출 (A&B 중복 탈락 / C&D 생존)
  // A: 1번, B: 1번, C: 2번, D: 3번
  await pageA.click('#slot-grid button:has-text("1")');
  await pageB.click('#slot-grid button:has-text("1")');
  await pageC.click('#slot-grid button:has-text("2")');
  await pageD.click('#slot-grid button:has-text("3")');

  // 모든 인원 제출 시 결과 공개(REVEALING) 및 라운드 대기(ROUND_RESULT)를 거쳐 결승전(FINAL_DUEL) 상태로 넘어감
  // C와 D는 살아남아 결승에 진입하므로 final-duel-panel이 보여야 함
  // A와 B는 탈락자(관전자)로서 final-duel-panel을 관전함
  console.log("선택 제출 완료, 결과 판정 대기 중...");
  
  await expect(pageC.locator("#final-duel-panel")).toBeVisible({ timeout: 15000 });
  await expect(pageD.locator("#final-duel-panel")).toBeVisible({ timeout: 15000 });
  
  console.log("결승전 진입 확인");

  // 7. 결승전 (FINAL_DUEL) 진행: C vs D (3판 2선승)
  // 라운드 1: C(검은 원) vs D(흰 삼각형) -> C 승리
  // SHADOW_CIRCLE -> '검은 원' 텍스트를 가진 버튼
  await pageC.click('#final-symbol-grid button:has-text("검은 원")');
  await pageD.click('#final-symbol-grid button:has-text("흰 삼각형")');

  // 라운드 결과 대기 후 다음 결승 라운드로 넘어감 (다시 final-duel-panel 노출)
  await expect(pageC.locator("#final-symbol-grid")).toBeVisible({ timeout: 10000 });
  await expect(pageD.locator("#final-symbol-grid")).toBeVisible({ timeout: 10000 });

  // 이전 라운드 클릭 잔상 클릭 씹힘 현상 방지: 결승 2라운드로 렌더링 갱신 완료될 때까지 확실히 대기!
  await expect(pageC.locator("#final-round-title")).toContainText("결승 2라운드", { timeout: 15000 });
  await expect(pageD.locator("#final-round-title")).toContainText("결승 2라운드", { timeout: 15000 });

  // 라운드 2: C(검은 원) vs D(흰 삼각형) -> C 승리 (2점 달성으로 게임 종료)
  await pageC.click('#final-symbol-grid button:has-text("검은 원")');
  await pageD.click('#final-symbol-grid button:has-text("흰 삼각형")');

  // 8. 최종 우승 화면(game-over-panel) 검증
  for (const page of panels) {
    await expect(page.locator("#game-over-panel")).toBeVisible({ timeout: 60000 });
  }

  // 최종 우승자 이름 검증: PlayerC가 우승자로 명시되어야 함
  const winnerElement = pageC.locator("#game-over-panel");
  await expect(winnerElement).toContainText("PlayerC", { timeout: 10000 });

  console.log("E2E 테스트 시나리오 성공: PlayerC 최종 우승 검증 완료");
});
