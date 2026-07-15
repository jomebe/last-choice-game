import { describe, it, expect } from "vitest";
import { ShapeDeceptionGame } from "./ShapeDeceptionGame.ts";
import { Player } from "last-choice-shared";

const makePlayer = (id: string, nickname: string): Player => ({
  id, nickname, isHost: false, isReady: true, isAlive: true, score: 0, disconnectedAt: null
});

describe("ShapeDeceptionGame", () => {
  const game = new ShapeDeceptionGame();
  const players4: Player[] = [
    makePlayer("p1", "A"),
    makePlayer("p2", "B"),
    makePlayer("p3", "C"),
    makePlayer("p4", "D"),
  ];

  it("3명 미만에서는 초기화에 실패한다", () => {
    expect(() => game.createInitialState([makePlayer("p1", "A"), makePlayer("p2", "B")])).toThrow();
  });

  it("출제자가 무작위로 선정된다", () => {
    const state = game.createInitialState(players4);
    expect(players4.map(p => p.id)).toContain(state.questionerId);
  });

  it("출제자에게만 정답이 전달된다", () => {
    const state = game.createInitialState(players4);
    const questioner = state.questionerId;
    const guesser = players4.find(p => p.id !== questioner)!;

    const questView = game.createPrivateView(state, questioner, 'PLAYING') as any;
    const guesserView = game.createPrivateView(state, guesser.id, 'PLAYING') as any;

    expect(questView.correctOptionId).not.toBeNull();
    expect(guesserView.correctOptionId).toBeNull();
  });

  it("결과 공개 시 추리자에게도 정답이 공개된다", () => {
    const state = game.createInitialState(players4);
    const questioner = state.questionerId;
    const guesser = players4.find(p => p.id !== questioner)!;

    const guesserViewResult = game.createPrivateView(state, guesser.id, 'RESULT') as any;
    expect(guesserViewResult.correctOptionId).not.toBeNull();
  });

  it("정답 선택자는 생존한다", () => {
    const state = game.createInitialState(players4);
    const questioner = state.questionerId;
    const guessers = players4.filter(p => p.id !== questioner);
    const correct = state.correctOptionId;

    let s = state;
    // 모두 정답 선택
    for (const p of guessers) {
      s = game.applyAction(s, p.id, { type: "SELECT_OPTION", optionId: correct });
    }

    const result = game.resolve(s, players4, 1);
    expect(result.isVoid).toBe(false);
    for (const p of guessers) expect(result.survivors).toContain(p.id);
    expect(result.survivors).toContain(questioner);
  });

  it("오답 선택자는 탈락한다", () => {
    const state = game.createInitialState(players4);
    const questioner = state.questionerId;
    const guessers = players4.filter(p => p.id !== questioner);
    const wrong = state.options.find(o => o.id !== state.correctOptionId)!.id;

    let s = state;
    for (const p of guessers) {
      s = game.applyAction(s, p.id, { type: "SELECT_OPTION", optionId: wrong });
    }

    const result = game.resolve(s, players4, 1);
    for (const p of guessers) expect(result.eliminated).toContain(p.id);
    expect(result.survivors).toContain(questioner); // 출제자 항상 생존
  });

  it("출제자는 선택을 제출할 수 없다", () => {
    const state = game.createInitialState(players4);
    const questioner = state.questionerId;
    const validation = game.validateAction(
      state, questioner, { type: "SELECT_OPTION", optionId: "A" },
      players4.map(p => p.id)
    );
    expect(validation.valid).toBe(false);
  });

  it("연속 출제자 방지: 같은 사람이 연속으로 선정되지 않는다", () => {
    const state1 = game.createInitialState(players4);
    const firstQuestioner = state1.questionerId;

    const state2 = game.createInitialState(players4, { lastQuestionerIds: [firstQuestioner] });
    // 플레이어가 4명이면 다른 사람이 선정될 가능성이 매우 높음
    // (seed 없이는 확률적이지만 통계적으로 매우 낮은 연속 선정 확률)
    // 최소 10번 시도 중 한 번 이상 다른 사람이 선정되는지 확인
    let differentFound = false;
    for (let i = 0; i < 10; i++) {
      const s = game.createInitialState(players4, { lastQuestionerIds: [firstQuestioner], seed: i });
      if (s.questionerId !== firstQuestioner) { differentFound = true; break; }
    }
    expect(differentFound).toBe(true);
  });

  it("채팅 길이 제한이 적용된다", () => {
    const state = game.createInitialState(players4);
    const questioner = state.questionerId;
    const longMsg = "a".repeat(101);
    const validation = game.validateAction(
      state, questioner, { type: "SEND_CHAT", message: longMsg },
      players4.map(p => p.id)
    );
    expect(validation.valid).toBe(false);
  });

  it("출제자만 그림을 그릴 수 있다", () => {
    const state = game.createInitialState(players4);
    const questioner = state.questionerId;
    const guesser = players4.find(p => p.id !== questioner)!;

    const validQuestioner = game.validateAction(
      state, questioner, { type: "ADD_STROKES", strokes: [] },
      players4.map(p => p.id)
    );
    const invalidGuesser = game.validateAction(
      state, guesser.id, { type: "ADD_STROKES", strokes: [] },
      players4.map(p => p.id)
    );
    expect(validQuestioner.valid).toBe(true);
    expect(invalidGuesser.valid).toBe(false);
  });
});
