import { describe, it, expect } from "vitest";
import { MinorityButtonGame } from "./MinorityButtonGame.ts";
import { Player } from "../../../packages/shared/src/types.ts";

const makePlayer = (id: string, nickname: string): Player => ({
  id, nickname, isHost: false, isReady: true, isAlive: true, score: 0, disconnectedAt: null
});

describe("MinorityButtonGame", () => {
  const game = new MinorityButtonGame();

  const players5: Player[] = [
    makePlayer("p1", "A"),
    makePlayer("p2", "B"),
    makePlayer("p3", "C"),
    makePlayer("p4", "D"),
    makePlayer("p5", "E"),
  ];

  it("버튼이 최소 2개 이상 생성된다", () => {
    const state = game.createInitialState(players5);
    expect(state.buttons.length).toBeGreaterThanOrEqual(2);
  });

  it("0명 선택 버튼은 최소 판정에서 제외된다", () => {
    const state = game.createInitialState(players5);
    const btn0 = state.buttons[0].id;
    const btn1 = state.buttons[1].id;
    const btn2 = state.buttons[2] ? state.buttons[2].id : btn1;

    // p1, p2: btn0 | p3, p4, p5: btn1 | btn2: 0명 선택
    let s = game.applyAction(state, "p1", { type: "SELECT_BUTTON", buttonId: btn0 });
    s = game.applyAction(s, "p2", { type: "SELECT_BUTTON", buttonId: btn0 });
    s = game.applyAction(s, "p3", { type: "SELECT_BUTTON", buttonId: btn1 });
    s = game.applyAction(s, "p4", { type: "SELECT_BUTTON", buttonId: btn1 });
    s = game.applyAction(s, "p5", { type: "SELECT_BUTTON", buttonId: btn1 });

    const result = game.resolve(s, players5, 1);
    // btn0(2명) vs btn1(3명) → btn0이 최소 → p1, p2 탈락
    expect(result.eliminated).toContain("p1");
    expect(result.eliminated).toContain("p2");
    expect(result.survivors).toContain("p3");
    expect(result.isVoid).toBe(false);
  });

  it("모두 같은 버튼 선택 시 무효 처리된다", () => {
    const state = game.createInitialState(players5);
    const btn0 = state.buttons[0].id;
    let s = state;
    for (const p of players5) {
      s = game.applyAction(s, p.id, { type: "SELECT_BUTTON", buttonId: btn0 });
    }
    const result = game.resolve(s, players5, 1);
    expect(result.isVoid).toBe(true);
    expect(result.survivors).toHaveLength(5);
  });

  it("미선택 플레이어는 탈락한다", () => {
    const state = game.createInitialState([makePlayer("p1", "A"), makePlayer("p2", "B")]);
    // p1만 선택, p2는 미선택
    const s = game.applyAction(state, "p1", { type: "SELECT_BUTTON", buttonId: state.buttons[0].id });
    const result = game.resolve(s, [makePlayer("p1", "A"), makePlayer("p2", "B")], 1);
    // p2 미선택 → 탈락 → 전원탈락 → void
    expect(result.isVoid).toBe(true);
  });

  it("최소 선택 버튼 동률이면 해당 선택자 전부 탈락한다", () => {
    const state = game.createInitialState(players5);
    const [b0, b1, b2] = state.buttons;
    // p1: b0, p2: b1, p3,p4,p5: b2 → b0, b1 각 1명으로 동률 → p1, p2 탈락
    let s = game.applyAction(state, "p1", { type: "SELECT_BUTTON", buttonId: b0.id });
    s = game.applyAction(s, "p2", { type: "SELECT_BUTTON", buttonId: b1.id });
    s = game.applyAction(s, "p3", { type: "SELECT_BUTTON", buttonId: b2.id });
    s = game.applyAction(s, "p4", { type: "SELECT_BUTTON", buttonId: b2.id });
    s = game.applyAction(s, "p5", { type: "SELECT_BUTTON", buttonId: b2.id });
    const result = game.resolve(s, players5, 1);
    expect(result.eliminated).toContain("p1");
    expect(result.eliminated).toContain("p2");
    expect(result.survivors).toContain("p3");
  });

  it("관전자는 선택할 수 없다", () => {
    const state = game.createInitialState([makePlayer("p1", "A")]);
    const validation = game.validateAction(state, "p1", { type: "SELECT_BUTTON", buttonId: state.buttons[0].id }, []);
    expect(validation.valid).toBe(false);
  });
});
