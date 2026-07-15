import { z } from "zod";

// ─────────────────────────────────────────────
// 미니게임 타입
// ─────────────────────────────────────────────
export type MinigameType =
  | 'UNIQUE_SLOT'
  | 'MINORITY_BUTTON'
  | 'SHAPE_DECEPTION'
  | 'ROCK_PAPER_SCISSORS';

// ─────────────────────────────────────────────
// 게임 상태
// ─────────────────────────────────────────────
export enum GameState {
  LOBBY            = "LOBBY",
  COUNTDOWN        = "COUNTDOWN",        // 레거시 카운트다운
  MINIGAME_INTRO   = "MINIGAME_INTRO",   // 미니게임 시작 전 인트로 (2~3초)
  PLAYING          = "PLAYING",           // 미니게임 진행 중
  REVEALING        = "REVEALING",         // 결과 공개 중
  ROUND_RESULT     = "ROUND_RESULT",     // 레거시 라운드 결과
  MINIGAME_RESULT  = "MINIGAME_RESULT",   // 미니게임 결과 화면
  FINAL_DUEL       = "FINAL_DUEL",        // 가위바위보 결승 (레거시 호환)
  GAME_OVER        = "GAME_OVER"
}

// ─────────────────────────────────────────────
// 가위바위보 타입 (레거시 유지)
// ─────────────────────────────────────────────
export const finalChoiceSchema = z.enum(["ROCK", "PAPER", "SCISSORS"]);
export type FinalChoice = z.infer<typeof finalChoiceSchema>;

// ─────────────────────────────────────────────
// 플레이어
// ─────────────────────────────────────────────
export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
  isAlive: boolean;
  score: number;
  disconnectedAt: number | null;
}

// ─────────────────────────────────────────────
// 미니게임별 공개 상태 (discriminated union)
// ─────────────────────────────────────────────

export interface UniqueSlotPublicState {
  type: 'UNIQUE_SLOT';
  instanceId: string;
  slotCount: number;
  submittedCount: number;
  selections?: Record<string, number | null>; // 공개/결과 페이즈용
}

export interface MinorityButtonPublicState {
  type: 'MINORITY_BUTTON';
  instanceId: string;
  buttons: MinorityButton[];
  submittedCount: number;
  selections?: Record<string, string | null>; // 공개/결과 페이즈용
}

export interface MinorityButton {
  id: string;
  label: string;   // "1", "2", ... 또는 기호
  color: string;   // 색상 hex
}

export interface ShapeDeceptionPublicState {
  type: 'SHAPE_DECEPTION';
  instanceId: string;
  questioner: string;           // 출제자 playerId
  questionerNickname: string;
  options: ShapeOption[];       // 보기 3개 (모든 추리자에게 동일)
  submittedCount: number;       // 추리자 중 선택 완료 수
  drawingStrokes: DrawingStroke[];
  chatMessages: ChatMessage[];
  selections?: Record<string, string | null>; // 공개/결과 페이즈용
  correctOptionId?: string | null;            // 공개/결과 페이즈용
}

export interface ShapeOption {
  id: string;     // 'A' | 'B' | 'C'
  svgData: string; // SVG 문자열
}

export interface DrawingStroke {
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  isErase: boolean;
}

export interface ChatMessage {
  playerId: string;
  nickname: string;
  text: string;
  timestamp: number;
}

export interface RpsPublicState {
  type: 'ROCK_PAPER_SCISSORS';
  instanceId: string;
  round: number;
  scores: Record<string, number>;
  submittedCount: number;
  playerIds: [string, string];
}

export type MinigamePublicState =
  | UniqueSlotPublicState
  | MinorityButtonPublicState
  | ShapeDeceptionPublicState
  | RpsPublicState;

// ─────────────────────────────────────────────
// 미니게임별 개인 상태 (discriminated union)
// ─────────────────────────────────────────────

export interface UniqueSlotPrivateState {
  type: 'UNIQUE_SLOT';
  mySelection: number | null;
}

export interface MinorityButtonPrivateState {
  type: 'MINORITY_BUTTON';
  mySelection: string | null;  // buttonId
}

export interface ShapeDeceptionPrivateState {
  type: 'SHAPE_DECEPTION';
  isQuestioner: boolean;
  correctOptionId: string | null;  // 출제자에게만 전달, 추리자는 null
  mySelection: string | null;      // 추리자 선택 optionId
}

