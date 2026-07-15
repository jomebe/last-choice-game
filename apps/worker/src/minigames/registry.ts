import {
  MinigameType,
  Player,
  MinigamePublicState,
  MinigamePrivateState,
  MinigameResultRecord,
  DrawingStroke,
  ChatMessage,
} from "last-choice-shared";

// ─────────────────────────────────────────────
// 미니게임 컨트롤러 인터페이스
// ─────────────────────────────────────────────
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface MinigameController<TState, TAction> {
  readonly type: MinigameType;
  createInitialState(players: Player[], options?: unknown): TState;
  validateAction(state: TState, playerId: string, action: TAction, alivePlayers: string[]): ValidationResult;
  applyAction(state: TState, playerId: string, action: TAction): TState;
  shouldResolve(state: TState, alivePlayers: string[]): boolean;
  resolve(state: TState, players: Player[], roundNumber: number): MinigameResolveResult;
  createPublicView(state: TState, phase: 'PLAYING' | 'REVEALING' | 'RESULT'): MinigamePublicState;
  createPrivateView(state: TState, playerId: string, phase: 'PLAYING' | 'REVEALING' | 'RESULT'): MinigamePrivateState;
}

export interface MinigameResolveResult {
  survivors: string[];     // playerId[]
  eliminated: string[];    // playerId[]
  isVoid: boolean;
  voidReason?: string;
  resultRecord: MinigameResultRecord;
}

// ─────────────────────────────────────────────
// 미니게임 순서 생성
// ─────────────────────────────────────────────
const NORMAL_MINIGAMES: MinigameType[] = ['UNIQUE_SLOT', 'MINORITY_BUTTON', 'SHAPE_DECEPTION'];

/**
 * 미니게임 순서 생성 규칙:
 * - ROCK_PAPER_SCISSORS는 포함하지 않음
 * - 같은 미니게임이 연속 2회 나오지 않도록
 * - 모든 일반 미니게임이 최소 한 번씩 등장하려고 시도
 * - aliveCount가 3 미만이면 SHAPE_DECEPTION 제외
 */
export function generateMinigameSequence(
  aliveCount: number,
  maxRounds: number = 9,
  seed?: number
): MinigameType[] {
  const rng = seed !== undefined ? seededRng(seed) : Math.random;
  const sequence: MinigameType[] = [];
  const available = getAvailableGames(aliveCount);
  const notYetSeen = new Set(available);
  let last: MinigameType | null = null;

  for (let i = 0; i < maxRounds; i++) {
    let candidates = available.filter(g => g !== last);
    if (candidates.length === 0) candidates = available;

    // 아직 등장하지 않은 게임 우선
    const unseen = candidates.filter(g => notYetSeen.has(g));
    const pool = unseen.length > 0 ? unseen : candidates;

    const chosen = pool[Math.floor(rng() * pool.length)];
    sequence.push(chosen);
    notYetSeen.delete(chosen);
    last = chosen;
  }

  return sequence;
}

export function getAvailableGames(aliveCount: number): MinigameType[] {
  if (aliveCount < 3) return ['UNIQUE_SLOT', 'MINORITY_BUTTON'];
  return [...NORMAL_MINIGAMES];
}

/**
 * 다음 실행할 미니게임 결정
 * - 생존자 2명 → ROCK_PAPER_SCISSORS
 * - 생존자 1명 이하 → null (게임 종료)
 * - 생존자 3명 이상 → 큐에서 꺼내거나 새로 결정
 */
export function pickNextMinigame(
  queue: MinigameType[],
  aliveCount: number,
  lastMinigame: MinigameType | null,
  consecutiveVoidCount: number
): { next: MinigameType | null; remainingQueue: MinigameType[] } {
  if (aliveCount <= 1) return { next: null, remainingQueue: [] };
  if (aliveCount === 2) return { next: 'ROCK_PAPER_SCISSORS', remainingQueue: [] };

  if (queue.length > 0) {
    const [next, ...rest] = queue;
    // SHAPE_DECEPTION는 3명 이상 필요
    if (next === 'SHAPE_DECEPTION' && aliveCount < 3) {
      // 스킵하고 다음 것 사용
      return pickNextMinigame(rest, aliveCount, lastMinigame, consecutiveVoidCount);
    }
    return { next, remainingQueue: rest };
  }

  // 큐 소진 → 새로 무작위 선택 (연속 같은 게임 방지)
  const available = getAvailableGames(aliveCount).filter(g => g !== lastMinigame);
  const candidates = available.length > 0 ? available : getAvailableGames(aliveCount);
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return { next: chosen, remainingQueue: [] };
}

// ─────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function generateInstanceId(): string {
  return crypto.randomUUID();
}

export const MINIGAME_DISPLAY_NAMES: Record<MinigameType, string> = {
  UNIQUE_SLOT: '혼자 골라야 산다',
  MINORITY_BUTTON: '가장 적은 선택은 탈락',
  SHAPE_DECEPTION: '진짜 모양을 찾아라',
  ROCK_PAPER_SCISSORS: '최후의 선택'
};

export const MINIGAME_DESCRIPTIONS: Record<MinigameType, string> = {
  UNIQUE_SLOT: '같은 칸을 고른 사람은 모두 탈락합니다.',
  MINORITY_BUTTON: '가장 적게 선택된 버튼을 누른 사람은 모두 탈락합니다.',
  SHAPE_DECEPTION: '출제자의 말과 그림을 보고 정답 모양을 선택하세요.',
  ROCK_PAPER_SCISSORS: '가위바위보 2점 선승제로 최종 승자를 결정합니다.'
};
