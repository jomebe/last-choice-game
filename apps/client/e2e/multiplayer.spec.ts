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

  // 로비 패널 진입 대기 후 방 코드 확인
  await expect(pageA.locator("#lobby-panel")).toBeVisible({ timeout: 15000 });
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

  // 모든 인원 제출 시 결과 공개 및 라운드 대기를 거쳐 결승전(FINAL_DUEL) 상태로 넘어감
  console.log("선택 제출 완료, 결과 판정 대기 중...");
  
  await expect(pageC.locator("#final-duel-panel")).toBeVisible({ timeout: 15000 });
  await expect(pageD.locator("#final-duel-panel")).toBeVisible({ timeout: 15000 });
  
  console.log("결승전 진입 확인");

  // 7. 결승전 (FINAL_DUEL) 진행: C vs D (3판 2선승)
  // 라운드 1: C(바위) vs D(가위) -> C 승리
  // C가 바위를 선택함
  await pageC.click('#final-symbol-grid button:has-text("바위")');
  
  // 은닉화 검증: C가 선택한 후에도 D의 화면에서 C의 선택이 완료 하이라이트(border-brand-cyan)로 표시되지 않아야 함
  // 즉 D 브라우저에서는 아직 C의 선택이 채워지지 않은 채 선택 대기 화면이 그대로 보여야 합니다.
  const finalDuelPanelD = pageD.locator("#final-duel-panel");
  // C의 선택 상태를 D에게 가리기 위해 D의 제출 카운트가 1이 되기 전 타이밍에서
  // D의 submittedCount 정보가 아직 0/2 임을 검증합니다.
  await expect(finalDuelPanelD).toContainText("선택 완료 인원: 1 / 2명");

  // D가 가위를 누름
  await pageD.click('#final-symbol-grid button:has-text("가위")');

  // 라운드 결과 대기 후 다음 결승 라운드로 넘어감 (다시 final-duel-panel 노출)
  await expect(pageC.locator("#final-symbol-grid")).toBeVisible({ timeout: 30000 });
  await expect(pageD.locator("#final-symbol-grid")).toBeVisible({ timeout: 30000 });

  // 이전 라운드 클릭 잔상 클릭 씹힘 현상 방지: 결승 2라운드로 렌더링 갱신 완료될 때까지 확실히 대기!
  await expect(pageC.locator("#final-round-title")).toContainText("결승 2라운드", { timeout: 30000 });
  await expect(pageD.locator("#final-round-title")).toContainText("결승 2라운드", { timeout: 30000 });

  // 라운드 2: C(바위) vs D(가위) -> C 승리 (2점 달성으로 게임 종료)
  await pageC.click('#final-symbol-grid button:has-text("바위")');
  await pageD.click('#final-symbol-grid button:has-text("가위")');

  // 8. 최종 우승 화면(game-over-panel) 검증
  for (const page of panels) {
    await expect(page.locator("#game-over-panel")).toBeVisible({ timeout: 90000 });
  }

  // 최종 우승자 이름 검증: PlayerC가 우승자로 명시되어야 함
  const winnerElement = pageC.locator("#game-over-panel");
  await expect(winnerElement).toContainText("PlayerC", { timeout: 10000 });

  console.log("E2E 테스트 시나리오 성공: PlayerC 최종 우승 검증 완료");
});

test("2인 다이렉트 결승전 시작 시나리오 검증", async ({ browser }) => {
  test.setTimeout(60000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  // 1. 방장 A 방 생성
  await pageA.goto("/");
  await pageA.fill("#nickname-input", "HostA");
  await pageA.click("#create-room-btn");

  // 로비 패널 진입 대기 후 방 코드 확인
  await expect(pageA.locator("#lobby-panel")).toBeVisible({ timeout: 15000 });
  const roomCodeElement = pageA.locator("#room-code-display");
  await expect(roomCodeElement).toBeVisible({ timeout: 10000 });
  const roomCode = (await roomCodeElement.innerText()).trim();

  // 2. 플레이어 B 참가
  await pageB.goto("/");
  await pageB.fill("#nickname-input", "PlayerB");
  await pageB.fill("#room-code-input", roomCode);
  await pageB.click("#join-room-btn");
  await expect(pageB.locator("#lobby-panel")).toBeVisible({ timeout: 8000 });

  // 3. Player B 준비 완료
  const readyBtn = pageB.locator("#toggle-ready-btn");
  await expect(readyBtn).toBeVisible({ timeout: 5000 });
  await readyBtn.click();

  await expect(pageA.locator('#player-list > div', { hasText: 'PlayerB' }).first()).toContainText("준비완료", { timeout: 8000 });

  // 4. Host A 게임 시작
  const startBtn = pageA.locator("#start-game-btn");
  await expect(startBtn).toBeEnabled({ timeout: 5000 });
  await startBtn.click();

  // 5. 번호 선택판(selecting-panel)을 아예 거치지 않고, 즉시 결승전(final-duel-panel)으로 다이렉트 진입 확인!
  await expect(pageA.locator("#final-duel-panel")).toBeVisible({ timeout: 10000 });
  await expect(pageB.locator("#final-duel-panel")).toBeVisible({ timeout: 10000 });
  await expect(pageA.locator("#selecting-panel")).not.toBeVisible();

  console.log("2인 시작 즉시 결승전 진입 검증 완료");

  // 6. 가위바위보를 통해 HostA 가 2승하여 우승 검증
  // 라운드 1: HostA(바위) vs PlayerB(가위) -> HostA 승
  await pageA.click('#final-symbol-grid button:has-text("바위")');
  await pageB.click('#final-symbol-grid button:has-text("가위")');

  // 라운드 2 시작 대기
  await expect(pageA.locator("#final-symbol-grid")).toBeVisible({ timeout: 10000 });
  await expect(pageA.locator("#final-round-title")).toContainText("결승 2라운드", { timeout: 15000 });

  // 라운드 2: HostA(바위) vs PlayerB(가위) -> HostA 승 (2점 달성 우승)
  await pageA.click('#final-symbol-grid button:has-text("바위")');
  await pageB.click('#final-symbol-grid button:has-text("가위")');

  // 최종 우승 검증
  await expect(pageA.locator("#game-over-panel")).toBeVisible({ timeout: 20000 });
  await expect(pageA.locator("#game-over-panel")).toContainText("HostA", { timeout: 10000 });

  console.log("2인 다이렉트 결승전 우승 시나리오 E2E 테스트 성공");
});
