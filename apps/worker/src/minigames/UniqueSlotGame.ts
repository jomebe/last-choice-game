import {
  Player,
  UniqueSlotPublicState,
  UniqueSlotPrivateState,
  MinigameResultRecord,
} from "last-choice-shared";
import {
  MinigameController,
  ValidationResult,
  MinigameResolveResult,
  generateInstanceId
} from "./registry.ts";

export interface UniqueSlotState {
  instanceId: string;
  slotCount: number;
  selections: Record<string, number | null>;  // playerId → slot
  startedAt: number;
  consecutiveWipeCount: number;
}

export type UniqueSlotAction = {
  type: 'SELECT_SLOT';
  slot: number;
};

export class UniqueSlotGame implements MinigameController<UniqueSlotState, UniqueSlotAction> {
  readonly type = 'UNIQUE_SLOT' as const;

  createInitialState(players: Player[], options?: { consecutiveWipeCount?: number }): UniqueSlotState {
    const alive = players.filter(p => p.isAlive);
    const slotCount = Math.max(2, alive.length);
    const selections: Record<string, number | null> = {};
    for (const p of alive) selections[p.id] = null;

    return {
      instanceId: generateInstanceId(),
      slotCount,
      selections,
      startedAt: Date.now(),
      consecutiveWipeCount: options?.consecutiveWipeCount ?? 0,
    };
  }

  validateAction(
    state: UniqueSlotState,
    playerId: string,
    action: UniqueSlotAction,
    alivePlayers: string[]
  ): ValidationResult {
    if (!alivePlayers.includes(playerId)) {
      return { valid: false, error: '생존 플레이어만 선택할 수 있습니다.' };
    }
    if (!(playerId in state.selections)) {
      return { valid: false, error: '이 미니게임 참가자가 아닙니다.' };
    }
    if (action.slot < 1 || action.slot > state.slotCount) {
      return { valid: false, error: `1~${state.slotCount} 사이의 칸을 선택하세요.` };
    }
    return { valid: true };
  }

  applyAction(state: UniqueSlotState, playerId: string, action: UniqueSlotAction): UniqueSlotState {
    return {
      ...state,
      selections: { ...state.selections, [playerId]: action.slot }
    };
  }

  shouldResolve(state: UniqueSlotState, alivePlayers: string[]): boolean {
    // 모든 생존 플레이어가 선택 완료하면 즉시 판정
    return alivePlayers.every(id => state.selections[id] !== null && state.selections[id] !== undefined);
  }

  resolve(state: UniqueSlotState, players: Player[], roundNumber: number): MinigameResolveResult {
    const alive = players.filter(p => p.isAlive);

    // 칸별 집계
    const slotMap: Record<number, string[]> = {};
    for (let s = 1; s <= state.slotCount; s++) slotMap[s] = [];
    for (const p of alive) {
      const sel = state.selections[p.id];
      if (sel !== null && sel !== undefined && sel >= 1 && sel <= state.slotCount) {
        slotMap[sel].push(p.id);
      }
    }

    // 생존자 판정
    const survivors: string[] = [];
    const eliminated: string[] = [];
    for (const p of alive) {
      const sel = state.selections[p.id];
      if (sel !== null && sel !== undefined && slotMap[sel]?.length === 1) {
        survivors.push(p.id);
      } else {
        eliminated.push(p.id);
      }
    }

    const isVoid = survivors.length === 0;
    let voidReason: string | undefined;
    if (isVoid) {
      voidReason = '전원 탈락 — 미니게임 무효 처리';
    }

    const publicSummary = isVoid
      ? '전원 탈락! 다시 도전합니다.'
      : `${survivors.length}명 생존 / ${eliminated.length}명 탈락`;

    const resultRecord: MinigameResultRecord = {
      instanceId: state.instanceId,
      type: 'UNIQUE_SLOT',
      round: roundNumber,
      survivors: isVoid ? alive.map(p => p.id) : survivors,
      eliminated: isVoid ? [] : eliminated,
      isVoid,
      voidReason,
      publicSummary,
    };

    return { survivors, eliminated, isVoid, voidReason, resultRecord };
  }

  createPublicView(state: UniqueSlotState, phase: 'PLAYING' | 'REVEALING' | 'RESULT'): UniqueSlotPublicState {
    const submittedCount = Object.values(state.selections).filter(v => v !== null).length;
    return {
      type: 'UNIQUE_SLOT',
      instanceId: state.instanceId,
      slotCount: state.slotCount,
      submittedCount,
      selections: phase !== 'PLAYING' ? state.selections : undefined,
    };
  }

  createPrivateView(state: UniqueSlotState, playerId: string, _phase: string): UniqueSlotPrivateState {
    return {
      type: 'UNIQUE_SLOT',
      mySelection: state.selections[playerId] ?? null,
    };
  }
}
