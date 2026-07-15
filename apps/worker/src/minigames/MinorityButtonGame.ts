import {
  Player,
  MinorityButtonPublicState,
  MinorityButtonPrivateState,
  MinorityButton,
  MinigameResultRecord,
} from "last-choice-shared";
import {
  MinigameController,
  ValidationResult,
  MinigameResolveResult,
  generateInstanceId
} from "./registry.ts";

export interface MinorityButtonState {
  instanceId: string;
  buttons: MinorityButton[];
  selections: Record<string, string | null>;  // playerId → buttonId
  startedAt: number;
}

export type MinorityButtonAction = {
  type: 'SELECT_BUTTON';
  buttonId: string;
};

const BUTTON_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96E6A1', '#DDA0DD', '#F7DC6F'];
const BUTTON_LABELS = ['①', '②', '③', '④', '⑤', '⑥'];

export class MinorityButtonGame implements MinigameController<MinorityButtonState, MinorityButtonAction> {
  readonly type = 'MINORITY_BUTTON' as const;

  createInitialState(players: Player[]): MinorityButtonState {
    const alive = players.filter(p => p.isAlive);
    // 버튼 수: max(2, min(6, aliveCount - 1)) → 항상 최소 2개, 최대 6개
    const buttonCount = Math.min(6, Math.max(2, alive.length - 1));

    const buttons: MinorityButton[] = Array.from({ length: buttonCount }, (_, i) => ({
      id: `btn_${i + 1}`,
      label: BUTTON_LABELS[i],
      color: BUTTON_COLORS[i],
    }));

    const selections: Record<string, string | null> = {};
    for (const p of alive) selections[p.id] = null;

    return {
      instanceId: generateInstanceId(),
      buttons,
      selections,
      startedAt: Date.now(),
    };
  }

  validateAction(
    state: MinorityButtonState,
    playerId: string,
    action: MinorityButtonAction,
    alivePlayers: string[]
  ): ValidationResult {
    if (!alivePlayers.includes(playerId)) {
      return { valid: false, error: '생존 플레이어만 선택할 수 있습니다.' };
    }
    if (!(playerId in state.selections)) {
      return { valid: false, error: '이 미니게임 참가자가 아닙니다.' };
    }
    if (!state.buttons.find(b => b.id === action.buttonId)) {
      return { valid: false, error: '존재하지 않는 버튼입니다.' };
    }
    return { valid: true };
  }

  applyAction(state: MinorityButtonState, playerId: string, action: MinorityButtonAction): MinorityButtonState {
    return {
      ...state,
      selections: { ...state.selections, [playerId]: action.buttonId }
    };
  }

  shouldResolve(state: MinorityButtonState, alivePlayers: string[]): boolean {
    return alivePlayers.every(id => state.selections[id] !== null && state.selections[id] !== undefined);
  }

  resolve(state: MinorityButtonState, players: Player[], roundNumber: number): MinigameResolveResult {
    const alive = players.filter(p => p.isAlive);

    // 버튼별 선택자 집계
    const buttonChoosers: Record<string, string[]> = {};
    for (const btn of state.buttons) buttonChoosers[btn.id] = [];

    for (const p of alive) {
      const sel = state.selections[p.id];
      if (sel && buttonChoosers[sel]) {
        buttonChoosers[sel].push(p.id);
      }
    }

    // 선택된 버튼만 (선택자 1명 이상)
    const chosenButtons = state.buttons.filter(b => buttonChoosers[b.id].length > 0);

    // 모두 같은 버튼 선택 → 무효
    if (chosenButtons.length === 1) {
      const survivors = alive.map(p => p.id);
      const resultRecord: MinigameResultRecord = {
        instanceId: state.instanceId,
        type: 'MINORITY_BUTTON',
        round: roundNumber,
        survivors,
        eliminated: [],
        isVoid: true,
        voidReason: '모두 같은 선택을 하여 무효',
        publicSummary: '모두 같은 버튼을 선택했습니다! 무효 처리됩니다.',
      };
      return { survivors, eliminated: [], isVoid: true, voidReason: '모두 같은 선택을 하여 무효', resultRecord };
    }

    // 최소 선택 인원수 계산
    const minCount = Math.min(...chosenButtons.map(b => buttonChoosers[b.id].length));

    // 최소 선택 버튼을 선택한 플레이어 → 탈락
    const eliminatedSet = new Set<string>();
    for (const btn of chosenButtons) {
      if (buttonChoosers[btn.id].length === minCount) {
        for (const pid of buttonChoosers[btn.id]) eliminatedSet.add(pid);
      }
    }

    // 미선택자도 탈락
    for (const p of alive) {
      if (!state.selections[p.id]) eliminatedSet.add(p.id);
    }

    const eliminated = Array.from(eliminatedSet);
    const survivors = alive.map(p => p.id).filter(id => !eliminatedSet.has(id));

    // 전원 탈락이면 무효
    const isVoid = survivors.length === 0;

    const publicSummary = isVoid
      ? '전원 탈락! 다른 미니게임으로 넘어갑니다.'
      : `${survivors.length}명 생존 / ${eliminated.length}명 탈락`;

    const resultRecord: MinigameResultRecord = {
      instanceId: state.instanceId,
      type: 'MINORITY_BUTTON',
      round: roundNumber,
      survivors: isVoid ? alive.map(p => p.id) : survivors,
      eliminated: isVoid ? [] : eliminated,
      isVoid,
      voidReason: isVoid ? '전원 탈락 — 미니게임 무효 처리' : undefined,
      publicSummary,
    };

    return { survivors, eliminated, isVoid, resultRecord };
  }

  createPublicView(state: MinorityButtonState, phase: 'PLAYING' | 'REVEALING' | 'RESULT'): MinorityButtonPublicState {
    const submittedCount = Object.values(state.selections).filter(v => v !== null).length;
    return {
      type: 'MINORITY_BUTTON',
      instanceId: state.instanceId,
      buttons: state.buttons,
      submittedCount,
    };
  }

  createPrivateView(state: MinorityButtonState, playerId: string, _phase: string): MinorityButtonPrivateState {
    return {
      type: 'MINORITY_BUTTON',
      mySelection: state.selections[playerId] ?? null,
    };
  }
}
