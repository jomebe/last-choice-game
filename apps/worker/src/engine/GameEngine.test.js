import { describe, it, expect } from "vitest";
import { GameEngine } from "./GameEngine.js";
import { GameState } from "last-choice-shared";
function createMockPlayers(names) {
    return names.map((name, i) => ({
        id: `p${i + 1}`,
        nickname: name,
        isHost: i === 0,
        isReady: true,
        isAlive: true,
        score: 0,
        disconnectedAt: null
    }));
}
describe("GameEngine - processRound", () => {
    it("모든 플레이어가 서로 다른 칸을 선택하면 전원 생존한다", () => {
        const players = createMockPlayers(["A", "B", "C"]);
        const selections = { p1: 1, p2: 2, p3: 3 };
        const { nextPlayers, result, nextState, nextSlotCount } = GameEngine.processRound(players, selections, 3, 0, 1);
        expect(nextPlayers.every(p => p.isAlive)).toBe(true);
        expect(result.isWipeout).toBe(false);
        expect(result.aliveCountAfterRound).toBe(3);
        expect(nextState).toBe(GameState.ROUND_RESULT);
        expect(nextSlotCount).toBe(3);
    });
    it("두 명이 같은 칸을 선택하면 해당 플레이어들은 탈락한다", () => {
        const players = createMockPlayers(["A", "B", "C"]);
        const selections = { p1: 1, p2: 1, p3: 2 };
        const { nextPlayers, result, nextState, nextSlotCount } = GameEngine.processRound(players, selections, 3, 0, 1);
        const nextP1 = nextPlayers.find(p => p.id === "p1");
        const nextP2 = nextPlayers.find(p => p.id === "p2");
        const nextP3 = nextPlayers.find(p => p.id === "p3");
        expect(nextP1.isAlive).toBe(false);
        expect(nextP2.isAlive).toBe(false);
        expect(nextP3.isAlive).toBe(true);
        expect(result.aliveCountAfterRound).toBe(1);
        expect(nextState).toBe(GameState.GAME_OVER);
    });
    it("여러 중복 그룹 발생 시 모두 탈락한다", () => {
        const players = createMockPlayers(["A", "B", "C", "D", "E"]);
        const selections = { p1: 1, p2: 1, p3: 2, p4: 2, p5: 3 };
        const { nextPlayers, result } = GameEngine.processRound(players, selections, 5, 0, 1);
        expect(nextPlayers.find(p => p.id === "p1").isAlive).toBe(false);
        expect(nextPlayers.find(p => p.id === "p2").isAlive).toBe(false);
        expect(nextPlayers.find(p => p.id === "p3").isAlive).toBe(false);
        expect(nextPlayers.find(p => p.id === "p4").isAlive).toBe(false);
        expect(nextPlayers.find(p => p.id === "p5").isAlive).toBe(true);
        expect(result.aliveCountAfterRound).toBe(1);
    });
    it("아무도 생존하지 않으면(생존자 0명) 라운드는 무효가 되며 이전 생존 상태가 복구된다", () => {
        const players = createMockPlayers(["A", "B", "C"]);
        const selections = { p1: 1, p2: 1, p3: 1 };
        const { nextPlayers, result, nextState, nextSlotCount, nextConsecutiveWipeCount } = GameEngine.processRound(players, selections, 3, 0, 1);
        expect(nextPlayers.every(p => p.isAlive)).toBe(true);
        expect(result.isWipeout).toBe(true);
        expect(result.aliveCountAfterRound).toBe(3);
        expect(nextState).toBe(GameState.ROUND_RESULT);
        expect(nextSlotCount).toBe(3);
        expect(nextConsecutiveWipeCount).toBe(1);
    });
    it("정확히 두 명만 생존하면 결승전(FINAL_DUEL) 상태로 진입한다", () => {
        const players = createMockPlayers(["A", "B", "C", "D"]);
        const selections = { p1: 1, p2: 1, p3: 2, p4: 3 };
        const { nextPlayers, nextState } = GameEngine.processRound(players, selections, 4, 0, 1);
        expect(nextPlayers.find(p => p.id === "p1").isAlive).toBe(false);
        expect(nextPlayers.find(p => p.id === "p2").isAlive).toBe(false);
        expect(nextPlayers.find(p => p.id === "p3").isAlive).toBe(true);
        expect(nextPlayers.find(p => p.id === "p4").isAlive).toBe(true);
        expect(nextState).toBe(GameState.FINAL_DUEL);
    });
    it("선택하지 않은 플레이어는 탈락한다", () => {
        const players = createMockPlayers(["A", "B", "C"]);
        const selections = { p1: 1, p2: null, p3: 3 };
        const { nextPlayers } = GameEngine.processRound(players, selections, 3, 0, 1);
        expect(nextPlayers.find(p => p.id === "p1").isAlive).toBe(true);
        expect(nextPlayers.find(p => p.id === "p2").isAlive).toBe(false);
        expect(nextPlayers.find(p => p.id === "p3").isAlive).toBe(true);
    });
    it("잘못된 칸 번호를 선택하면 탈락 처리된다 (1 미만 또는 slotCount 초과)", () => {
        const players = createMockPlayers(["A", "B", "C"]);
        const selections = { p1: 1, p2: 5, p3: 3 };
        const { nextPlayers } = GameEngine.processRound(players, selections, 3, 0, 1);
        expect(nextPlayers.find(p => p.id === "p2").isAlive).toBe(false);
    });
    it("이미 탈락한 플레이어의 선택은 집계에 포함되지 않는다", () => {
        const players = createMockPlayers(["A", "B", "C"]);
        players[2].isAlive = false;
        const selections = { p1: 1, p2: 2, p3: 1 };
        const { nextPlayers } = GameEngine.processRound(players, selections, 3, 0, 1);
        expect(nextPlayers.find(p => p.id === "p1").isAlive).toBe(true);
        expect(nextPlayers.find(p => p.id === "p2").isAlive).toBe(true);
    });
    it("전원 탈락이 3회 연속 발생하면 다음 재경기에서는 칸 수가 1개 증가한다", () => {
        const players = createMockPlayers(["A", "B", "C"]);
        const selections = { p1: 1, p2: 1, p3: 1 };
        let run = GameEngine.processRound(players, selections, 3, 0, 1);
        expect(run.nextConsecutiveWipeCount).toBe(1);
        expect(run.nextSlotCount).toBe(3);
        run = GameEngine.processRound(run.nextPlayers, selections, run.nextSlotCount, run.nextConsecutiveWipeCount, 2);
        expect(run.nextConsecutiveWipeCount).toBe(2);
        expect(run.nextSlotCount).toBe(3);
        run = GameEngine.processRound(run.nextPlayers, selections, run.nextSlotCount, run.nextConsecutiveWipeCount, 3);
        expect(run.nextConsecutiveWipeCount).toBe(3);
        expect(run.nextSlotCount).toBe(4);
    });
    it("정상 생존자가 발생하면 전원 탈락 연속 횟수가 초기화된다", () => {
        const players = createMockPlayers(["A", "B", "C"]);
        const selectionsWipe = { p1: 1, p2: 1, p3: 1 };
        const selectionsNormal = { p1: 1, p2: 2, p3: 3 };
        let run = GameEngine.processRound(players, selectionsWipe, 3, 2, 1);
        expect(run.nextConsecutiveWipeCount).toBe(3);
        expect(run.nextSlotCount).toBe(4);
        run = GameEngine.processRound(run.nextPlayers, selectionsNormal, run.nextSlotCount, run.nextConsecutiveWipeCount, 2);
        expect(run.nextConsecutiveWipeCount).toBe(0);
    });
});
describe("GameEngine - processFinalDuelRound", () => {
    it("바위가 가위를 이김", () => {
        const players = createMockPlayers(["A", "B"]);
        const selections = { p1: "ROCK", p2: "SCISSORS" };
        const { nextPlayers, result } = GameEngine.processFinalDuelRound(players, selections, 1);
        expect(nextPlayers.find(p => p.id === "p1").score).toBe(1);
        expect(result.winnerId).toBe("p1");
    });
    it("바위가 보에게 짐", () => {
        const players = createMockPlayers(["A", "B"]);
        const selections = { p1: "ROCK", p2: "PAPER" };
        const { nextPlayers, result } = GameEngine.processFinalDuelRound(players, selections, 1);
        expect(nextPlayers.find(p => p.id === "p2").score).toBe(1);
        expect(result.winnerId).toBe("p2");
    });
    it("보가 바위를 이김", () => {
        const players = createMockPlayers(["A", "B"]);
        const selections = { p1: "PAPER", p2: "ROCK" };
        const { nextPlayers, result } = GameEngine.processFinalDuelRound(players, selections, 1);
        expect(nextPlayers.find(p => p.id === "p1").score).toBe(1);
        expect(result.winnerId).toBe("p1");
    });
    it("보가 가위에게 짐", () => {
        const players = createMockPlayers(["A", "B"]);
        const selections = { p1: "PAPER", p2: "SCISSORS" };
        const { nextPlayers, result } = GameEngine.processFinalDuelRound(players, selections, 1);
        expect(nextPlayers.find(p => p.id === "p2").score).toBe(1);
        expect(result.winnerId).toBe("p2");
    });
    it("가위가 보를 이김", () => {
        const players = createMockPlayers(["A", "B"]);
        const selections = { p1: "SCISSORS", p2: "PAPER" };
        const { nextPlayers, result } = GameEngine.processFinalDuelRound(players, selections, 1);
        expect(nextPlayers.find(p => p.id === "p1").score).toBe(1);
        expect(result.winnerId).toBe("p1");
    });
    it("가위가 바위에게 짐", () => {
        const players = createMockPlayers(["A", "B"]);
        const selections = { p1: "SCISSORS", p2: "ROCK" };
        const { nextPlayers, result } = GameEngine.processFinalDuelRound(players, selections, 1);
        expect(nextPlayers.find(p => p.id === "p2").score).toBe(1);
        expect(result.winnerId).toBe("p2");
    });
    it("같은 선택은 무승부", () => {
        const players = createMockPlayers(["A", "B"]);
        const selections = { p1: "ROCK", p2: "ROCK" };
        const { nextPlayers, result } = GameEngine.processFinalDuelRound(players, selections, 1);
        expect(nextPlayers.find(p => p.id === "p1").score).toBe(0);
        expect(nextPlayers.find(p => p.id === "p2").score).toBe(0);
        expect(result.winnerId).toBeNull();
    });
    it("승리 시 1점 증가", () => {
        const players = createMockPlayers(["A", "B"]);
        players[0].score = 0;
        const selections = { p1: "SCISSORS", p2: "PAPER" };
        const { nextPlayers } = GameEngine.processFinalDuelRound(players, selections, 1);
        expect(nextPlayers.find(p => p.id === "p1").score).toBe(1);
    });
    it("무승부 시 점수 유지", () => {
        const players = createMockPlayers(["A", "B"]);
        players[0].score = 1;
        players[1].score = 0;
        const selections = { p1: "ROCK", p2: "ROCK" };
        const { nextPlayers } = GameEngine.processFinalDuelRound(players, selections, 2);
        expect(nextPlayers.find(p => p.id === "p1").score).toBe(1);
        expect(nextPlayers.find(p => p.id === "p2").score).toBe(0);
    });
    it("먼저 2점 획득 시 최종 우승자 결정", () => {
        const players = createMockPlayers(["A", "B"]);
        players[0].score = 1;
        const selections = { p1: "SCISSORS", p2: "PAPER" };
        const { nextPlayers, nextState, winnerId } = GameEngine.processFinalDuelRound(players, selections, 2);
        expect(nextPlayers.find(p => p.id === "p1").score).toBe(2);
        expect(nextState).toBe(GameState.GAME_OVER);
        expect(winnerId).toBe("p1");
    });
    it("한 명만 시간 내 선택했을 때 해당 플레이어가 1점 획득", () => {
        const players = createMockPlayers(["A", "B"]);
        const selections = { p1: "ROCK", p2: null };
        const { nextPlayers, result } = GameEngine.processFinalDuelRound(players, selections, 1);
        expect(nextPlayers.find(p => p.id === "p1").score).toBe(1);
        expect(nextPlayers.find(p => p.id === "p2").score).toBe(0);
        expect(result.winnerId).toBe("p1");
    });
    it("둘 다 미선택이면 무승부", () => {
        const players = createMockPlayers(["A", "B"]);
        const selections = { p1: null, p2: null };
        const { nextPlayers, result } = GameEngine.processFinalDuelRound(players, selections, 1);
        expect(nextPlayers.find(p => p.id === "p1").score).toBe(0);
        expect(nextPlayers.find(p => p.id === "p2").score).toBe(0);
        expect(result.winnerId).toBeNull();
    });
});
