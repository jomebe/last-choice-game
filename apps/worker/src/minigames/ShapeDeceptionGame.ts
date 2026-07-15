import {
  Player,
  ShapeDeceptionPublicState,
  ShapeDeceptionPrivateState,
  ShapeOption,
  DrawingStroke,
  ChatMessage,
  MinigameResultRecord,
} from "last-choice-shared";
import {
  MinigameController,
  ValidationResult,
  MinigameResolveResult,
  generateInstanceId
} from "./registry.ts";

export interface ShapeDeceptionState {
  instanceId: string;
  questionerId: string;
  questionerNickname: string;
  options: ShapeOption[];        // 보기 3개 (A, B, C)
  correctOptionId: string;       // 정답 옵션 ID
  selections: Record<string, string | null>;  // playerId → optionId (추리자만)
  drawingStrokes: DrawingStroke[];
  chatMessages: ChatMessage[];
  lastQuestionerIds: string[];   // 연속 출제자 방지
  chatRateLimit: Record<string, number[]>;  // playerId → 최근 메시지 타임스탬프[]
}

export type ShapeDeceptionAction =
  | { type: 'SELECT_OPTION'; optionId: string }
  | { type: 'SEND_CHAT'; message: string }
  | { type: 'ADD_STROKES'; strokes: DrawingStroke[] }
  | { type: 'CLEAR_DRAWING' };

// 도형 속성 정의
interface ShapeDescriptor {
  shape: 'circle' | 'triangle' | 'square' | 'star' | 'hexagon' | 'diamond';
  fillStyle: 'empty' | 'filled' | 'striped' | 'dots';
  rotation: number;    // 0~360
  strokeWidth: number; // 1~4
  scale: number;       // 0.6~1.0
}

/** SVG 도형 생성 */
function generateShapeSvg(desc: ShapeDescriptor): string {
  const size = 100;
  const cx = 50;
  const cy = 50;
  const r = 35 * desc.scale;

  let shapePath = '';
  switch (desc.shape) {
    case 'circle':
      shapePath = `<circle cx="${cx}" cy="${cy}" r="${r}" />`;
      break;
    case 'square': {
      const half = r;
      shapePath = `<rect x="${cx - half}" y="${cy - half}" width="${half * 2}" height="${half * 2}" rx="3" />`;
      break;
    }
    case 'triangle': {
      const pts = [
        `${cx},${cy - r}`,
        `${cx - r * 0.866},${cy + r * 0.5}`,
        `${cx + r * 0.866},${cy + r * 0.5}`
      ].join(' ');
      shapePath = `<polygon points="${pts}" />`;
      break;
    }
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const angle = (i * Math.PI * 2) / 10 - Math.PI / 2;
        const radius = i % 2 === 0 ? r : r * 0.45;
        return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
      }).join(' ');
      shapePath = `<polygon points="${pts}" />`;
      break;
    }
    case 'hexagon': {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const angle = (i * Math.PI * 2) / 6 - Math.PI / 6;
        return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
      }).join(' ');
      shapePath = `<polygon points="${pts}" />`;
      break;
    }
    case 'diamond': {
      shapePath = `<polygon points="${cx},${cy - r} ${cx + r * 0.7},${cy} ${cx},${cy + r} ${cx - r * 0.7},${cy}" />`;
      break;
    }
  }

  const fillColor = desc.fillStyle === 'empty' ? 'none' : '#E2E8F0';
  const strokeColor = '#94A3B8';
  const sw = desc.strokeWidth;

  let patternDefs = '';
  let fillAttr = fillColor;

  if (desc.fillStyle === 'striped') {
    patternDefs = `<defs><pattern id="stripe" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="${strokeColor}" stroke-width="3"/>
    </pattern></defs>`;
    fillAttr = 'url(#stripe)';
  } else if (desc.fillStyle === 'dots') {
    patternDefs = `<defs><pattern id="dots" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="5" cy="5" r="2" fill="${strokeColor}"/>
    </pattern></defs>`;
    fillAttr = 'url(#dots)';
  }

  const rotateTransform = desc.rotation !== 0
    ? ` transform="rotate(${desc.rotation} ${cx} ${cy})"` : '';

  const shapeEl = shapePath.replace('<', `<`).replace(/\/>|>/, `${rotateTransform} fill="${fillAttr}" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${patternDefs}${shapeEl}</svg>`;
}