export interface RpsPrivateState {
  type: 'ROCK_PAPER_SCISSORS';
  myChoice: FinalChoice | null;
}

export type MinigamePrivateState =
  | UniqueSlotPrivateState
  | MinorityButtonPrivateState
  | ShapeDeceptionPrivateState
  | RpsPrivateState;

// ─────────────────────────────────────────────
// 미니게임 런타임 상태 (서버 내부용)
// ─────────────────────────────────────────────
export interface MinigameRuntime {
  instanceId: string;
  type: MinigameType;
  round: number;             // 전체 게임 내 미니게임 순서 (1-indexed)
  startedAt: number;
  endsAt: number;
  phase: 'INTRO' | 'PLAYING' | 'REVEALING' | 'RESULT';
}

// ─────────────────────────────────────────────
// 기존 라운드/결승 결과 (레거시 유지)
// ─────────────────────────────────────────────
export interface RoundSelectionInfo {
  playerId: string;
  nickname: string;
  slotSelected: number | null;
  isAliveAfterRound: boolean;
}

export interface RoundResult {
  roundNumber: number;
  slotCount: number;
  selections: RoundSelectionInfo[];
  aliveCountAfterRound: number;
  isWipeout: boolean;
}

export interface FinalRoundResult {
  roundNumber: number;
  p1Selection: FinalChoice | null;
  p2Selection: FinalChoice | null;
  winnerId: string | null;
}

// ─────────────────────────────────────────────
// 미니게임 결과 (공개 후)
// ─────────────────────────────────────────────
export interface MinigameResultRecord {
  instanceId: string;
  type: MinigameType;
  round: number;
  survivors: string[];   // playerId[]
  eliminated: string[];  // playerId[]
  isVoid: boolean;       // 무효 처리 여부 (전원 탈락 등)
  voidReason?: string;
  publicSummary: string; // 화면 표시용 결과 요약
}

// ─────────────────────────────────────────────
// 공개 방 뷰포트
// ─────────────────────────────────────────────
export interface PublicRoomView {
  roomCode: string;
  gameState: GameState;
  players: Player[];
  hostPlayerId: string;
  currentRound: number;
  selectableSlotCount: number;  // 레거시 필드 유지
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  consecutiveWipeCount: number;
  winnerId: string | null;
  roundResults: RoundResult[];        // 레거시 (UNIQUE_SLOT 결과 포함)
  finalDuelResults: FinalRoundResult[]; // 레거시 (RPS 결과)
  submittedCount: number;             // 레거시
  serverTimestamp: number;            // 서버 현재 시간 동기화용 필드

  // 미니게임 시스템 필드
  currentMinigame: MinigamePublicState | null;
  minigameIntroInfo: MinigameIntroInfo | null;  // MINIGAME_INTRO 상태에서만
  minigameResults: MinigameResultRecord[];       // 전체 미니게임 결과 기록
  minigameQueue: MinigameType[];                 // 남은 미니게임 순서 (공개)
}

export interface MinigameIntroInfo {
  type: MinigameType;
  displayName: string;
  description: string;
  durationSec: number;
  aliveCount: number;
}

// ─────────────────────────────────────────────
// 개인 플레이어 뷰포트
// ─────────────────────────────────────────────
export interface PrivatePlayerView {
  playerId: string;
  currentSelection: number | null;          // 레거시 (UNIQUE_SLOT)
  finalChoiceSelection: FinalChoice | null;  // 레거시 (RPS)
  sessionToken: string;
  minigamePrivate: MinigamePrivateState | null;  // 현재 미니게임 개인 상태
}

export interface GameRoomPayload {
  room: PublicRoomView;
  me: PrivatePlayerView;
}

// ─────────────────────────────────────────────
// 가위바위보 결승 상태 (레거시 유지)
// ─────────────────────────────────────────────
export interface FinalDuelState {
  playerIds: [string, string];
  scores: Record<string, number>;
  round: number;
  roundStartedAt: number;
  roundEndsAt: number;
  choices: Partial<Record<string, FinalChoice>>;
  previousResult?: FinalRoundResult;
}

// ─────────────────────────────────────────────
// WebSocket 클라이언트 → 서버 메시지 스키마
// ─────────────────────────────────────────────

