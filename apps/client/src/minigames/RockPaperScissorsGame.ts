import {
  Player,
  FinalChoice,
  RpsPublicState,
  RpsPrivateState,
  FinalRoundResult,
  MinigameResultRecord,
} from "../../../packages/shared/src/types.ts";
import {
  MinigameController,
  ValidationResult,
  MinigameResolveResult,
  generateInstanceId
} from "./registry.ts";

export interface RpsState {
  instanceId: string;
  round: number;           // 가위바위보 라운드 (1, 2, 3...)
  playerIds: [string, string];
  scores: Record<string, number>;
  choices: Partial<Record<string, FinalChoice>>;
  results: FinalRoundResult[];
  startedAt: number;
}

export type RpsAction = {
  type: 'SELECT_CHOICE';
  choice: FinalChoice;
};

export class RockPaperScissorsGame implements MinigameController<RpsState, RpsAction> {
  readonly type = 'ROCK_PAPER_SCISSORS' as const;

  createInitialState(players: Player[]): RpsState {
    const alive = players.filter(p => p.isAlive);
    if (alive.length !== 2) throw new Error('RPS requires exactly 2 players');

    const playerIds: [string, string] = [alive[0].id, alive[1].id];
    const scores: Record<string, number> = {
      [playerIds[0]]: alive[0].score ?? 0,
      [playerIds[1]]: alive[1].score ?? 0,
    };

    return {
      instanceId: generateInstanceId(),
      round: 1,
      playerIds,
      scores,
      choices: {},
      results: [],
      startedAt: Date.now(),
    };
  }

  validateAction(
    state: RpsState,
    playerId: string,
    action: RpsAction,
    alivePlayers: string[]
  ): ValidationResult {
    if (!state.playerIds.includes(playerId)) {
      return { valid: false, error: '결승전 참가자가 아닙니다.' };
    }
    if (!['ROCK', 'PAPER', 'SCISSORS'].includes(action.choice)) {
      return { valid: false, error: '유효하지 않은 선택입니다.' };
    }
    return { valid: true };
  }

  applyAction(state: RpsState, playerId: string, action: RpsAction): RpsState {
    return {
      ...state,
      choices: { ...state.choices, [playerId]: action.choice }
    };
  }

  shouldResolve(state: RpsState, _alivePlayers: string[]): boolean {
    return state.playerIds.every(id => state.choices[id] !== undefined);
  }

  resolve(state: RpsState, players: Player[], roundNumber: number): MinigameResolveResult {
    const [p1Id, p2Id] = state.playerIds;
    const s1 = state.choices[p1Id] ?? null;
    const s2 = state.choices[p2Id] ?? null;

    let roundWinnerId: string | null = null;

    if (s1 && !s2) {
      roundWinnerId = p1Id;
    } else if (!s1 && s2) {
      roundWinnerId = p2Id;
    } else if (s1 && s2) {
      const outcome = resolveFinalDuel(s1, s2);
      if (outcome === 'FIRST') roundWinnerId = p1Id;
      else if (outcome === 'SECOND') roundWinnerId = p2Id;
    }

    // 점수 업데이트
    const newScores = { ...state.scores };
    if (roundWinnerId) newScores[roundWinnerId] = (newScores[roundWinnerId] ?? 0) + 1;

    // 2점 달성 시 게임 종료
    const gameWinnerId = newScores[p1Id] >= 2 ? p1Id : (newScores[p2Id] >= 2 ? p2Id : null);

    const roundResult: FinalRoundResult = {
      roundNumber: state.round,
      p1Selection: s1,
      p2Selection: s2,
      winnerId: roundWinnerId
    };

    // 결승에서는 탈락자가 생기지 않음 (게임 종료 시 패배자가 탈락)
    const survivors = gameWinnerId ? [gameWinnerId] : state.playerIds;
    const eliminated = gameWinnerId ? state.playerIds.filter(id => id !== gameWinnerId) : [];

    const publicSummary = gameWinnerId
      ? `결승 종료 — 우승자 결정!`
      : `무승부 또는 라운드 진행 중`;

    const resultRecord: MinigameResultRecord = {
      instanceId: state.instanceId,
      type: 'ROCK_PAPER_SCISSORS',
      round: roundNumber,
      survivors,
      eliminated,
      isVoid: false,
      publicSummary,
    };

    return {
      survivors: gameWinnerId ? [gameWinnerId] : state.playerIds.slice(),
      eliminated: gameWinnerId ? state.playerIds.filter(id => id !== gameWinnerId) : [],
      isVoid: false,
      resultRecord
    };
  }

  createPublicView(state: RpsState, _phase: string): RpsPublicState {
    const submittedCount = state.playerIds.filter(id => state.choices[id] !== undefined).length;
    return {
      type: 'ROCK_PAPER_SCISSORS',
      round: state.round,
      scores: state.scores,
      submittedCount,
      playerIds: state.playerIds,
    };
  }

  createPrivateView(state: RpsState, playerId: string, phase: string): RpsPrivateState {
    return {
      type: 'ROCK_PAPER_SCISSORS',
      myChoice: (state.choices[playerId] as FinalChoice) ?? null,
    };
  }
}

function resolveFinalDuel(first: FinalChoice, second: FinalChoice): 'FIRST' | 'SECOND' | 'DRAW' {
  if (first === second) return 'DRAW';
  if (first === 'ROCK') return second === 'SCISSORS' ? 'FIRST' : 'SECOND';
  if (first === 'PAPER') return second === 'ROCK' ? 'FIRST' : 'SECOND';
  if (first === 'SCISSORS') return second === 'PAPER' ? 'FIRST' : 'SECOND';
  return 'DRAW';
}