/** 세 가지 서로 다른 도형 옵션 생성 */
function generateOptions(rng: () => number): { options: ShapeOption[]; correctOptionId: string } {
  const shapes: ShapeDescriptor['shape'][] = ['circle', 'triangle', 'square', 'star', 'hexagon', 'diamond'];
  const fills: ShapeDescriptor['fillStyle'][] = ['empty', 'filled', 'striped', 'dots'];
  const rotations = [0, 30, 45, 60, 90, 120, 135, 180];
  const strokeWidths = [1, 2, 3, 4];

  // 3개의 서로 다른 도형을 만들되 구분 가능하게
  const usedShapes = new Set<string>();
  const optionIds = ['A', 'B', 'C'];
  const options: ShapeOption[] = [];

  for (const id of optionIds) {
    let desc: ShapeDescriptor;
    let attempts = 0;
    do {
      const shape = shapes[Math.floor(rng() * shapes.length)];
      const fill = fills[Math.floor(rng() * fills.length)];
      const rotation = rotations[Math.floor(rng() * rotations.length)];
      const strokeWidth = strokeWidths[Math.floor(rng() * strokeWidths.length)];
      const scale = 0.65 + rng() * 0.35;

      const key = `${shape}-${fill}`;
      if (!usedShapes.has(key) || attempts > 20) {
        usedShapes.add(key);
        desc = { shape, fillStyle: fill, rotation, strokeWidth, scale };
        break;
      }
      attempts++;
    } while (true);

    options.push({
      id,
      svgData: generateShapeSvg(desc!),
    });
  }

  const correctOptionId = optionIds[Math.floor(rng() * optionIds.length)];
  return { options, correctOptionId };
}

export class ShapeDeceptionGame implements MinigameController<ShapeDeceptionState, ShapeDeceptionAction> {
  readonly type = 'SHAPE_DECEPTION' as const;

  createInitialState(
    players: Player[],
    options?: { lastQuestionerIds?: string[]; seed?: number }
  ): ShapeDeceptionState {
    const alive = players.filter(p => p.isAlive);
    if (alive.length < 3) throw new Error('ShapeDeception requires at least 3 players');

    const rng = options?.seed !== undefined
      ? seededRng(options.seed)
      : Math.random;

    const lastIds = options?.lastQuestionerIds ?? [];
    // 최근 출제자가 아닌 플레이어 중 무작위 선택
    const candidates = alive.filter(p => !lastIds.includes(p.id));
    const pool = candidates.length > 0 ? candidates : alive;
    const questioner = pool[Math.floor(rng() * pool.length)];

    const { options: shapeOptions, correctOptionId } = generateOptions(rng);

    const selections: Record<string, string | null> = {};
    for (const p of alive) {
      if (p.id !== questioner.id) selections[p.id] = null;
    }

    return {
      instanceId: generateInstanceId(),
      questionerId: questioner.id,
      questionerNickname: questioner.nickname,
      options: shapeOptions,
      correctOptionId,
      selections,
      drawingStrokes: [],
      chatMessages: [],
      lastQuestionerIds: [...lastIds, questioner.id].slice(-3),
      chatRateLimit: {},
    };
  }

  validateAction(
    state: ShapeDeceptionState,
    playerId: string,
    action: ShapeDeceptionAction,
    alivePlayers: string[]
  ): ValidationResult {
    if (!alivePlayers.includes(playerId)) {
      return { valid: false, error: '생존 플레이어만 액션을 수행할 수 있습니다.' };
    }

    switch (action.type) {
      case 'SELECT_OPTION': {
        if (playerId === state.questionerId) {
          return { valid: false, error: '출제자는 선택할 수 없습니다.' };
        }
        if (!state.options.find(o => o.id === action.optionId)) {
          return { valid: false, error: '존재하지 않는 보기입니다.' };
        }
        return { valid: true };
      }
      case 'SEND_CHAT': {
        if (!action.message || action.message.trim().length === 0) {
          return { valid: false, error: '빈 메시지입니다.' };
        }
        if (action.message.length > 100) {
          return { valid: false, error: '메시지가 너무 깁니다 (최대 100자).' };
        }
        // 속도 제한: 5초 내 3개 이하
        const now = Date.now();
        const recent = (state.chatRateLimit[playerId] || []).filter(t => now - t < 5000);
        if (recent.length >= 3) {
          return { valid: false, error: '너무 빠르게 메시지를 보내고 있습니다.' };
        }
        return { valid: true };
      }
      case 'ADD_STROKES': {
        if (playerId !== state.questionerId) {
          return { valid: false, error: '출제자만 그림을 그릴 수 있습니다.' };
        }
        if (action.strokes.length > 10) {
          return { valid: false, error: '한 번에 너무 많은 스트로크입니다.' };
        }
        return { valid: true };
      }
      case 'CLEAR_DRAWING': {
        if (playerId !== state.questionerId) {
          return { valid: false, error: '출제자만 그림을 지울 수 있습니다.' };
        }
        return { valid: true };
      }
    }
  }