export const ClientMsgCreateSchema = z.object({
  type: z.literal("CREATE_ROOM"),
  nickname: z.string().min(2).max(12).regex(/^[a-zA-Z0-9가-힣\s-_]+$/)
});

export const ClientMsgJoinSchema = z.object({
  type: z.literal("JOIN_ROOM"),
  roomCode: z.string().length(6),
  nickname: z.string().min(2).max(12).regex(/^[a-zA-Z0-9가-힣\s-_]+$/)
});

export const ClientMsgStartGameSchema = z.object({
  type: z.literal("START_GAME")
});

export const ClientMsgToggleReadySchema = z.object({
  type: z.literal("TOGGLE_READY")
});

// 레거시 UNIQUE_SLOT 선택 (미니게임 instanceId 포함)
export const ClientMsgSubmitSelectionSchema = z.object({
  type: z.literal("SUBMIT_SELECTION"),
  slot: z.number().int().positive(),
  minigameInstanceId: z.string().optional()
});

// 레거시 RPS (미니게임 instanceId 포함)
export const ClientMsgSubmitFinalChoiceSchema = z.object({
  type: z.literal("SUBMIT_FINAL_CHOICE"),
  choice: finalChoiceSchema,
  minigameInstanceId: z.string().optional()
});

// 미니게임 전용 액션들
export const ClientMsgSubmitMinorityButtonSchema = z.object({
  type: z.literal("SUBMIT_MINORITY_BUTTON"),
  minigameInstanceId: z.string(),
  buttonId: z.string().max(32)
});

export const ClientMsgSubmitShapeGuessSchema = z.object({
  type: z.literal("SUBMIT_SHAPE_GUESS"),
  minigameInstanceId: z.string(),
  optionId: z.string().max(4)
});

export const ClientMsgSendShapeChatSchema = z.object({
  type: z.literal("SEND_SHAPE_CHAT"),
  minigameInstanceId: z.string(),
  message: z.string().min(1).max(100)
});

const DrawingPointSchema = z.object({
  x: z.number().min(0).max(1),  // 정규화된 좌표 (0~1)
  y: z.number().min(0).max(1)
});

const DrawingStrokeSchema = z.object({
  points: z.array(DrawingPointSchema).max(500),
  color: z.string().max(10),
  width: z.number().min(1).max(20),
  isErase: z.boolean()
});

export const ClientMsgSendDrawingStrokesSchema = z.object({
  type: z.literal("SEND_DRAWING_STROKES"),
  minigameInstanceId: z.string(),
  strokes: z.array(DrawingStrokeSchema).max(10)
});

export const ClientMsgClearDrawingSchema = z.object({
  type: z.literal("CLEAR_DRAWING"),
  minigameInstanceId: z.string()
});

export const ClientMsgReconnectSchema = z.object({
  type: z.literal("RECONNECT"),
  roomCode: z.string().length(6),
  playerId: z.string(),
  sessionToken: z.string()
});

export const ClientMsgLeaveRoomSchema = z.object({
  type: z.literal("LEAVE_ROOM")
});

export const ClientMsgPlayAgainSchema = z.object({
  type: z.literal("PLAY_AGAIN")
});

export const ClientMsgPingSchema = z.object({
  type: z.literal("PING")
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  ClientMsgCreateSchema,
  ClientMsgJoinSchema,
  ClientMsgStartGameSchema,
  ClientMsgToggleReadySchema,
  ClientMsgSubmitSelectionSchema,
  ClientMsgSubmitFinalChoiceSchema,
  ClientMsgSubmitMinorityButtonSchema,
  ClientMsgSubmitShapeGuessSchema,
  ClientMsgSendShapeChatSchema,
  ClientMsgSendDrawingStrokesSchema,
  ClientMsgClearDrawingSchema,
  ClientMsgReconnectSchema,
  ClientMsgLeaveRoomSchema,
  ClientMsgPlayAgainSchema,
  ClientMsgPingSchema
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ─────────────────────────────────────────────
// WebSocket 서버 → 클라이언트 메시지
// ─────────────────────────────────────────────

export const ServerMsgRoomStateSchema = z.object({
  type: z.literal("ROOM_STATE"),
  payload: z.custom<GameRoomPayload>()
});

export const ServerMsgErrorSchema = z.object({
  type: z.literal("ERROR"),
  message: z.string()
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  ServerMsgRoomStateSchema,
  ServerMsgErrorSchema
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
