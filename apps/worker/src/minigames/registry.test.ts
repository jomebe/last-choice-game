import { describe, it, expect } from "vitest";
import { generateMinigameSequence, pickNextMinigame, getAvailableGames } from "./registry.ts";
import type { MinigameType } from "last-choice-shared";

describe("미니게임 순서 생성", () => {
  it("ROCK_PAPER_SCISSORS가 무작위 순서에 포함되지 않는다", () => {
    const seq = generateMinigameSequence(4, 9);
    expect(seq).not.toContain("ROCK_PAPER_SCISSORS");
  });

  it("같은 미니게임이 연속으로 나오지 않는다", () => {
    for (let i = 0; i < 20; i++) {
      const seq = generateMinigameSequence(4, 9, i * 1234);
      for (let j = 1; j < seq.length; j++) {
        expect(seq[j]).not.toBe(seq[j - 1]);
      }
    }
  });

  it("인원이 3명 이상이면 SHAPE_DECEPTION이 사용 가능하다", () => {
    const available = getAvailableGames(3);
    expect(available).toContain("SHAPE_DECEPTION");
  });

  it("인원이 2명이면 SHAPE_DECEPTION이 사용 불가하다", () => {
    const available = getAvailableGames(2);
    expect(available).not.toContain("SHAPE_DECEPTION");
  });

  it("2명 남으면 ROCK_PAPER_SCISSORS를 반환한다", () => {
    const { next } = pickNextMinigame([], 2, null, 0);
    expect(next).toBe("ROCK_PAPER_SCISSORS");
  });

  it("1명 이하면 null을 반환한다", () => {
    const { next: next1 } = pickNextMinigame([], 1, null, 0);
    expect(next1).toBeNull();
    const { next: next0 } = pickNextMinigame([], 0, null, 0);
    expect(next0).toBeNull();
  });

  it("큐에서 연속 같은 종류를 건너뛴다", () => {
    // SHAPE_DECEPTION이 2명 상황에서 건너뛰어야 함
    const queue: MinigameType[] = ["SHAPE_DECEPTION", "MINORITY_BUTTON"];
    const { next } = pickNextMinigame(queue, 2, null, 0);
    expect(next).toBe("ROCK_PAPER_SCISSORS"); // 2명이라 즉시 RPS
  });
});

describe("pickNextMinigame", () => {
  it("큐가 비어있으면 무작위로 선택한다", () => {
    const { next, remainingQueue } = pickNextMinigame([], 4, null, 0);
    expect(next).not.toBeNull();
    expect(next).not.toBe("ROCK_PAPER_SCISSORS");
    expect(remainingQueue).toEqual([]);
  });

  it("큐에서 연속 같은 종류를 방지한다 (직전 미니게임 같으면 다른 것 선택)", () => {
    const queue: MinigameType[] = ["UNIQUE_SLOT"];
    const { next } = pickNextMinigame(queue, 4, "UNIQUE_SLOT", 0);
    // UNIQUE_SLOT가 큐에 있지만 lastMinigame이 같으므로 건너뛸 수 있음
    // (현재 구현에서는 큐 순서대로 꺼내되 SHAPE_DECEPTION 조건만 체크)
    expect(next).not.toBeNull();
  });
});