  applyAction(state: ShapeDeceptionState, playerId: string, action: ShapeDeceptionAction): ShapeDeceptionState {
    switch (action.type) {
      case 'SELECT_OPTION':
        return {
          ...state,
          selections: { ...state.selections, [playerId]: action.optionId }
        };
      case 'SEND_CHAT': {
        const now = Date.now();
        const player = state.questionerId === playerId
          ? { id: state.questionerId, nickname: state.questionerNickname }
          : null;

        const msg: ChatMessage = {
          playerId,
          nickname: player?.nickname ?? playerId,
          text: action.message.slice(0, 100),
          timestamp: now,
        };

        const prevTimes = state.chatRateLimit[playerId] || [];
        return {
          ...state,
          chatMessages: [...state.chatMessages.slice(-50), msg],
          chatRateLimit: {
            ...state.chatRateLimit,
            [playerId]: [...prevTimes.filter(t => now - t < 5000), now].slice(-10)
          }
        };
      }
      case 'ADD_STROKES':
        return {
          ...state,
          drawingStrokes: [...state.drawingStrokes, ...action.strokes].slice(-200)
        };
      case 'CLEAR_DRAWING':
        return { ...state, drawingStrokes: [] };
    }
  }

  shouldResolve(state: ShapeDeceptionState, alivePlayers: string[]): boolean {
    // 출제자를 제외한 추리자 모두 선택 완료 시
    const guessers = alivePlayers.filter(id => id !== state.questionerId);
    return guessers.length > 0 && guessers.every(id => state.selections[id] !== null && state.selections[id] !== undefined);
  }

  resolve(state: ShapeDeceptionState, players: Player[], roundNumber: number): MinigameResolveResult {
    const alive = players.filter(p => p.isAlive);
    const guessers = alive.filter(p => p.id !== state.questionerId);

    const survivors: string[] = [state.questionerId]; // 출제자는 항상 생존
    const eliminated: string[] = [];

    for (const p of guessers) {
      const sel = state.selections[p.id];
      if (sel === state.correctOptionId) {
        survivors.push(p.id);
      } else {
        eliminated.push(p.id);
      }
    }

    const publicSummary = `정답: ${state.correctOptionId} | 정답자 ${survivors.length - 1}명 생존`;

    const resultRecord: MinigameResultRecord = {
      instanceId: state.instanceId,
      type: 'SHAPE_DECEPTION',
      round: roundNumber,
      survivors,
      eliminated,
      isVoid: false,
      publicSummary,
    };

    return { survivors, eliminated, isVoid: false, resultRecord };
  }

  createPublicView(state: ShapeDeceptionState, phase: 'PLAYING' | 'REVEALING' | 'RESULT'): ShapeDeceptionPublicState {
    const guessers = Object.keys(state.selections);
    const submittedCount = Object.values(state.selections).filter(v => v !== null).length;

    return {
      type: 'SHAPE_DECEPTION',
      instanceId: state.instanceId,
      questioner: state.questionerId,
      questionerNickname: state.questionerNickname,
      options: state.options,
      submittedCount,
      drawingStrokes: state.drawingStrokes,
      chatMessages: state.chatMessages,
    };
  }

  createPrivateView(state: ShapeDeceptionState, playerId: string, phase: string): ShapeDeceptionPrivateState {
    const isQuestioner = playerId === state.questionerId;
    return {
      type: 'SHAPE_DECEPTION',
      isQuestioner,
      // 출제자에게만 정답 전달, 결과 공개 전까지 추리자에게는 null
      correctOptionId: isQuestioner || phase === 'REVEALING' || phase === 'RESULT'
        ? state.correctOptionId
        : null,
      mySelection: isQuestioner ? null : (state.selections[playerId] ?? null),
    };
  }
}

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}
